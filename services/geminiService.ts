
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
  const modelId = "gemini-3-flash-preview";
  
  // High-fidelity structural summary for precise refinement
  const nodeDict = nodes.reduce((acc, n) => ({ ...acc, [n.id]: n }), {} as Record<string, FlowNode>);
  const structureSummary = `
    THE USER HAS CUSTOMIZED THE FLOWCHART. YOU MUST UPDATE THE SOP TO MATCH THIS EXACT NEW STRUCTURE:
    
    STRICT NODE LIST:
    ${nodes.map(n => `- Node [${n.id}]: TYPE="${n.type.toUpperCase()}", LABEL="${n.label}"`).join('\n')}
    
    STRICT CONNECTION LIST (FOLLOW THESE PATHS EXACTLY):
    ${edges.map(e => {
      const src = nodeDict[e.source];
      const tgt = nodeDict[e.target];
      return `- "${src?.label || 'Unknown'}" leads to "${tgt?.label || 'Unknown'}"`;
    }).join('\n')}
    
    INSTRUCTIONS:
    1. Do not use old context if it conflicts with the labels or connections above.
    2. Ensure every label mentioned above appears in the relevant SOP section.
    3. If nodes were deleted or renamed by the user, ensure the SOP reflects those specific changes.
  `;

  const systemInstruction = `
    You are an expert Technical Process Writer. 
    Your task is to REVISE a Standard Operating Procedure (SOP) based on a manually customized flowchart structure.
    
    ${SOP_INSTRUCTION}
    
    The structure provided in the prompt is the ABSOLUTE SOURCE OF TRUTH. 
    If a node label has changed, the SOP must use the NEW label.
    Output strictly valid JSON matching the SOP schema.
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
