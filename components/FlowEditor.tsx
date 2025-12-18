
import React, { useRef, useState, useEffect } from 'react';
import { FlowData, FlowNode, Viewport } from '../types';
import NodeShape from './NodeShape';
import { ZoomIn, ZoomOut, Move, Download, Copy, Trash2, Split, Database, FileText, Monitor, Square, PlayCircle, StopCircle, RectangleHorizontal, Image as ImageIcon, MousePointer2, Info, X, Sparkles, RefreshCw, Loader2 } from 'lucide-react';

interface FlowEditorProps {
  data: FlowData;
  isDirty: boolean;
  isRefining: boolean;
  onReviseSOP: () => void;
  onUpdateNodePosition: (nodeId: string, x: number, y: number) => void;
  onUpdateNodeSize: (nodeId: string, width: number, height: number) => void;
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
  onUpdateNodePosition,
  onUpdateNodeSize,
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.button === 0 || e.button === 1) && !draggingNode && !resizeState && !connectionState) {
      setIsDraggingCanvas(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
      if (e.target === svgRef.current) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent, nodeId: string, handle: string) => {
      e.stopPropagation();
      const node = data.nodes.find(n => n.id === nodeId);
      if (!node) return;

      setResizeState({
          nodeId, handle, startPos: { x: e.clientX, y: e.clientY },
          startDims: { x: node.x, y: node.y, width: node.width || 180, height: node.height || 80 }
      });
  };

  const handleConnectorMouseDown = (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const startX = (e.clientX - viewport.x) / viewport.zoom;
      const startY = (e.clientY - viewport.y) / viewport.zoom;
      setConnectionState({ sourceNodeId: nodeId, startX, startY, currX: startX, currY: startY });
      setSelectedNode(nodeId);
      setSelectedEdge(null);
  };

  const handleNodeMouseUp = (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      if (connectionState) {
          if (connectionState.sourceNodeId !== nodeId) {
              onAddEdge(connectionState.sourceNodeId, nodeId);
          }
          setConnectionState(null);
      } else {
          setDraggingNode(null);
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

  const handleMouseMove = (e: React.MouseEvent) => {
    const mouseX = (e.clientX - viewport.x) / viewport.zoom;
    const mouseY = (e.clientY - viewport.y) / viewport.zoom;

    if (connectionState) {
        setConnectionState(prev => prev ? { ...prev, currX: mouseX, currY: mouseY } : null);
        return;
    }

    if (isDraggingCanvas) {
      const dx = e.clientX - lastMousePos.x;
      const dy = (e.clientY - lastMousePos.y) / viewport.zoom;
      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (draggingNode) {
      const dx = (e.clientX - lastMousePos.x) / viewport.zoom;
      const dy = (e.clientY - lastMousePos.y) / viewport.zoom;
      const node = data.nodes.find(n => n.id === draggingNode);
      if (node) onUpdateNodePosition(draggingNode, node.x + dx, node.y + dy);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (resizeState) {
        const dx = (e.clientX - resizeState.startPos.x) / viewport.zoom;
        const dy = (e.clientY - resizeState.startPos.y) / viewport.zoom;
        const { startDims, handle } = resizeState;
        let newW = startDims.width, newH = startDims.height, newX = startDims.x, newY = startDims.y;
        const MIN_W = 80, MIN_H = 40;

        if (handle.includes('e')) { newW = Math.max(MIN_W, startDims.width + dx); newX = startDims.x + (newW - startDims.width) / 2; }
        else if (handle.includes('w')) { newW = Math.max(MIN_W, startDims.width - dx); newX = startDims.x - (newW - startDims.width) / 2; }

        if (handle.includes('s')) { newH = Math.max(MIN_H, startDims.height + dy); newY = startDims.y + (newH - startDims.height) / 2; }
        else if (handle.includes('n')) { newH = Math.max(MIN_H, startDims.height - dy); newY = startDims.y - (newH - startDims.height) / 2; }

        onUpdateNodeSize(resizeState.nodeId, newW, newH);
        onUpdateNodePosition(resizeState.nodeId, newX, newY);
    }
  };

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
    setDraggingNode(null);
    setResizeState(null);
    setConnectionState(null); 
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
          {/* HUGE invisible path for easier selection of all lines including erect ones */}
          <path
            d={pathData}
            stroke="transparent"
            strokeWidth="60"
            fill="none"
            className="cursor-pointer"
            style={{ pointerEvents: 'all' }}
            onMouseDown={(e) => handleEdgeMouseDown(e, edge.id)}
          />
          {isHovered && !isSelected && (
              <path
                d={pathData}
                stroke="#fda4af"
                strokeWidth="10"
                fill="none"
                className="opacity-40"
                pointerEvents="none"
              />
          )}
          <path
            d={pathData}
            stroke={isSelected ? "#e11d48" : "#94a3b8"}
            strokeWidth={isSelected ? "5" : "2.5"}
            fill="none"
            markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
            className="transition-all duration-200 pointer-events-none"
            filter={isSelected ? "url(#edge-glow)" : "none"}
          />
          {isSelected && (
              <g transform={`translate(${btnX}, ${btnY})`} className="animate-in fade-in zoom-in-95 duration-200">
                  <circle 
                    r="20" fill="#e11d48" className="shadow-2xl cursor-pointer hover:fill-red-700 hover:scale-110 transition-all" 
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onDeleteEdge(edge.id);
                      setSelectedEdge(null);
                    }} 
                  />
                  <path d="M-6 -6 L6 6 M-6 6 L6 -6" stroke="white" strokeWidth="3.5" strokeLinecap="round" className="pointer-events-none" />
              </g>
          )}
        </g>
      );
    });
  };

  const ToolButton = ({ icon: Icon, label, onClick, active }: any) => (
    <button 
      onClick={onClick} 
      className={`p-2.5 rounded-lg flex items-center justify-center transition-all duration-200 group relative ${active ? 'bg-rose-100 text-rose-600 shadow-inner' : 'text-slate-500 hover:bg-slate-100 hover:text-rose-600 hover:scale-105'}`}
    >
      <Icon size={20} strokeWidth={2} />
      <span className="absolute right-full mr-3 bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl transition-opacity">
        {label}
        <span className="absolute top-1/2 -right-1 -mt-1 border-4 border-transparent border-l-slate-800"></span>
      </span>
    </button>
  );

  return (
    <div className="relative w-full h-full bg-[#f8fafc] overflow-hidden print:overflow-visible">
        {isDirty && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-500">
                <button 
                    onClick={onReviseSOP}
                    disabled={isRefining}
                    className="flex items-center gap-3 px-6 py-3 bg-white text-rose-600 border-2 border-rose-500 rounded-full font-bold shadow-2xl hover:scale-105 active:scale-95 transition-all group overflow-hidden"
                >
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
            {(selectedNode || selectedEdge) && (
                 <div className="bg-white/80 backdrop-blur-xl p-2 rounded-2xl shadow-xl shadow-red-200/20 border border-white/50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-200">
                     <button onClick={() => {
                         if (selectedNode) onDeleteNode(selectedNode);
                         else if (selectedEdge) onDeleteEdge(selectedEdge);
                         setSelectedNode(null);
                         setSelectedEdge(null);
                     }} className="p-2.5 hover:bg-red-50 text-red-500 rounded-lg flex items-center justify-center transition-colors" title="Delete Selected">
                        <Trash2 size={20} />
                     </button>
                 </div>
            )}
        </div>

      <svg
        ref={svgRef}
        className={`w-full h-full print:w-auto print:h-auto print:absolute print:top-0 print:left-0 ${connectionState ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
          <marker id="arrowhead-selected" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#e11d48" />
          </marker>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#cbd5e1" /></pattern>
          <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#64748b" floodOpacity="0.15"/></filter>
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#e11d48" floodOpacity="0.4"/></filter>
          <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
          <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)" className="print:hidden pointer-events-none" />
          {renderEdges()}
          {connectionState && (
              <line x1={connectionState.startX} y1={connectionState.startY} x2={connectionState.currX} y2={connectionState.currY} stroke="#e11d48" strokeWidth="2.5" strokeDasharray="6,4" pointerEvents="none" />
          )}
          {data.nodes.map(node => (
            <NodeShape key={node.id} node={node} selected={selectedNode === node.id} onMouseDown={handleNodeMouseDown} onResizeMouseDown={handleResizeMouseDown} onLabelChange={onNodeLabelChange} onConnectorMouseDown={handleConnectorMouseDown} onNodeMouseUp={handleNodeMouseUp} />
          ))}
        </g>
      </svg>
      <div className="absolute bottom-6 left-6 flex flex-col gap-2 max-w-sm pointer-events-none print:hidden">
        <div className="bg-white/80 backdrop-blur-md p-3 rounded-xl border border-white/40 shadow-sm flex items-start gap-2 animate-in slide-in-from-bottom-2 duration-500">
            <MousePointer2 size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Flow Manipulation</p>
                <ul className="text-[10px] text-slate-500 space-y-0.5 list-disc pl-3">
                    <li><b>Connector Selection:</b> Click any line (including erect/vertical ones) to highlight and delete.</li>
                    <li><b>SOP Sync:</b> Click the floating button at the top to apply your design changes to the SOP document.</li>
                </ul>
            </div>
        </div>
      </div>
    </div>
  );
};

export default FlowEditor;
