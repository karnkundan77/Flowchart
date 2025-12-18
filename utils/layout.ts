
import { FlowNode, FlowEdge, FlowData } from "../types";

// Constants for layout
const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const X_SPACING = 250;
const Y_SPACING = 150;

/**
 * A simple auto-layout algorithm based on BFS ranking (Top-Down Layered Layout).
 * This replaces a heavy library like Dagre for this demo to keep it lightweight and pure TS.
 */
export const calculateLayout = (data: FlowData): FlowData => {
  const { nodes, edges, sop } = data;
  const nodesMap = new Map<string, FlowNode>();
  
  // Initialize nodes with temporary data
  nodes.forEach(n => {
    nodesMap.set(n.id, { ...n, x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Build adjacency list
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  
  nodes.forEach(n => {
    adj[n.id] = [];
    inDegree[n.id] = 0;
  });

  edges.forEach(e => {
    if (adj[e.source]) {
      adj[e.source].push(e.target);
    }
    if (inDegree[e.target] !== undefined) {
      inDegree[e.target]++;
    }
  });

  // Identify source nodes (in-degree 0) or fallback to first node
  const startNodes = nodes.filter(n => inDegree[n.id] === 0);
  const queue: { id: string; rank: number }[] = [];

  if (startNodes.length > 0) {
    startNodes.forEach(n => queue.push({ id: n.id, rank: 0 }));
  } else if (nodes.length > 0) {
    // Cycle handling or weird structure: just pick the first one
    queue.push({ id: nodes[0].id, rank: 0 });
  }

  // BFS to assign ranks (Y levels)
  const ranks: Record<number, string[]> = {};
  const visited = new Set<string>();
  const nodeRanks: Record<string, number> = {};

  while (queue.length > 0) {
    const { id, rank } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    nodeRanks[id] = rank;
    if (!ranks[rank]) ranks[rank] = [];
    ranks[rank].push(id);

    const neighbors = adj[id] || [];
    neighbors.forEach(targetId => {
      // Simple cycle avoidance: only visit if not visited
      if (!visited.has(targetId)) {
        queue.push({ id: targetId, rank: rank + 1 });
      }
    });
  }

  // Handle disconnected components or unvisited nodes
  nodes.forEach(n => {
    if (!visited.has(n.id)) {
        // Just put them at the bottom
        const maxRank = Math.max(...Object.keys(ranks).map(Number), 0) + 1;
        if (!ranks[maxRank]) ranks[maxRank] = [];
        ranks[maxRank].push(n.id);
        visited.add(n.id);
        nodeRanks[n.id] = maxRank;
    }
  });

  // Assign X/Y coordinates based on Rank and Index in Rank
  const finalNodes: FlowNode[] = [];
  
  Object.keys(ranks).forEach(rankStr => {
    const rank = parseInt(rankStr, 10);
    const nodesInRank = ranks[rank];
    const rowWidth = nodesInRank.length * X_SPACING;
    const startX = -(rowWidth / 2) + (X_SPACING / 2);

    nodesInRank.forEach((nodeId, index) => {
      const node = nodesMap.get(nodeId)!;
      node.x = startX + (index * X_SPACING);
      node.y = rank * Y_SPACING + 50; // +50 padding top
      finalNodes.push(node);
    });
  });

  return { nodes: finalNodes, edges, sop };
};
