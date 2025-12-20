
import React, { useState, useEffect, useRef } from 'react';
import { Bot, Play, Loader2, Info, Eraser, Sparkles, FileText, PenLine, Copy, Check, Download, RefreshCw, Zap, ZapOff, History as HistoryIcon, Trash2, Clock, Printer } from 'lucide-react';
import { FlowData, FlowNode, FlowEdge, ProcessingStatus } from './types';
import { generateFlowFromText, refineSOPFromFlow } from './services/geminiService';
import { calculateLayout } from './utils/layout';
import FlowEditor from './components/FlowEditor';

interface HistoryItem {
  id: string;
  timestamp: number;
  data: FlowData;
  description: string;
}

const App: React.FC = () => {
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [isRefiningSOP, setIsRefiningSOP] = useState(false);
  const [flowData, setFlowData] = useState<FlowData>({ nodes: [], edges: [] });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'sop' | 'history'>('editor');
  const [copied, setCopied] = useState(false);
  const [includeSOP, setIncludeSOP] = useState(true);
  const [autoSync, setAutoSync] = useState(false); 
  const [isDirty, setIsDirty] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  const isInitialGen = useRef(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedHistory = localStorage.getItem('flowgen_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('flowgen_history', JSON.stringify(history));
  }, [history]);

  const saveToHistory = (data: FlowData, desc: string) => {
    const newItem: HistoryItem = {
      id: `hist-${Date.now()}`,
      timestamp: Date.now(),
      data: JSON.parse(JSON.stringify(data)), 
      description: desc || data.sop?.title || 'Untitled Process'
    };
    setHistory(prev => [newItem, ...prev.slice(0, 19)]);
  };

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setStatus(ProcessingStatus.GENERATING);
    setErrorMsg(null);
    try {
      const rawData = await generateFlowFromText(description, includeSOP);
      const layoutData = calculateLayout(rawData);
      isInitialGen.current = true;
      setFlowData(layoutData);
      setIsDirty(false);
      setStatus(ProcessingStatus.SUCCESS);
      saveToHistory(layoutData, description.substring(0, 50) + (description.length > 50 ? '...' : ''));
      if (includeSOP) setActiveTab('sop');
      else setActiveTab('editor');
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong.");
      setStatus(ProcessingStatus.ERROR);
    }
  };

  const handleRefineSOP = async () => {
    if (flowData.nodes.length === 0) return;
    setIsRefiningSOP(true);
    try {
      const newSOP = await refineSOPFromFlow(flowData.nodes, flowData.edges);
      const updatedData = { ...flowData, sop: newSOP };
      setFlowData(updatedData);
      setIsDirty(false);
      saveToHistory(updatedData, `Updated: ${updatedData.sop?.title || 'Procedure'}`);
    } catch (err: any) {
      setErrorMsg("Refinement failed. Please try again.");
    } finally {
      setIsRefiningSOP(false);
    }
  };

  useEffect(() => {
    if (flowData.nodes.length === 0) return;
    if (isInitialGen.current) { isInitialGen.current = false; return; }
    setIsDirty(true);
    if (autoSync) {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => { handleRefineSOP(); }, 5000);
    }
    return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
  }, [
    JSON.stringify(flowData.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, w: n.width, h: n.height }))),
    JSON.stringify(flowData.edges.map(e => ({ id: e.id, s: e.source, t: e.target })))
  ]);

  const loadFromHistory = (item: HistoryItem) => {
    isInitialGen.current = true;
    setFlowData(JSON.parse(JSON.stringify(item.data)));
    setIsDirty(false);
    setActiveTab('editor');
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const updateNodeGeometry = (nodeId: string, updates: { x?: number, y?: number, width?: number, height?: number }) => {
    setFlowData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n)
    }));
  };

  const updateNodeLabel = (nodeId: string, newLabel: string) => {
    setFlowData(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, label: newLabel } : n) }));
  };
  const deleteNode = (nodeId: string) => {
    setFlowData(prev => ({ ...prev, nodes: prev.nodes.filter(n => n.id !== nodeId), edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId) }));
  };
  const deleteEdge = (edgeId: string) => {
    setFlowData(prev => ({ ...prev, edges: prev.edges.filter(e => e.id !== edgeId) }));
  };
  const addNode = (type: FlowNode['type'], x: number, y: number) => {
    const labels: Record<string, string> = { 'start': 'Start', 'end': 'End', 'process': 'Action Step', 'decision': 'Decision?', 'data': 'Input/Output', 'document': 'Generate Doc', 'database': 'Storage', 'manual-input': 'User Input', 'predefined-process': 'Sub-Flow' };
    const newNode: FlowNode = { id: `node-${Date.now()}`, type, label: labels[type] || 'New Node', x, y, width: 180, height: 80 };
    setFlowData(prev => ({ ...prev, nodes: [...prev.nodes, newNode] }));
  };
  const addEdge = (source: string, target: string) => {
    if (source === target) return;
    if (flowData.edges.some(e => e.source === source && e.target === target)) return;
    const newEdge: FlowEdge = { id: `edge-${Date.now()}`, source, target };
    setFlowData(prev => ({ ...prev, edges: [...prev.edges, newEdge] }));
  };

  const handleClear = () => {
    setFlowData({ nodes: [], edges: [] });
    setDescription('');
    setStatus(ProcessingStatus.IDLE);
    setActiveTab('editor');
    setIsDirty(false);
  };

  const handleCopySOP = () => {
    if (!flowData.sop) return;
    const tempDiv = document.createElement("div");
    const text = flowData.sop.sections.map(s => { 
      tempDiv.innerHTML = s.content; 
      const plainContent = tempDiv.innerText.trim().replace(/\n+/g, '\n');
      return `[${s.heading.toUpperCase()}]\n${plainContent}`; 
    }).join('\n\n');
    navigator.clipboard.writeText(`${flowData.sop.title.toUpperCase()}\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadDoc = () => {
    if (!flowData.sop) return;
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${flowData.sop.title}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; padding: 1in; }
        h1 { color: #e11d48; font-size: 24pt; border-bottom: 2pt solid #e11d48; padding-bottom: 12pt; margin-bottom: 24pt; }
        h2 { color: #334155; font-size: 16pt; margin-top: 32pt; background: #fff1f2; padding: 10pt; border-left: 5pt solid #f43f5e; }
        p, li { margin-bottom: 10pt; }
        table { width: 100%; border-collapse: collapse; margin: 20pt 0; border: 1pt solid #cbd5e1; }
        th { background: #f8fafc; font-weight: bold; border: 1pt solid #cbd5e1; padding: 10pt; text-align: left; }
        td { border: 1pt solid #cbd5e1; padding: 10pt; }
      </style></head><body>`;
    const footer = "</body></html>";
    const content = flowData.sop.sections.map(s => `<h2>${s.heading}</h2><div>${s.content}</div>`).join('');
    const blob = new Blob(['\ufeff', header + `<h1>${flowData.sop.title}</h1>` + content + footer], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${flowData.sop.title.replace(/[^a-z0-9]/gi, '_')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`flex h-screen w-screen bg-[#0f172a] text-slate-100 overflow-hidden font-sans print:h-auto print:w-auto print:bg-white print:text-black ${activeTab === 'sop' ? 'sop-active' : 'editor-active'}`}>
      <style>{`
        /* Specialized print logic for high-fidelity PDF outputs */
        @media print {
            html, body { 
                height: auto !important; 
                overflow: visible !important; 
                background: white !important; 
                margin: 0 !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact;
            }
            #root > div { display: block !important; height: auto !important; }
            .sidebar-container, .print-hidden, .lucide, .absolute.top-6.right-6 { 
                display: none !important; 
                visibility: hidden !important; 
            }

            /* Isolate Flowchart print layout */
            .editor-active .flow-editor-container { 
                display: flex !important; 
                align-items: center !important;
                justify-content: center !important;
                position: fixed !important; 
                top: 0 !important; 
                left: 0 !important; 
                width: 100vw !important; 
                height: 100vh !important; 
                z-index: 9999 !important;
                background: white !important;
            }
            .editor-active .sop-content { display: none !important; }

            /* Isolate SOP document print layout */
            .sop-active .sop-content { 
                display: block !important; 
                width: 100% !important; 
                padding: 1in !important; 
                color: black !important;
                margin: 0 !important;
                font-family: 'Segoe UI', Arial, sans-serif;
            }
            .sop-active .flow-editor-container { display: none !important; }

            /* Professional Typography for Printed Documents */
            .sop-content h3 { 
                color: #e11d48 !important; 
                font-size: 1.6rem !important; 
                border-bottom: 2pt solid #e11d48 !important; 
                padding-bottom: 10pt !important; 
                margin-top: 35pt !important; 
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
            }
            .sop-content p, .sop-content li, .sop-content td { color: #1e293b !important; font-size: 11.5pt !important; line-height: 1.6 !important; }
            
            /* Vector-safe scaling for SVG flowchart print */
            svg { 
                width: 100% !important; 
                height: auto !important;
                max-width: 98vw !important; 
                max-height: 98vh !important;
                margin: auto !important;
                display: block !important;
            }

            /* CRITICAL: STRIP ALL FILTERS IN PRINT TO PREVENT PDF BLURRINESS */
            * {
              filter: none !important;
              box-shadow: none !important;
              text-shadow: none !important;
            }
            rect, polygon, path, circle, g {
              stroke-width: 2px !important;
            }
        }

        .sop-content h3 { font-size: 0.85rem; font-weight: 800; color: #fb7185; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
        .sop-content p { margin-bottom: 0.8rem; font-size: 0.95rem; line-height: 1.6; color: #cbd5e1; }
        .sop-content ul { list-style-type: none; padding-left: 0; margin-bottom: 1rem; }
        .sop-content li { position: relative; padding-left: 1.5rem; margin-bottom: 0.5rem; color: #e2e8f0; line-height: 1.5; }
        .sop-content li::before { content: "•"; position: absolute; left: 0.25rem; color: #fb7185; font-weight: bold; }
        .sop-content b { color: #fff1f2; font-weight: 700; }
        .sop-content u { text-decoration-color: #fb7185; text-decoration-thickness: 2px; text-underline-offset: 3px; color: #fff; }
        .sop-content table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 1.5rem 0; font-size: 0.9rem; background: #1e293b; border: 1px solid #334155; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .sop-content th { background-color: #0f172a; color: #fb7185; font-weight: 700; text-align: left; padding: 14px 16px; border-bottom: 1px solid #334155; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
        .sop-content td { border-bottom: 1px solid #334155; padding: 12px 16px; color: #cbd5e1; vertical-align: top; }
      `}</style>

      {/* Main Container */}
      <div className="flex flex-1 relative">
        {/* Sidebar */}
        <div className="w-[480px] sidebar-container flex flex-col border-r border-slate-800/60 bg-[#0B0F19] shadow-2xl z-20 print:hidden relative">
          <div className="absolute top-0 left-0 w-full h-40 bg-rose-500/10 blur-[60px] pointer-events-none" />
          <div className="p-8 pb-4 relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg shadow-red-500/20">
                 <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">FlowGen AI</h1>
                <div className="flex items-center gap-1.5">
                   <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                   <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Sync Active v5.0</span>
                </div>
              </div>
            </div>
            <div className="flex p-1 bg-slate-900/80 rounded-xl border border-slate-800/60">
              <button onClick={() => setActiveTab('editor')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'editor' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}><PenLine size={14} /> Flowchart</button>
              <button onClick={() => setActiveTab('sop')} disabled={!flowData.sop} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'sop' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'} ${!flowData.sop ? 'opacity-40 cursor-not-allowed' : ''}`}><FileText size={14} /> SOP {isDirty && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-1"></span>}</button>
              <button onClick={() => setActiveTab('history')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}><HistoryIcon size={14} /> History</button>
            </div>
          </div>
          <div className="flex-1 px-8 py-2 overflow-y-auto custom-scrollbar relative z-10">
            {activeTab === 'editor' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Sparkles size={14} className="text-rose-400" /> Process Logic</label>
                  <textarea className="w-full h-40 p-5 bg-slate-900/50 border border-slate-700/50 rounded-2xl focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none resize-none text-slate-200 placeholder-slate-600 transition-all font-mono text-sm leading-relaxed" placeholder="Describe your workflow..." value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-900/60 transition-colors" onClick={() => setAutoSync(!autoSync)}>
                      <div className="flex flex-col gap-0.5"><span className="text-sm font-medium text-slate-200 flex items-center gap-2">{autoSync ? <Zap size={14} className="text-rose-400" /> : <ZapOff size={14} className="text-slate-500" />} Smart Sync {autoSync ? 'ON' : 'OFF'}</span><span className="text-[10px] text-slate-500">Live document updates</span></div>
                      <div className={`w-11 h-6 rounded-full transition-colors relative ${autoSync ? 'bg-rose-600' : 'bg-slate-700'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-sm ${autoSync ? 'left-6' : 'left-1'}`} /></div>
                    </div>
                </div>
                <div className="mt-2 flex flex-col gap-4">
                   <button onClick={handleGenerate} disabled={status === ProcessingStatus.GENERATING || !description.trim()} className={`group relative w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-bold text-white transition-all ${status === ProcessingStatus.GENERATING ? 'bg-slate-800 cursor-not-allowed' : 'bg-gradient-to-r from-red-600 to-rose-600 hover:-translate-y-0.5'}`}>{status === ProcessingStatus.GENERATING ? <><Loader2 className="animate-spin" size={20} /> Generating...</> : <><Play size={20} fill="white" className="opacity-40" /> Generate Workflow</>}</button>
                   {isDirty && <button onClick={handleRefineSOP} disabled={isRefiningSOP} className={`w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-bold text-white transition-all shadow-xl ${isRefiningSOP ? 'bg-slate-800' : 'bg-rose-600 hover:bg-rose-500 animate-pulse'}`}>{isRefiningSOP ? <Loader2 className="animate-spin" size={20} /> : <HistoryIcon size={20} />} Sync SOP Now</button>}
                   <button onClick={handleClear} className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700"><Eraser size={16} /> New Project</button>
                </div>
              </div>
            )}
            {activeTab === 'sop' && flowData.sop && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-12 sop-content relative">
                  <div className="flex items-center justify-between sticky top-0 bg-[#0B0F19]/95 backdrop-blur py-4 z-20 border-b border-slate-800/50 print:hidden mb-4">
                      <h2 className="text-xl font-bold text-white truncate pr-2">{flowData.sop.title}</h2>
                      <div className="flex gap-2">
                          <button onClick={() => window.print()} className="p-2.5 bg-slate-800 hover:bg-rose-600 rounded-xl text-white transition-all" title="Download as PDF (Save as PDF in Print menu)"><Printer size={18} /></button>
                          <button onClick={handleCopySOP} className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white transition-all" title="Copy Text">{copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}</button>
                          <button onClick={handleDownloadDoc} className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white transition-all" title="Download as Word"><Download size={18} /></button>
                      </div>
                  </div>
                  <div className="space-y-6 relative print:space-y-8">
                      {isRefiningSOP && <div className="absolute inset-0 bg-[#0B0F19]/60 backdrop-blur-sm z-10 flex flex-col items-center pt-24 print:hidden"><div className="p-6 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center gap-4"><Loader2 size={32} className="animate-spin text-rose-500" /><span className="text-xs font-bold text-rose-400 tracking-widest uppercase">Syncing SOP...</span></div></div>}
                      {flowData.sop.sections.map((section, idx) => (
                          <div key={idx} className="relative group p-6 bg-slate-900/30 border border-slate-800/50 rounded-xl print:p-0 print:border-none print:bg-transparent"><h3 className="flex items-center gap-2 print:border-b print:pb-2 print:mb-4"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 print:hidden"></span>{section.heading}</h3><div className="text-slate-300 print:text-slate-800" dangerouslySetInnerHTML={{ __html: section.content }} /></div>
                      ))}
                  </div>
              </div>
            )}
            {activeTab === 'history' && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300 pb-12">
                <div className="flex items-center gap-2 py-4 border-b border-slate-800/50"><HistoryIcon size={18} className="text-rose-400" /><h2 className="text-xl font-bold text-white">Project History</h2></div>
                {history.length === 0 ? <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3"><div className="p-4 rounded-full bg-slate-900/50 border border-slate-800"><Clock size={32} strokeWidth={1.5} /></div><p className="text-sm">No history found.</p></div> : <div className="flex flex-col gap-3">{history.map((item) => (<div key={item.id} onClick={() => loadFromHistory(item)} className="group p-4 bg-slate-900/40 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-900/60 rounded-xl cursor-pointer transition-all relative overflow-hidden"><div className="flex items-start justify-between gap-2 min-w-0"><div className="flex flex-col gap-1 min-w-0"><span className="text-sm font-bold text-slate-200 truncate">{item.data.sop?.title || item.description || 'Untitled'}</span><span className="text-[10px] text-slate-500 font-medium uppercase">{new Date(item.timestamp).toLocaleDateString()}</span></div><button onClick={(e) => deleteHistoryItem(item.id, e)} className="p-2 text-slate-600 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button></div></div>))}</div>}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 relative bg-[#f8fafc] text-slate-900">
          <FlowEditor data={flowData} isDirty={isDirty} isRefining={isRefiningSOP} onReviseSOP={handleRefineSOP} onUpdateNodeGeometry={updateNodeGeometry} onNodeLabelChange={updateNodeLabel} onDeleteNode={deleteNode} onDeleteEdge={deleteEdge} onAddNode={addNode} onAddEdge={addEdge} />
        </div>
      </div>
    </div>
  );
};

export default App;
