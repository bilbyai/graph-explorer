"use client"

import dynamic from "next/dynamic"
import * as React from "react"
import type {
  GraphCanvasProps,
  GraphCanvasRef,
  InternalGraphEdge,
  InternalGraphNode,
  LayoutTypes,
} from "reagraph"

import type { GraphPayload } from "@/lib/graph-types"

const GraphCanvas = dynamic(
  () => import("reagraph").then((module) => module.GraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Preparing graph canvas
      </div>
    ),
  }
) as React.ComponentType<
  GraphCanvasProps & React.RefAttributes<GraphCanvasRef>
>

export type GraphSelection =
  | {
      type: "node"
      id: string
    }
  | {
      type: "relationship"
      id: string
    }
  | null

type ReagraphWorkspaceProps = {
  graph: GraphPayload
  mode: "2d" | "3d"
  hiddenCategories: string[]
  selected: GraphSelection
  onSelect: (selection: GraphSelection) => void
}

export function ReagraphWorkspace({
  graph,
  mode,
  hiddenCategories,
  selected,
  onSelect,
}: ReagraphWorkspaceProps) {
  const canvasRef = React.useRef<GraphCanvasRef>(null)
  const visibleNodes = React.useMemo(
    () =>
      graph.nodes.filter(
        (node) => !hiddenCategories.includes(node.labels[0] ?? "Node")
      ),
    [graph.nodes, hiddenCategories]
  )
  const visibleNodeIds = React.useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes]
  )
  const visibleRelationships = React.useMemo(
    () =>
      graph.relationships.filter(
        (relationship) =>
          visibleNodeIds.has(relationship.source) &&
          visibleNodeIds.has(relationship.target)
      ),
    [graph.relationships, visibleNodeIds]
  )
  const nodes = React.useMemo(
    () =>
      visibleNodes.map((node) => ({
        id: node.id,
        label: node.caption,
        subLabel: node.labels.join(", "),
        fill: node.color,
        size: node.size,
        data: node,
      })),
    [visibleNodes]
  )
  const edges = React.useMemo(
    () =>
      visibleRelationships.map((relationship) => ({
        id: relationship.id,
        source: relationship.source,
        target: relationship.target,
        label: relationship.type,
        fill: "#8f97a3",
        arrowPlacement: "end" as const,
        data: relationship,
      })),
    [visibleRelationships]
  )
  const selections = selected ? [selected.id] : []
  const layoutType: LayoutTypes =
    mode === "3d" ? "forceDirected3d" : "forceDirected2d"

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#141719]">
      <GraphCanvas
        ref={canvasRef}
        nodes={nodes}
        edges={edges}
        layoutType={layoutType}
        selections={selections}
        draggable
        animated
        aggregateEdges
        labelType="all"
        edgeArrowPosition="end"
        edgeLabelPosition="natural"
        lassoType="all"
        minZoom={0.2}
        maxZoom={80}
        onCanvasClick={() => onSelect(null)}
        onNodeClick={(node: InternalGraphNode) =>
          onSelect({ type: "node", id: node.id })
        }
        onEdgeClick={(edge: InternalGraphEdge) =>
          onSelect({ type: "relationship", id: edge.id })
        }
      />
      <div className="pointer-events-none absolute right-4 bottom-4 flex flex-col gap-2 rounded-md border border-white/10 bg-[#1c2024]/90 p-2 text-xs text-zinc-300 shadow-xl">
        <button
          className="pointer-events-auto rounded border border-white/10 px-2 py-1 hover:bg-white/10"
          onClick={() => canvasRef.current?.fitNodesInView()}
          type="button"
        >
          Fit
        </button>
        <button
          className="pointer-events-auto rounded border border-white/10 px-2 py-1 hover:bg-white/10"
          onClick={() => canvasRef.current?.centerGraph()}
          type="button"
        >
          Center
        </button>
      </div>
    </div>
  )
}
