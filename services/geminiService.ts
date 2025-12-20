
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
  // Use gemini-3-pro-preview for complex reasoning and structure generation tasks
  const modelId = "gemini-3-pro-preview"; 

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

  const schemaProperties: any = {
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING },
          type: { type: Type.STRING }
        },
        required: ["id", "label", "type"],
      },
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          source: { type: Type.STRING },
          target: { type: Type.STRING }
        },
        required: ["id", "source", "target"],
      },
    }
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
    return JSON.parse(text) as FlowData;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate flowchart.");
  }
};

export const refineSOPFromFlow = async (nodes: FlowNode[], edges: FlowEdge[]): Promise<SOP> => {
  // Use gemini-3-pro-preview for advanced reasoning when updating existing documents
  const modelId = "gemini-3-pro-preview";
  
  const nodeDict = nodes.reduce((acc, n) => ({ ...acc, [n.id]: n }), {} as Record<string, FlowNode>);
  const structureSummary = `
    STRICT TASK: UPDATE THE SOP TO MATCH THE FLOWCHART LABELS.
    The user has MANUALLY EDITED the flowchart labels. You MUST reflect these EXACT labels in the updated SOP.
    
    NEW SOURCE OF TRUTH (FLOWCHART):
    
    NODES (The SOP procedure steps MUST use these exact labels):
    ${nodes.map(n => `- Node [${n.id}]: "${n.label}" (Type: ${n.type})`).join('\n')}
    
    SEQUENCE (The SOP procedure MUST follow this logic):
    ${edges.map(e => {
      const src = nodeDict[e.source];
      const tgt = nodeDict[e.target];
      return `- From "${src?.label || 'Step'}" go to "${tgt?.label || 'Next Step'}"`;
    }).join('\n')}
    
    INSTRUCTIONS FOR REFINEMENT:
    - If a label has changed (e.g., from "Drafting" to "Review Phase"), you MUST use "Review Phase" in the SOP content.
    - Rewrite all procedure sections to match this sequence and naming.
    - Use HTML tags (<b>, <u>, <ul>, <table>) for formatting as before.
  `;

  const systemInstruction = `
    You are an expert Technical Process Writer. 
    You are refining a Standard Operating Procedure based on a CUSTOMIZED flowchart.
    
    ${SOP_INSTRUCTION}
    
    The labels provided in the prompt are the ABSOLUTE FINAL terminology. Do not hallucinate previous versions of the labels.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: structureSummary,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SOP_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty refinement response.");
    return JSON.parse(text) as SOP;
  } catch (error) {
    console.error("Gemini Refine Error:", error);
    throw new Error("Failed to refine SOP.");
  }
};
