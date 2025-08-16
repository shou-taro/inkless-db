import { memo } from 'react';
import {
  Background,
  MiniMap,
  ReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeMouseHandler,
  type ReactFlowInstance,
  type FitViewOptions,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

/**
 * GraphCanvas
 * -----------
 * Thin, reusable wrapper that encapsulates the React Flow canvas and its
 * common chrome (background grid, mini map, controls). The component keeps
 * layout and visual defaults inside, while exposing only the state and event
 * handlers needed by a page-level container such as GraphPage.
 *
 * Why separate this?
 * ------------------
 * - Improves readability of the page container by hiding verbose JSX.
 * - Encourages consistent styling and behaviour across multiple screens.
 * - Makes it trivial to unit-/visual-test the canvas in isolation.
 *
 * Notes for contributors
 * ----------------------
 * - Appearance is opinionated but adjustable via props such as `className`
 *   and `nodeTypes`. Avoid sprinkling styling across callers; extend here.
 * - React Flow APIs expect CSS colours (not Tailwind classes). We therefore set
 *   CSS custom properties on the wrapper using Tailwind's arbitrary values and
 *   reference them here (e.g. `var(--edge-stroke)`).
 */

// ---- Visual tokens (keep in sync with tailwind.config.js where relevant) ----
// (Colours now referenced via CSS variables set on the wrapper)
//
// Palette notes (en‑GB)
// - Edge stroke: violet-500 for sufficient contrast on light tints
// - Labels: slate-700 for legibility over soft backgrounds
// - Mini map: violet-200 fill with violet-600 stroke for clear silhouette
// - Grid lines: a faint violet to aid alignment without visual noise

// Default edge styling used by the canvas. Centralising this keeps edges coherent.
const DEFAULT_EDGE = {
  markerEnd: {
    type: MarkerType.ArrowClosed as const,
    width: 18,
    height: 18,
    color: 'var(--edge-stroke)',
  },
  style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
  labelStyle: {
    fill: 'var(--label-fill)',
    fontSize: 10,
    fontWeight: 600 as const,
  },
};

export type GraphCanvasProps = {
  /** Graph nodes (managed in the parent via useNodesState) */
  nodes: Node[];
  /** Graph edges (managed in the parent via useEdgesState) */
  edges: Edge[];
  /** Node change handler from useNodesState */
  onNodesChange: OnNodesChange;
  /** Edge change handler from useEdgesState */
  onEdgesChange: OnEdgesChange;
  /** Optional connect handler if interactive edge creation is desired */
  onConnect?: OnConnect;
  /** Custom node renderers, e.g. { table: TableNode } */
  nodeTypes?: NodeTypes;
  /** Called once the ReactFlow instance is ready */
  onInit?: (instance: ReactFlowInstance) => void;
  /** Called when a node is clicked (e.g. to open a side panel) */
  onNodeClick?: NodeMouseHandler;
  /** Optional extra classes for the outer wrapper */
  className?: string;
  /** Whether to fit the view to nodes on initial mount */
  fitView?: boolean;
  /**
   * When `fitView` is enabled, these options let callers tweak padding or
   * include hidden nodes. Particularly useful to avoid overly wide layouts
   * on small schemas.
   */
  fitViewOptions?: FitViewOptions;
};

/**
 * Renders the graph canvas with sensible defaults.
 * Keep this presentational: state lives in the container.
 */
function GraphCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  nodeTypes,
  onInit,
  onNodeClick,
  className,
  fitView = true,
  fitViewOptions,
}: GraphCanvasProps) {
  return (
    <div
      className={`relative h-full w-full bg-violet-100 [--edge-stroke:theme('colors.violet.500')] [--grid-color:rgba(124,58,237,0.12)] [--label-fill:theme('colors.slate.700')] [--minimap-fill:theme('colors.violet.200')] [--minimap-stroke:theme('colors.violet.600')] ${className ?? ''}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges.map((e) => ({
          ...DEFAULT_EDGE,
          ...e,
          // Allow callers to override styles while keeping brand defaults.
          style: { ...DEFAULT_EDGE.style, ...e.style },
          labelStyle: { ...DEFAULT_EDGE.labelStyle, ...e.labelStyle },
          markerEnd: { ...DEFAULT_EDGE.markerEnd, ...(e as any).markerEnd },
        }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onInit={onInit}
        onNodeClick={onNodeClick}
        fitView={fitView}
        fitViewOptions={fitViewOptions}
      >
        {/* Subtle grid for spatial guidance; keep type-safe with default variant */}
        <Background gap={24} size={2} color="var(--grid-color)" />

        {/* Overview of the graph; colours use CSS variables set via Tailwind */}
        <MiniMap
          pannable
          zoomable
          nodeStrokeColor={() => 'var(--minimap-stroke)'}
          nodeColor={() => 'var(--minimap-fill)'}
          maskColor="rgba(226, 218, 232, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}

export default memo(GraphCanvas);
