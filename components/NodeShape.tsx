
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FlowNode } from '../types';

interface NodeShapeProps {
  node: FlowNode;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onResizeMouseDown: (e: React.MouseEvent, nodeId: string, handle: string) => void;
  onLabelChange: (nodeId: string, newLabel: string) => void;
  onUpdateNodeGeometry: (nodeId: string, updates: { width?: number, height?: number }) => void;
  onConnectorMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onNodeMouseUp: (e: React.MouseEvent, nodeId: string) => void;
  onEditComplete?: () => void;
}

/**
 * Utility to calculate text dimensions for auto-sizing.
 */
const calculateTextSize = (text: string) => {
  if (typeof document === 'undefined') return { w: 180, h: 80 };
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return { w: 180, h: 80 };
  
  // Match the font styles used in the component
  context.font = '600 14px Inter, sans-serif';
  const lines = text.split('\n');
  let maxWidth = 0;
  lines.forEach(line => {
    maxWidth = Math.max(maxWidth, context.measureText(line).width);
  });
  
  // Calculate final dimensions with padding and min/max constraints
  const w = Math.max(180, Math.min(600, maxWidth + 60)); 
  const h = Math.max(80, lines.length * 22 + 45); 
  return { w, h };
};

const NodeShape: React.FC<NodeShapeProps> = ({ 
  node, 
  selected, 
  onMouseDown, 
  onResizeMouseDown, 
  onLabelChange,
  onUpdateNodeGeometry,
  onConnectorMouseDown,
  onNodeMouseUp,
  onEditComplete
}) => {
  const { type, label } = node;
  const width = node.width || 180;
  const height = node.height || 80;
  
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const fillColor = '#ffffff';
  const strokeColor = selected ? '#e11d48' : '#94a3b8'; 
  const strokeWidth = selected ? 3 : 1.5;
  const textColor = '#1e293b'; 

  useEffect(() => {
    setEditValue(label);
  }, [label]);

  // AUTO-SIZE EFFECT:
  // Whenever the text (label or current edit) changes, update the block's size
  useEffect(() => {
    const textToMeasure = isEditing ? editValue : label;
    const { w, h } = calculateTextSize(textToMeasure);
    
    // Only update if the change is significant to avoid infinite loops or jitter
    if (Math.abs(w - width) > 1 || Math.abs(h - height) > 1) {
      onUpdateNodeGeometry(node.id, { width: w, height: h });
    }
  }, [editValue, label, isEditing, width, height, node.id, onUpdateNodeGeometry]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue.trim() !== label) {
      onLabelChange(node.id, editValue);
    }
    // Note: We don't deselect here anymore so the user can easily move/resize after editing
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(label);
      onEditComplete?.();
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent) => {
      e.preventDefault(); 
      onMouseDown(e, node.id);
  };

  const commonProps = {
    fill: fillColor,
    stroke: strokeColor,
    strokeWidth: strokeWidth,
    filter: selected ? 'url(#node-glow)' : 'url(#node-shadow)', 
    className: "transition-all duration-200 cursor-move",
    onMouseDown: handleNodeMouseDown,
    onDoubleClick: handleDoubleClick,
  };

  const renderShape = () => {
    const w = width;
    const h = height;
    const hw = w / 2;
    const hh = h / 2;

    switch (type) {
      case 'start':
      case 'end':
        return <rect x={-hw} y={-hh} width={w} height={h} rx={h/2} ry={h/2} {...commonProps} />;
      case 'decision':
        return <polygon points={`0,${-hh} ${hw},0 0,${hh} ${-hw},0`} {...commonProps} />;
      case 'data': 
        const skew = 20;
        return <polygon points={`${-hw + skew},${-hh} ${hw},${-hh} ${hw - skew},${hh} ${-hw},${hh}`} {...commonProps} />;
      case 'document': 
        return <path d={`M ${-hw} ${-hh} L ${hw} ${-hh} L ${hw} ${hh - 10} Q ${hw/2} ${hh + 10} 0 ${hh - 10} T ${-hw} ${hh - 10} Z`} {...commonProps} />;
      case 'database': 
        return (
          <g className="transition-all duration-200 cursor-move" onMouseDown={commonProps.onMouseDown} onDoubleClick={commonProps.onDoubleClick} filter={commonProps.filter}>
            <path d={`M ${-hw} ${-hh + 10} L ${-hw} ${hh - 10} A ${hw} 10 0 0 0 ${hw} ${hh - 10} L ${hw} ${-hh + 10}`} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
            <ellipse cx={0} cy={-hh + 10} rx={hw} ry={10} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );
      case 'manual-input':
        return <polygon points={`${-hw},${-hh + 15} ${hw},${-hh} ${hw},${hh} ${-hw},${hh}`} {...commonProps} />;
      case 'predefined-process':
         return (
            <g className="transition-all duration-200 cursor-move" onMouseDown={commonProps.onMouseDown} onDoubleClick={commonProps.onDoubleClick} filter={commonProps.filter}>
              <rect x={-hw} y={-hh} width={w} height={h} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
              <line x1={-hw + 15} y1={-hh} x2={-hw + 15} y2={hh} stroke={strokeColor} strokeWidth={strokeWidth} />
              <line x1={hw - 15} y1={-hh} x2={hw - 15} y2={hh} stroke={strokeColor} strokeWidth={strokeWidth} />
            </g>
         );
      case 'process':
      default:
        return <rect x={-hw} y={-hh} width={w} height={h} rx={8} ry={8} {...commonProps} />;
    }
  };

  const renderResizeHandle = (handle: string, x: number, y: number, cursor: string) => (
    <rect
      x={x - 7} y={y - 7} width={14} height={14}
      fill="#ffffff" stroke="#e11d48" strokeWidth={2}
      className={`${cursor} shadow-lg hover:fill-rose-50 transition-colors`}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onResizeMouseDown(e, node.id, handle);
      }}
    />
  );

  const Connector = ({ x, y }: { x: number, y: number }) => (
    <circle 
        cx={x} cy={y} r={6} 
        fill="#e11d48" stroke="white" strokeWidth="2"
        className="cursor-crosshair transition-all duration-200 hover:scale-125"
        onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault(); 
            onConnectorMouseDown(e, node.id);
        }}
    />
  );

  return (
    <g 
        transform={`translate(${node.x},${node.y})`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseUp={(e) => onNodeMouseUp(e, node.id)}
    >
      {renderShape()}
      
      {isEditing ? (
        <foreignObject x={-width / 2 + 10} y={-height / 2 + 10} width={width - 20} height={height - 20}>
          <textarea
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full h-full p-1 text-center text-sm border-none outline-none resize-none bg-rose-50/70 rounded flex items-center justify-center leading-tight overflow-hidden font-sans"
            style={{ color: textColor, fontSize: '14px', fontWeight: 600 }}
          />
        </foreignObject>
      ) : (
        <foreignObject x={-width / 2 + 10} y={-height / 2 + 10} width={width - 20} height={height - 20} style={{ pointerEvents: 'none' }}>
          <div className="w-full h-full flex items-center justify-center text-center leading-tight overflow-hidden">
            <span style={{ color: textColor, fontSize: '14px', fontWeight: 600, fontFamily: 'Inter, sans-serif' }} className="select-none break-words w-full">
              {label}
            </span>
          </div>
        </foreignObject>
      )}

      {selected && !isEditing && (
        <>
          {renderResizeHandle('nw', -width / 2, -height / 2, 'cursor-nw-resize')}
          {renderResizeHandle('ne', width / 2, -height / 2, 'cursor-ne-resize')}
          {renderResizeHandle('sw', -width / 2, height / 2, 'cursor-sw-resize')}
          {renderResizeHandle('se', width / 2, height / 2, 'cursor-se-resize')}
          {renderResizeHandle('n', 0, -height / 2, 'cursor-n-resize')}
          {renderResizeHandle('s', 0, height / 2, 'cursor-s-resize')}
          {renderResizeHandle('e', width / 2, 0, 'cursor-e-resize')}
          {renderResizeHandle('w', -width / 2, 0, 'cursor-w-resize')}
        </>
      )}

      {(isHovered || selected) && !isEditing && (
          <g className="opacity-0 hover:opacity-100 transition-opacity duration-200" style={{ opacity: isHovered || selected ? 1 : 0 }}>
              <Connector x={0} y={-height/2} /> 
              <Connector x={0} y={height/2} />  
              <Connector x={width/2} y={0} />   
              <Connector x={-width/2} y={0} />  
          </g>
      )}
    </g>
  );
};

export default NodeShape;
