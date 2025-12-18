
import { GoogleGenAI, Type } from "@google/genai";
import { FlowData, FlowNode, FlowEdge, SOP } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SOP_INSTRUCTION = `
    SOP CONTENT RULES:
    - Title: Create a Catchy, Professional Title for the SOP.
    - Sections: Generate organized sections (e.g., 'Executive Summary', 'Key Objectives', 'Detailed Procedure', 'Roles & Responsibilities').
    - **CRITICAL FORMATTING RULES**:
      - Use **HTML tags** only (No Markdown).
      - Use <b>text</b> for emphasis.
      - Use <u>text</u> for key terms.
      - Use <ul><li>item</li></ul> for lists.
      - Use <table border="1"> for comparison or structured steps.
      - Make it look professional: Use clear, concise language but keep it engaging.
  `;

const SOP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING },
          content: { type: Type.STRING, description: "HTML formatted content" }
        },
        required: ["heading", "content"]
      }
    }
  },
  required: ["title", "sections"]
};

export const generateFlowFromText = async (processDescription: string, includeSOP: boolean = true): Promise<FlowData> => {
  const modelId = "gemini-3-flash-preview"; 

  const baseInstruction = `
    You are an expert Business Process Analyst and Creative Technical Writer.
    Convert the user's process description into a flowchart JSON structure${includeSOP ? ' AND a detailed, attractive Standard Operating Procedure (SOP)' : ''}.
    
    Output strictly valid JSON.
    
    1. FLOWCHART NODES:
    - 'start': Beginning.
    - 'end': Conclusion.
    - 'process': Action steps.
    - 'decision': Logic/Branching.
    - 'data': I/O (Input/Output).
    - 'document': Reports/Files.
    - 'database': Storage/DB.
    - 'manual-input': User entry.
    - 'predefined-process': Subroutines.
  `;

  const systemInstruction = baseInstruction + (includeSOP ? SOP_INSTRUCTION : '');

  // Define Schema Parts
  const nodesSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        label: { type: Type.STRING },
        type: { 
          type: Type.STRING, 
          enum: ["start", "process", "decision", "end", "data", "document", "database", "manual-input", "predefined-process"] 
        },
      },
      required: ["id", "label", "type"],
    },
  };

  const edgesSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        source: { type: Type.STRING },
        target: { type: Type.STRING },
        label: { type: Type.STRING },
      },
      required: ["id", "source", "target"],
    },
  };

  // Construct Dynamic Schema
  const schemaProperties: any = {
    nodes: nodesSchema,
    edges: edgesSchema,
  };

  if (includeSOP) {
    schemaProperties.sop = SOP_SCHEMA;
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: processDescription,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: schemaProperties,
          required: includeSOP ? ["nodes", "edges", "sop"] : ["nodes", "edges"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("Received empty response from AI.");
    
    try {
        const parsed = JSON.parse(text);
        if (!parsed.nodes || !parsed.edges) throw new Error("Invalid JSON structure");
        return parsed as FlowData;
    } catch (e) {
        console.error("JSON Parse Error:", e);
        throw new Error("AI generated invalid JSON. Please try again.");
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate flowchart. API Error.");
  }
};

export const refineSOPFromFlow = async (nodes: FlowNode[], edges: FlowEdge[]): Promise<SOP> => {
  const modelId = "gemini-3-flash-preview";
  
  // Create a textual representation of the current graph for the model to understand
  const structureSummary = `
    Nodes: ${nodes.map(n => `[${n.type.toUpperCase()}: ${n.label}]`).join(', ')}
    Connections: ${edges.map(e => {
      const src = nodes.find(n => n.id === e.source)?.label || 'Unknown';
      const tgt = nodes.find(n => n.id === e.target)?.label || 'Unknown';
      return `${src} -> ${tgt}`;
    }).join(', ')}
  `;

  const systemInstruction = `
    You are an expert Business Process Analyst. 
    Review the following flowchart structure and generate a professional, catchy, and detailed Standard Operating Procedure (SOP).
    Ensure the SOP logically follows the steps and branches provided in the flowchart data.
    
    ${SOP_INSTRUCTION}
    
    Output strictly valid JSON matching the SOP schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `Generate a detailed SOP for the following flowchart structure:\n${structureSummary}`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SOP_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Received empty response from AI.");
    return JSON.parse(text) as SOP;
  } catch (error) {
    console.error("Gemini Refine Error:", error);
    throw new Error("Failed to refine SOP.");
  }
};
