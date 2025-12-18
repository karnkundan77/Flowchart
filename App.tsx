
import React, { useState, useEffect, useRef } from 'react';
import { Bot, Play, Loader2, Info, Eraser, Sparkles, FileText, PenLine, Copy, Check, Download, RefreshCw, Zap, ZapOff, History as HistoryIcon, Trash2, Clock } from 'lucide-react';
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

  // Load history from localStorage
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

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('flowgen_history', JSON.stringify(history));
  }, [history]);

  const saveToHistory = (data: FlowData, desc: string) => {
    const newItem: HistoryItem = {
      id: `hist-${Date.now()}`,
      timestamp: Date.now(),
      data: JSON.parse(JSON.stringify(data)), // Deep copy
      description: desc || data.sop?.title || 'Untitled Process'
    };
    setHistory(prev => [newItem, ...prev.slice(0, 19)]); // Keep last 20
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
      
      // Save to history on successful generation
      saveToHistory(layoutData, description.substring(0, 50) + (description.length > 50 ? '...' : ''));

      if (includeSOP) setActiveTab('sop');
      else setActiveTab('editor');
    } catch (err: any) {
      console.error(err);
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
      
      // Update the latest history item if it exists and matches current flow
      // Or just save a new snapshot
      saveToHistory(updatedData, `Updated: ${updatedData.sop?.title || 'Procedure'}`);
    } catch (err: any) {
      console.error("SOP Refinement failed", err);
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
    JSON.stringify(flowData.nodes.map(n => ({ id: n.id, label: n.label, type: n.type }))),
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

  const updateNodePosition = (nodeId: string, x: number, y: number) => {
    setFlowData(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, x, y } : n) }));
  };
  const updateNodeSize = (nodeId: string, width: number, height: number) => {
    setFlowData(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, width, height } : n) }));
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
    const text = flowData.sop.sections.map(s => { tempDiv.innerHTML = s.content; return `${s.heading.toUpperCase()}\n${tempDiv.innerText}`; }).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadDoc = () => {
    if (!flowData.sop) return;
    const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${flowData.sop.title}</title><style>body { font-family: 'Arial', sans-serif; font-size: 12pt; line-height: 1.5; color: #000; } h1 { color: #be123c; font-size: 24pt; margin-bottom: 20px; border-bottom: 2px solid #be123c; padding-bottom: 10px; } h2 { color: #334155; font-size: 16pt; margin-top: 20px; margin-bottom: 10px; background-color: #f1f5f9; padding: 5px 10px; } p, li { margin-bottom: 10px; } table { width: 100%; border-collapse: collapse; margin: 15px 0; } th { background-color: #e2e8f0; color: #1e293b; font-weight: bold; border: 1px solid #cbd5e1; padding: 8px; text-align: left; } td { border: 1px solid #cbd5e1; padding: 8px; }</style></head><body>`;
    const postHtml = "</body></html>";
    const contentHtml = flowData.sop.sections.map(s => `<h2>${s.heading}</h2><div>${s.content}</div>`).join('');
    const html = preHtml + `<h1>${flowData.sop.title}</h1>` + contentHtml + postHtml;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
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
    <div className="flex h-screen w-screen bg-[#0f172a] text-slate-100 overflow-hidden font-sans print:h-auto print:w-auto print:bg-white print:text-black">
      
      <style>{`
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
        .sop-content tr:last-child td { border-bottom: none; }
        .sop-content tr:nth-child(even) td { background-color: rgba(30, 41, 59, 0.4); }

        .pulse-sync { animation: pulse-sync 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse-sync { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.6); } 50% { transform: scale(1.02); box-shadow: 0 0 0 12px rgba(244, 63, 94, 0); } }

        @media print {
            .sop-content { padding-bottom: 0 !important; }
            .sop-content h3 { color: #000 !important; border-bottom: 1px solid #000; padding-bottom: 5px; }
            .sop-content p, .sop-content li { color: #000 !important; }
            .sop-content li::before { color: #000; }
            .sop-content b { color: #000 !important; }
            .sop-content u { text-decoration-color: #000 !important; color: #000 !important; }
            .sop-content table { border: 1px solid #000; box-shadow: none; background: none !important; }
            .sop-content th { background-color: #f1f5f9 !important; color: #000 !important; border: 1px solid #000; }
            .sop-content td { color: #000 !important; border: 1px solid #000; background: none !important; }
        }
      `}</style>

      {/* Sidebar */}
      <div className="w-[480px] flex flex-col border-r border-slate-800/60 bg-[#0B0F19] shadow-2xl z-20 print:w-full print:border-none print:shadow-none relative">
        <div className="absolute top-0 left-0 w-full h-40 bg-rose-500/10 blur-[60px] pointer-events-none print:hidden" />

        <div className="p-8 pb-4 relative z-10 print:hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg shadow-red-500/20">
               <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">FlowGen AI</h1>
              <div className="flex items-center gap-1.5">
                 <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                 <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Workspace Sync v3.6</span>
              </div>
            </div>
          </div>

          <div className="flex p-1 bg-slate-900/80 rounded-xl border border-slate-800/60">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'editor' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <PenLine size={14} /> Flowchart
            </button>
            <button
              onClick={() => setActiveTab('sop')}
              disabled={!flowData.sop}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'sop' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'} ${!flowData.sop ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <FileText size={14} /> SOP
              {isDirty && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-1"></span>}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'history' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <HistoryIcon size={14} /> History
            </button>
          </div>
        </div>

        <div className="flex-1 px-8 py-2 overflow-y-auto custom-scrollbar relative z-10 print:p-8 print:overflow-visible">
          {activeTab === 'editor' && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300 print:hidden">
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles size={14} className="text-rose-400" /> New Process Description
                </label>
                <div className="relative group">
                  <textarea
                    className="w-full h-40 p-5 bg-slate-900/50 border border-slate-700/50 rounded-2xl focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none resize-none text-slate-200 placeholder-slate-600 transition-all font-mono text-sm leading-relaxed shadow-inner"
                    placeholder="Describe your process logic..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-900/60 transition-colors" onClick={() => setAutoSync(!autoSync)}>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-slate-200 flex items-center gap-2">
                            {autoSync ? <Zap size={14} className="text-rose-400" /> : <ZapOff size={14} className="text-slate-500" />}
                            AI Auto-Sync {autoSync ? 'ON' : 'OFF'}
                        </span>
                        <span className="text-[10px] text-slate-500">Document updates {autoSync ? 'as you customize' : 'manually'}</span>
                    </div>
                    <div className={`w-11 h-6 rounded-full transition-colors relative ${autoSync ? 'bg-rose-600' : 'bg-slate-700'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-sm ${autoSync ? 'left-6' : 'left-1'}`} />
                    </div>
                  </div>
              </div>

              <div className="mt-2 flex flex-col gap-4">
                 <button
                  onClick={handleGenerate}
                  disabled={status === ProcessingStatus.GENERATING || !description.trim()}
                  className={`group relative w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-bold text-white shadow-xl transition-all overflow-hidden ${status === ProcessingStatus.GENERATING ? 'bg-slate-800 cursor-not-allowed' : 'bg-gradient-to-r from-red-600 to-rose-600 hover:shadow-red-500/25 hover:-translate-y-0.5'}`}
                >
                  {status === ProcessingStatus.GENERATING ? (
                    <><Loader2 className="animate-spin" size={20} /> <span className="animate-pulse tracking-wide">Building Flow...</span></>
                  ) : (
                    <><Play size={20} fill="white" className="opacity-40" /> Build Flow & SOP</>
                  )}
                </button>

                {isDirty && (
                    <button 
                        onClick={handleRefineSOP} 
                        disabled={isRefiningSOP} 
                        className={`w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-bold text-white transition-all shadow-xl ${isRefiningSOP ? 'bg-slate-800' : 'bg-rose-600 hover:bg-rose-500 pulse-sync'}`}
                    >
                        {isRefiningSOP ? <Loader2 className="animate-spin" size={20} /> : <HistoryIcon size={20} />}
                        {isRefiningSOP ? 'Updating SOP...' : 'Update SOP (Apply Edits)'}
                    </button>
                )}

                <button onClick={handleClear} className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700">
                   <Eraser size={16} /> Reset All
                </button>
              </div>

              <div className="mt-4 p-5 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
                 <p className="flex items-center gap-2 font-bold text-slate-300 mb-2 uppercase tracking-widest text-[10px]">
                    <RefreshCw size={12} /> Synchronization
                 </p>
                 <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isDirty ? 'bg-rose-500 animate-pulse' : 'bg-green-500'}`} />
                    <span>{isDirty ? 'Customizations detected. Click Update SOP.' : 'SOP is current.'}</span>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'sop' && flowData.sop && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-12 sop-content relative">
                <div className="flex items-center justify-between sticky top-0 bg-[#0B0F19]/95 backdrop-blur py-4 z-20 border-b border-slate-800/50 print:hidden mb-4">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent truncate pr-2">
                        {flowData.sop.title}
                    </h2>
                    <div className="flex gap-1.5">
                        <button onClick={handleRefineSOP} disabled={isRefiningSOP} className={`p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 transition-colors ${isRefiningSOP ? 'text-rose-500' : ''}`} title="Update Documentation">
                            <RefreshCw size={18} className={isRefiningSOP ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={handleCopySOP} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title="Copy Text">
                            {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                        </button>
                        <button onClick={handleDownloadDoc} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title="Download Word">
                            <Download size={18} />
                        </button>
                    </div>
                </div>

                {isDirty && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between gap-4 animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 text-rose-400 text-xs font-medium">
                            <Info size={14} /> SOP is missing your latest flow changes.
                        </div>
                        <button onClick={handleRefineSOP} disabled={isRefiningSOP} className="whitespace-nowrap px-4 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-lg text-[10px] font-bold text-white transition-all shadow-md">
                            Apply Customizations
                        </button>
                    </div>
                )}
                
                <div className="space-y-6 print:space-y-6 relative">
                    {isRefiningSOP && (
                        <div className="absolute inset-0 bg-[#0B0F19]/40 backdrop-blur-[1px] z-10 flex flex-col items-center pt-20 rounded-3xl">
                            <div className="p-5 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center gap-3">
                                <Loader2 size={24} className="animate-spin text-rose-500" />
                                <span className="text-[10px] font-bold text-rose-400 tracking-widest uppercase">AI Updating SOP...</span>
                            </div>
                        </div>
                    )}
                    {flowData.sop.sections.map((section, idx) => (
                        <div key={idx} className="relative group p-6 bg-slate-900/30 border border-slate-800/50 rounded-xl print:p-0 print:border-none print:bg-transparent">
                            <h3 className="print:text-slate-900 print:border-b print:border-slate-200 print:pb-1 print:mb-3 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 print:hidden"></span>
                                {section.heading}
                            </h3>
                            <div className="text-slate-200 print:text-slate-800" dangerouslySetInnerHTML={{ __html: section.content }} />
                        </div>
                    ))}
                </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300 pb-12">
              <div className="flex items-center gap-2 py-4 border-b border-slate-800/50">
                 <HistoryIcon size={18} className="text-rose-400" />
                 <h2 className="text-xl font-bold text-white">Generation History</h2>
              </div>
              
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                  <div className="p-4 rounded-full bg-slate-900/50 border border-slate-800">
                    <Clock size={32} strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium">No previous projects found.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {history.map((item) => (
                    <div 
                      key={item.id} 
                      onClick={() => loadFromHistory(item)}
                      className="group p-4 bg-slate-900/40 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-900/60 rounded-xl cursor-pointer transition-all relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-transparent group-hover:bg-rose-500 transition-colors" />
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-sm font-bold text-slate-200 truncate pr-4">
                            {item.data.sop?.title || item.description || 'Untitled Flow'}
                          </span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1.5 font-medium uppercase tracking-wider">
                            <Clock size={10} /> {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <button 
                          onClick={(e) => deleteHistoryItem(item.id, e)}
                          className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative bg-slate-50/50 text-slate-900 print:hidden">
        <FlowEditor 
            data={flowData} 
            isDirty={isDirty}
            isRefining={isRefiningSOP}
            onReviseSOP={handleRefineSOP}
            onUpdateNodePosition={updateNodePosition} 
            onUpdateNodeSize={updateNodeSize}
            onNodeLabelChange={updateNodeLabel}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
            onAddNode={addNode}
            onAddEdge={addEdge}
        />
      </div>
    </div>
  );
};

export default App;
