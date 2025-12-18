
export interface FlowNode {
  id: string;
  type: 'start' | 'process' | 'decision' | 'end' | 'data' | 'document' | 'database' | 'manual-input' | 'predefined-process';
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface SOPSection {
  heading: string;
  content: string; // Markdown supported
}

export interface SOP {
  title: string;
  sections: SOPSection[];
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  sop?: SOP;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}
