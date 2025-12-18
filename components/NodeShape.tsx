
import React, { useState, useEffect, useRef } from 'react';
import { FlowNode } from '../types';

interface NodeShapeProps {
  node: FlowNode;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onResizeMouseDown: (e: React.MouseEvent, nodeId: string, handle: string) => void;
  onLabelChange: (nodeId: string, newLabel: string) => void;
  onConnectorMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onNodeMouseUp: (e: React.MouseEvent, nodeId: string) => void;
}

const NodeShape: React.FC<NodeShapeProps> = ({ 
  node, 
  selected, 
  onMouseDown, 
  onResizeMouseDown, 
  onLabelChange,
  onConnectorMouseDown,
  onNodeMouseUp
}) => {
  const { type, label } = node;
  const width = node.width || 180;
  const height = node.height || 80;
  
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Modern Theme Colors (Red/White)
  const fillColor = '#ffffff';
  // If selected, use Rose-600, otherwise standard Slate
  const strokeColor = selected ? '#e11d48' : '#94a3b8'; // rose-600 : slate-400
  const strokeWidth = selected ? 2.5 : 1.5;
  const textColor = '#334155'; // Slate 700

  useEffect(() => {
    setEditValue(label);
  }, [label]);

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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(label);
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent) => {
      // Critical for preventing browser drag/select behaviors that interrupt custom DnD
      e.preventDefault(); 
      onMouseDown(e, node.id);
  };

  const commonProps = {
    fill: fillColor,
    stroke: strokeColor,
    strokeWidth: strokeWidth,
    // Apply SVG filter for shadow
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
        // Use a slight rounded rect for process nodes too, it looks friendlier
        return <rect x={-hw} y={-hh} width={w} height={h} rx={8} ry={8} {...commonProps} />;
    }
  };

  const renderResizeHandle = (handle: string, x: number, y: number, cursor: string) => (
    <rect
      x={x - 4} y={y - 4} width={8} height={8}
      fill="#ffffff" stroke="#e11d48" strokeWidth={1}
      className={cursor}
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
        className="cursor-crosshair transition-all duration-200 hover:r-8 hover:fill-red-500"
        onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault(); // Fix for connection dropping
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
      
      {/* Editor Area */}
      {isEditing ? (
        <foreignObject x={-width / 2 + 10} y={-height / 2 + 10} width={width - 20} height={height - 20}>
          <textarea
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full h-full p-1 text-center text-sm border-none outline-none resize-none bg-red-50/50 rounded flex items-center justify-center leading-tight overflow-hidden font-sans"
            style={{ color: textColor, fontSize: '14px', fontWeight: 500 }}
          />
        </foreignObject>
      ) : (
        <foreignObject x={-width / 2 + 10} y={-height / 2 + 10} width={width - 20} height={height - 20} style={{ pointerEvents: 'none' }}>
          <div className="w-full h-full flex items-center justify-center text-center leading-tight overflow-hidden">
            <span style={{ color: textColor, fontSize: '14px', fontWeight: 500, fontFamily: 'Inter, sans-serif' }} className="select-none break-words w-full">
              {label}
            </span>
          </div>
        </foreignObject>
      )}

      {/* Resize Handles (Selected) */}
      {selected && !isEditing && (
        <>
          {renderResizeHandle('nw', -width / 2, -height / 2, 'cursor-nw-resize')}
          {renderResizeHandle('ne', width / 2, -height / 2, 'cursor-ne-resize')}
          {renderResizeHandle('sw', -width / 2, height / 2, 'cursor-sw-resize')}
          {renderResizeHandle('se', width / 2, height / 2, 'cursor-se-resize')}
        </>
      )}

      {/* Connectors (Hovered or Selected) */}
      {(isHovered || selected) && !isEditing && (
          <g className="opacity-0 hover:opacity-100 transition-opacity duration-200" style={{ opacity: isHovered || selected ? 1 : 0 }}>
              <Connector x={0} y={-height/2} /> {/* Top */}
              <Connector x={0} y={height/2} />  {/* Bottom */}
              <Connector x={width/2} y={0} />   {/* Right */}
              <Connector x={-width/2} y={0} />  {/* Left */}
          </g>
      )}
    </g>
  );
};

export default NodeShape;
