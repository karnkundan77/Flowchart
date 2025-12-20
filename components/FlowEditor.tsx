
import React, { useRef, useState, useEffect } from 'react';
import { FlowData, FlowNode, Viewport } from '../types';
import NodeShape from './NodeShape';
import { 
  ZoomIn, ZoomOut, Move, Download, Copy, Trash2, Split, Database, FileText, 
  Monitor, Square, PlayCircle, StopCircle, MousePointer2, Info, Sparkles, 
  RefreshCw, Loader2, Image as ImageIcon, Printer, Check, FileDown
} from 'lucide-react';

interface FlowEditorProps {
  data: FlowData;
  isDirty: boolean;
  isRefining: boolean;
  onReviseSOP: () => void;
  onUpdateNodeGeometry: (nodeId: string, updates: { x?: number, y?: number, width?: number, height?: number }) => void;
  onNodeLabelChange: (nodeId: string, newLabel: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onAddNode: (type: FlowNode['type'], x: number, y: number) => void;
  onAddEdge: (source: string, target: string) => void;
}

interface ResizeState {
    nodeId: string;
    handle: string;
    startPos: { x: number; y: number };
    startDims: { x: number; y: number; width: number; height: number };
}

interface ConnectionState {
    sourceNodeId: string;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
}

const FlowEditor: React.FC<FlowEditorProps> = ({ 
  data, 
  isDirty,
  isRefining,
  onReviseSOP,
  onUpdateNodeGeometry,
  onNodeLabelChange,
  onDeleteNode,
  onDeleteEdge,
  onAddNode,
  onAddEdge
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [showWordSuccess, setShowWordSuccess] = useState(false);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (connectionState) {
          const mouseX = (e.clientX - viewport.x) / viewport.zoom;
          const mouseY = (e.clientY - viewport.y) / viewport.zoom;
          setConnectionState(prev => prev ? { ...prev, currX: mouseX, currY: mouseY } : null);
          return;
      }

      if (isDraggingCanvas) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setLastMousePos({ x: e.clientX, y: e.clientY });
      } else if (draggingNode) {
        const dx = (e.clientX - lastMousePos.x) / viewport.zoom;
        const dy = (e.clientY - lastMousePos.y) / viewport.zoom;
        const node = data.nodes.find(n => n.id === draggingNode);
        if (node) onUpdateNodeGeometry(draggingNode, { x: node.x + dx, y: node.y + dy });
        setLastMousePos({ x: e.clientX, y: e.clientY });
      } else if (resizeState) {
          const dx = (e.clientX - resizeState.startPos.x) / viewport.zoom;
          const dy = (e.clientY - resizeState.startPos.y) / viewport.zoom;
          const { startDims, handle } = resizeState;
          
          let newW = startDims.width;
          let newH = startDims.height;
          let newX = startDims.x;
          let newY = startDims.y;
          
          const MIN_W = 60;
          const MIN_H = 30;

          if (handle.includes('e')) {
              newW = Math.max(MIN_W, startDims.width + dx);
              newX = startDims.x + (newW - startDims.width) / 2;
          } else if (handle.includes('w')) {
              newW = Math.max(MIN_W, startDims.width - dx);
              newX = startDims.x - (newW - startDims.width) / 2;
          }

          if (handle.includes('s')) {
              newH = Math.max(MIN_H, startDims.height + dy);
              newY = startDims.y + (newH - startDims.height) / 2;
          } else if (handle.includes('n')) {
              newH = Math.max(MIN_H, startDims.height - dy);
              newY = startDims.y - (newH - startDims.height) / 2;
          }

          onUpdateNodeGeometry(resizeState.nodeId, { x: newX, y: newY, width: newW, height: newH });
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingCanvas(false);
      setDraggingNode(null);
      setResizeState(null);
      setConnectionState(null); 
    };

    if (isDraggingCanvas || draggingNode || resizeState || connectionState) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingCanvas, draggingNode, resizeState, connectionState, lastMousePos, viewport, data.nodes, onUpdateNodeGeometry]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target === svgRef.current || target.getAttribute('fill')?.includes('grid')) {
        setSelectedNode(null);
        setSelectedEdge(null);
    }

    if ((e.button === 0 || e.button === 1) && !draggingNode && !resizeState && !connectionState) {
      setIsDraggingCanvas(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  /**
   * Generates a "cleaned" SVG clone specifically for PNG export.
   * Root Cause Fix: Strips all 'filter' attributes because they taint the canvas.
   */
  const getCleanSVGForExport = (): { svgString: string, width: number, height: number } | null => {
    if (!svgRef.current) return null;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    
    // 1. Remove background grid and UI buttons
    const grid = clone.querySelector('rect[fill="url(#grid)"]');
    if (grid) grid.remove();
    const uiElements = clone.querySelectorAll('rect[class*="resize"], circle[class*="cursor-crosshair"], g.opacity-0');
    uiElements.forEach(el => el.remove());

    // 2. Clear tainting styles and inject standard fonts
    const oldStyles = clone.querySelectorAll('style, link');
    oldStyles.forEach(s => s.remove());

    const style = document.createElement('style');
    style.textContent = `
      * { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; box-sizing: border-box; }
      .break-words { overflow-wrap: break-word; word-wrap: break-word; width: 100%; white-space: pre-wrap; }
      foreignObject div { color: #1e293b !important; display: flex !important; align-items: center !important; justify-content: center !important; height: 100% !important; text-align: center !important; font-size: 14px !important; line-height: 1.2 !important; background: transparent !important; }
      /* Ensure markers are visible */
      path { stroke-linecap: round; stroke-linejoin: round; }
    `;
    clone.prepend(style);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    
    // 3. PHYSICALLY REMOVE FILTERS
    // This is the absolute requirement to avoid 'Tainted Canvas' errors in Chrome/Safari.
    const allElements = clone.querySelectorAll('*');
    allElements.forEach(el => {
      el.removeAttribute('filter');
    });

    // 4. Calculate content bounding box
    const bbox = svgRef.current.getBBox();
    const padding = 80;
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    clone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
    clone.setAttribute('width', width.toString());
    clone.setAttribute('height', height.toString());
    
    return {
      svgString: new XMLSerializer().serializeToString(clone),
      width,
      height
    };
  };

  /**
   * Generates a PNG blob. Resolves security errors by using a "clean" SVG source.
   */
  const generatePNGBlob = async (): Promise<Blob | null> => {
    const cleanData = getCleanSVGForExport();
    if (!cleanData) return null;

    return new Promise((resolve) => {
      const img = new Image();
      const svgBlob = new Blob([cleanData.svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 3.0; // High resolution
        canvas.width = cleanData.width * scale;
        canvas.height = cleanData.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        
        try {
          canvas.toBlob((blob) => resolve(blob), "image/png");
        } catch (e) {
          console.error("PNG security block caught:", e);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  };

  const handleExportPNG = async () => {
    setIsExporting(true);
    const blob = await generatePNGBlob();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `flowchart-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowExportSuccess(true);
      setTimeout(() => setShowExportSuccess(false), 2000);
    } else {
      alert("PNG generation was blocked by browser security. This typically happens if the diagram is extremely complex. Please use 'Download PDF' for a professional result.");
    }
    setIsExporting(false);
  };

  const handleCopyToClipboard = async () => {
    setIsExporting(true);
    const blob = await generatePNGBlob();
    if (blob) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setShowCopySuccess(true);
        setTimeout(() => setShowCopySuccess(false), 2000);
      } catch (err) {
        alert("Unable to copy to clipboard. Try 'Download PNG' instead.");
      }
    }
    setIsExporting(false);
  };

  const handleDownloadWord = async () => {
    setIsExporting(true);
    const blob = await generatePNGBlob();
    if (blob) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Png = reader.result as string;
        const html = `
          <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
          <head><meta charset='utf-8'><title>Flowchart Export</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40pt; text-align: center; } 
            h1 { color: #e11d48; font-size: 24pt; border-bottom: 2pt solid #e11d48; padding-bottom: 10pt; margin-bottom: 30pt; }
            .img-box { margin: 20pt auto; display: inline-block; padding: 10pt; border: 1px solid #f1f5f9; }
            img { max-width: 100%; height: auto; }
            .footer { color: #94a3b8; font-size: 9pt; margin-top: 40pt; }
          </style>
          </head><body>
          <h1>${data.sop?.title || 'Process Map'}</h1>
          <div class="img-box"><img src="${base64Png}" /></div>
          <p class="footer">Created by FlowGen AI</p>
          </body></html>
        `;
        const wordBlob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(wordBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `flowchart-${Date.now()}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setShowWordSuccess(true);
        setTimeout(() => setShowWordSuccess(false), 2000);
      };
      reader.readAsDataURL(blob);
    }
    setIsExporting(false);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, nodeId: string, handle: string) => {
      e.stopPropagation();
      const node = data.nodes.find(n => n.id === nodeId);
      if (!node) return;
      setResizeState({
          nodeId, handle, startPos: { x: e.clientX, y: e.clientY },
          startDims: { x: node.x, y: node.y, width: node.width || 180, height: node.height || 80 }
      });
      setSelectedNode(nodeId);
      setSelectedEdge(null);
  };

  const handleConnectorMouseDown = (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const startX = (e.clientX - viewport.x) / viewport.zoom;
      const startY = (e.clientY - viewport.y) / viewport.zoom;
      setConnectionState({ sourceNodeId: nodeId, startX, startY, currX: startX, currY: startY });
      setSelectedNode(null); 
      setSelectedEdge(null);
  };

  const handleNodeMouseUp = (e: React.MouseEvent, nodeId: string) => {
      if (connectionState) {
          if (connectionState.sourceNodeId !== nodeId) {
              onAddEdge(connectionState.sourceNodeId, nodeId);
          }
          setConnectionState(null);
      }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation(); 
    setDraggingNode(nodeId);
    setSelectedNode(nodeId);
    setSelectedEdge(null);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleEdgeMouseDown = (e: React.MouseEvent, edgeId: string) => {
    e.stopPropagation();
    setSelectedEdge(edgeId);
    setSelectedNode(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newZoom = Math.min(Math.max(viewport.zoom + delta, 0.1), 3);
        setViewport(prev => ({ ...prev, zoom: newZoom }));
    } else {
        setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;
      if (e.key === 'Escape') {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode) { onDeleteNode(selectedNode); setSelectedNode(null); }
        else if (selectedEdge) { onDeleteEdge(selectedEdge); setSelectedEdge(null); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, selectedEdge, onDeleteNode, onDeleteEdge]);

  const handleAddNodeClick = (type: FlowNode['type']) => {
      const offset = Math.random() * 40 - 20;
      const cx = (-viewport.x + window.innerWidth / 2) / viewport.zoom + offset;
      const cy = (-viewport.y + window.innerHeight / 2) / viewport.zoom + offset;
      onAddNode(type, cx, cy);
  };

  const getAnchorPoint = (node: FlowNode, target: FlowNode) => {
     const dx = target.x - node.x;
     const dy = target.y - node.y;
     const absDx = Math.abs(dx);
     const absDy = Math.abs(dy);
     let x = node.x, y = node.y, dir = 'bottom';
     const w = node.width || 180, h = node.height || 80;

     if (absDx > absDy) {
         if (dx > 0) { x = node.x + w/2; dir = 'right'; }
         else { x = node.x - w/2; dir = 'left'; }
     } else {
         if (dy > 0) { y = node.y + h/2; dir = 'bottom'; }
         else { y = node.y - h/2; dir = 'top'; }
     }
     return { x, y, dir };
  };

  const renderEdges = () => {
    return data.edges.map(edge => {
      const source = data.nodes.find(n => n.id === edge.source);
      const target = data.nodes.find(n => n.id === edge.target);
      if (!source || !target) return null;

      const start = getAnchorPoint(source, target);
      const end = getAnchorPoint(target, source);

      let c1x = start.x, c1y = start.y, c2x = end.x, c2y = end.y;
      const dist = Math.hypot(end.x - start.x, end.y - start.y) * 0.5;

      switch(start.dir) {
          case 'right': c1x += dist; break;
          case 'left': c1x -= dist; break;
          case 'bottom': c1y += dist; break;
          case 'top': c1y -= dist; break;
      }
      switch(end.dir) {
          case 'right': c2x += dist; break;
          case 'left': c2x -= dist; break;
          case 'bottom': c2y += dist; break;
          case 'top': c2y -= dist; break;
      }

      const pathData = `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;
      const isSelected = selectedEdge === edge.id;
      const isHovered = hoveredEdge === edge.id;

      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      
      const isVertical = Math.abs(start.x - end.x) < 30;
      const btnX = isVertical ? midX + 40 : midX;
      const btnY = isVertical ? midY : midY - 40;

      return (
        <g key={edge.id} onMouseEnter={() => setHoveredEdge(edge.id)} onMouseLeave={() => setHoveredEdge(null)}>
          <path d={pathData} stroke="transparent" strokeWidth="40" fill="none" className="cursor-pointer" style={{ pointerEvents: 'all' }} onMouseDown={(e) => handleEdgeMouseDown(e, edge.id)} />
          {isHovered && !isSelected && ( <path d={pathData} stroke="#fda4af" strokeWidth="10" fill="none" className="opacity-40" pointerEvents="none" /> )}
          <path d={pathData} stroke={isSelected ? "#e11d48" : "#94a3b8"} strokeWidth={isSelected ? "5" : "2.5"} fill="none" markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)"} className="transition-all duration-200 pointer-events-none" filter={isSelected ? "url(#edge-glow)" : "none"} />
          {isSelected && (
              <g transform={`translate(${btnX}, ${btnY})`} className="animate-in fade-in zoom-in-95 duration-200">
                  <circle r="20" fill="#e11d48" className="shadow-2xl cursor-pointer hover:fill-red-700 hover:scale-110 transition-all" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onDeleteEdge(edge.id); setSelectedEdge(null); }} />
                  <path d="M-6 -6 L6 6 M-6 6 L6 -6" stroke="white" strokeWidth="3.5" strokeLinecap="round" className="pointer-events-none" />
              </g>
          )}
        </g>
      );
    });
  };

  const ToolButton = ({ icon: Icon, label, onClick, active, variant = 'default', disabled = false }: any) => (
    <button onClick={onClick} disabled={disabled} className={`p-2.5 rounded-lg flex items-center justify-center transition-all duration-200 group relative ${disabled ? 'opacity-30 cursor-not-allowed' : variant === 'primary' ? 'bg-rose-600 text-white shadow-lg hover:bg-rose-700' : active ? 'bg-rose-100 text-rose-600 shadow-inner' : 'text-slate-500 hover:bg-slate-100 hover:text-rose-600 hover:scale-105'}`} >
      <Icon size={20} strokeWidth={2} />
      <span className="absolute right-full mr-3 bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl transition-opacity">
        {label}
        <span className="absolute top-1/2 -right-1 -mt-1 border-4 border-transparent border-l-slate-800"></span>
      </span>
    </button>
  );

  return (
    <div className="relative w-full h-full bg-[#f8fafc] overflow-hidden flow-editor-container">
        {isDirty && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-500 print:hidden">
                <button onClick={onReviseSOP} disabled={isRefining} className="flex items-center gap-3 px-6 py-3 bg-white text-rose-600 border-2 border-rose-500 rounded-full font-bold shadow-2xl hover:scale-105 active:scale-95 transition-all group overflow-hidden">
                    <div className="absolute inset-0 bg-rose-50 group-hover:bg-rose-100 transition-colors" />
                    <div className="relative flex items-center gap-3">
                        {isRefining ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 animate-bounce" />}
                        <span className="text-sm tracking-tight font-bold">{isRefining ? 'UPDATING SOP...' : 'UPDATE SOP FROM FLOWCHART'}</span>
                        {!isRefining && <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />}
                    </div>
                </button>
            </div>
        )}

        <div className="absolute top-6 right-6 flex flex-col gap-4 z-10 print:hidden">
            <div className="bg-white/80 backdrop-blur-xl p-2 rounded-2xl shadow-xl shadow-slate-200/50 border border-white/50 flex flex-col gap-1">
                <ToolButton icon={PlayCircle} label="Start" onClick={() => handleAddNodeClick('start')} />
                <ToolButton icon={StopCircle} label="End" onClick={() => handleAddNodeClick('end')} />
                <ToolButton icon={Square} label="Action" onClick={() => handleAddNodeClick('process')} />
                <ToolButton icon={Split} label="Decision" onClick={() => handleAddNodeClick('decision')} />
                <ToolButton icon={Monitor} label="Data" onClick={() => handleAddNodeClick('data')} />
                <ToolButton icon={FileText} label="Doc" onClick={() => handleAddNodeClick('document')} />
                <ToolButton icon={Database} label="DB" onClick={() => handleAddNodeClick('database')} />
            </div>
            <div className="bg-white/80 backdrop-blur-xl p-2 rounded-2xl shadow-xl shadow-slate-200/50 border border-white/50 flex flex-col gap-1">
                <ToolButton icon={ZoomIn} label="Zoom In" onClick={() => setViewport(v => ({ ...v, zoom: Math.min(v.zoom + 0.1, 3) }))} />
                <ToolButton icon={ZoomOut} label="Zoom Out" onClick={() => setViewport(v => ({ ...v, zoom: Math.max(v.zoom - 0.1, 0.1) }))} />
                <ToolButton icon={Move} label="Reset View" onClick={() => setViewport(v => ({ ...v, x: 0, y: 0, zoom: 1 }))} />
            </div>
            <div className="bg-white/80 backdrop-blur-xl p-2 rounded-2xl shadow-xl shadow-slate-200/50 border border-white/50 flex flex-col gap-1">
                <ToolButton icon={showExportSuccess ? Check : isExporting ? Loader2 : ImageIcon} label={showExportSuccess ? "Saved!" : "Download PNG"} onClick={handleExportPNG} disabled={isExporting} />
                <ToolButton icon={showCopySuccess ? Check : Copy} label={showCopySuccess ? "Copied!" : "Copy Image"} onClick={handleCopyToClipboard} />
                <ToolButton icon={showWordSuccess ? Check : FileDown} label={showWordSuccess ? "Saved!" : "Download Word (.doc)"} onClick={handleDownloadWord} />
                <ToolButton icon={Printer} label="Download PDF (via Browser Print)" onClick={() => window.print()} />
            </div>
        </div>

      <svg ref={svgRef} className={`w-full h-full ${connectionState ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`} onMouseDown={handleMouseDown} onWheel={handleWheel} >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#94a3b8" /></marker>
          <marker id="arrowhead-selected" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#e11d48" /></marker>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#cbd5e1" /></pattern>
          <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#64748b" floodOpacity="0.15"/></filter>
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#e11d48" floodOpacity="0.4"/></filter>
          <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
          <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)" className="print:hidden pointer-events-none" />
          {renderEdges()}
          {connectionState && ( <line x1={connectionState.startX} y1={connectionState.startY} x2={connectionState.currX} y2={connectionState.currY} stroke="#e11d48" strokeWidth="2.5" strokeDasharray="6,4" pointerEvents="none" /> )}
          {data.nodes.map(node => (
            <NodeShape key={node.id} node={node} selected={selectedNode === node.id} onMouseDown={handleNodeMouseDown} onResizeMouseDown={handleResizeMouseDown} onLabelChange={onNodeLabelChange} onUpdateNodeGeometry={onUpdateNodeGeometry} onConnectorMouseDown={handleConnectorMouseDown} onNodeMouseUp={handleNodeMouseUp} />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default FlowEditor;
