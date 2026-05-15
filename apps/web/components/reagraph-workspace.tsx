"use client"

import { Button } from "@workspace/ui/components/button"
import { Maximize } from "lucide-react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import * as React from "react"
import {
  type ContextMenuEvent,
  darkTheme,
  type GraphCanvasProps,
  type GraphCanvasRef,
  type InternalGraphEdge,
  type InternalGraphNode,
  type LayoutTypes,
  lightTheme,
  type NodeRendererProps,
  Sphere,
  SphereWithIcon,
} from "reagraph"

import type { GraphPayload } from "@/lib/graph-types"
import {
  emptyStyling,
  getRelationshipColor,
  type StylingState,
  styleNodes,
} from "@/lib/node-styling"
import { iconToDataUri } from "@/lib/style-icons"

const GraphCanvas = dynamic(
  () => import("reagraph").then((module) => module.GraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Preparing graph canvas
      </div>
    ),
  }
) as React.ComponentType<GraphCanvasProps & React.RefAttributes<GraphCanvasRef>>

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
  canvasKey?: string | number
  hiddenCategories: string[]
  styling?: StylingState
  selected: GraphSelection
  onSelect: (selection: GraphSelection) => void
  onExpandNode: (nodeId: string) => void
}

export function ReagraphWorkspace({
  graph,
  mode,
  canvasKey,
  hiddenCategories,
  styling = emptyStyling,
  selected,
  onSelect,
  onExpandNode,
}: ReagraphWorkspaceProps) {
  const canvasRef = React.useRef<GraphCanvasRef>(null)
  const { resolvedTheme } = useTheme()
  const canvasBackground = useResolvedCssVar("--background")
  const graphTheme = React.useMemo(() => {
    const base = resolvedTheme === "light" ? lightTheme : darkTheme
    if (!canvasBackground) {
      return base
    }
    return {
      ...base,
      canvas: { ...base.canvas, background: canvasBackground },
    }
  }, [canvasBackground, resolvedTheme])
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
  const styled = React.useMemo(
    () => styleNodes(graph, styling),
    [graph, styling]
  )
  const nodes = React.useMemo(
    () =>
      visibleNodes.map((node) => {
        const style = styled.get(node.id)
        const iconUri = style?.icon
          ? iconToDataUri(style.icon, "#0f1115")
          : null
        return {
          id: node.id,
          label: style?.caption ?? node.caption,
          subLabel:
            style?.hoverText && style.hoverText.length > 0
              ? style.hoverText
              : node.labels.join(", "),
          fill: style?.color ?? node.color,
          size: style?.size ?? node.size,
          icon: iconUri ?? undefined,
          data: node,
        }
      }),
    [styled, visibleNodes]
  )
  const edges = React.useMemo(
    () =>
      visibleRelationships.map((relationship) => ({
        id: relationship.id,
        source: relationship.source,
        target: relationship.target,
        label: relationship.type,
        fill: getRelationshipColor(relationship.type, styling),
        arrowPlacement: "end" as const,
        data: relationship,
      })),
    [visibleRelationships, styling]
  )
  const selections = selected ? [selected.id] : []
  const layoutType: LayoutTypes =
    mode === "3d" ? "forceDirected3d" : "forceDirected2d"
  const cameraMode = mode === "3d" ? "rotate" : "pan"

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background">
      <GraphCanvasErrorBoundary
        key={canvasKey}
        fallback={
          <StaticGraphFallback
            graph={graph}
            hiddenCategories={hiddenCategories}
            styling={styling}
            selected={selected}
            onSelect={onSelect}
          />
        }
      >
        <GraphCanvas
          key={canvasKey}
          ref={canvasRef}
          nodes={nodes}
          edges={edges}
          theme={graphTheme}
          layoutType={layoutType}
          cameraMode={cameraMode}
          selections={selections}
          draggable
          animated
          labelType="all"
          edgeArrowPosition="end"
          edgeLabelPosition="natural"
          lassoType="all"
          minZoom={0.2}
          maxZoom={80}
          renderNode={renderNode}
          contextMenu={(event: ContextMenuEvent) =>
            renderContextMenu(event, onExpandNode)
          }
          onCanvasClick={() => onSelect(null)}
          onNodeClick={(node: InternalGraphNode) =>
            onSelect({ type: "node", id: node.id })
          }
          onEdgeClick={(edge: InternalGraphEdge) =>
            onSelect({ type: "relationship", id: edge.id })
          }
        />
      </GraphCanvasErrorBoundary>
      <div className="pointer-events-none absolute right-4 bottom-4 flex flex-col gap-2 rounded-md border border-border bg-muted/90 p-2 text-xs text-muted-foreground shadow-xl">
        <Button
          className="pointer-events-auto rounded border border-border px-2 py-1 hover:bg-accent"
          onClick={() => canvasRef.current?.fitNodesInView()}
          type="button"
          variant="outline"
        >
          Fit
        </Button>
        <Button
          className="pointer-events-auto rounded border border-border px-2 py-1 hover:bg-accent"
          onClick={() => canvasRef.current?.centerGraph()}
          type="button"
          variant="outline"
        >
          Center
        </Button>
      </div>
    </div>
  )
}

function renderNode(props: NodeRendererProps) {
  if (props.node.icon) {
    return <SphereWithIcon {...props} image={props.node.icon} />
  }

  return <Sphere {...props} />
}

function renderContextMenu(
  event: ContextMenuEvent,
  onExpandNode: (nodeId: string) => void
) {
  const isEdge = "source" in event.data
  if (isEdge) return null

  const nodeId = event.data.id

  return (
    <GraphContextMenu onClose={event.onClose}>
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
        type="button"
        onClick={() => {
          onExpandNode(nodeId)
          event.onClose()
        }}
      >
        <Maximize className="size-3.5 shrink-0" />
        Expand
      </button>
    </GraphContextMenu>
  )
}

function GraphContextMenu({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent | MouseEvent) {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return
      }

      onClose()
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer, true)
    document.addEventListener("contextmenu", closeOnOutsidePointer, true)
    document.addEventListener("keydown", closeOnEscape, true)

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true)
      document.removeEventListener("contextmenu", closeOnOutsidePointer, true)
      document.removeEventListener("keydown", closeOnEscape, true)
    }
  }, [onClose])

  return (
    <div
      className="min-w-36 overflow-hidden rounded-md border border-border bg-popover shadow-md"
      ref={menuRef}
    >
      {children}
    </div>
  )
}

class GraphCanvasErrorBoundary extends React.Component<
  {
    children: React.ReactNode
    fallback: React.ReactNode
  },
  {
    hasError: boolean
  }
> {
  state = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}

function StaticGraphFallback({
  graph,
  hiddenCategories,
  styling = emptyStyling,
  selected,
}: Omit<ReagraphWorkspaceProps, "mode" | "onExpandNode">) {
  const visibleNodes = graph.nodes.filter(
    (node) => !hiddenCategories.includes(node.labels[0] ?? "Node")
  )
  const styled = styleNodes(graph, styling)
  const centerX = 50
  const centerY = 50
  const radius = 35

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background">
      <svg className="h-full w-full" role="img" viewBox="0 0 100 100">
        <title>Static graph fallback</title>
        {graph.relationships.map((relationship) => {
          const sourceIndex = visibleNodes.findIndex(
            (node) => node.id === relationship.source
          )
          const targetIndex = visibleNodes.findIndex(
            (node) => node.id === relationship.target
          )

          if (sourceIndex < 0 || targetIndex < 0) {
            return null
          }

          const source = getStaticPosition(sourceIndex, visibleNodes.length)
          const target = getStaticPosition(targetIndex, visibleNodes.length)

          return (
            <line
              key={relationship.id}
              stroke="#737b87"
              strokeOpacity="0.65"
              strokeWidth="0.25"
              x1={source.x}
              x2={target.x}
              y1={source.y}
              y2={target.y}
            />
          )
        })}
        {visibleNodes.map((node, index) => {
          const position =
            index === 0
              ? { x: centerX, y: centerY }
              : getStaticPosition(index, visibleNodes.length, radius)
          const style = styled.get(node.id)
          const caption = style?.caption ?? node.caption
          const fill = style?.color ?? node.color
          const size = style?.size ?? node.size

          return (
            <g key={node.id}>
              <circle
                cx={position.x}
                cy={position.y}
                fill={fill}
                opacity={selected?.id === node.id ? "1" : "0.9"}
                r={Math.max(2.2, size / 7)}
                stroke={selected?.id === node.id ? "#ffffff" : "transparent"}
                strokeWidth="0.5"
              />
              <text
                fill="#111416"
                fontSize="2"
                textAnchor="middle"
                x={position.x}
                y={position.y + 0.6}
              >
                {caption.slice(0, 12)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="absolute left-4 bottom-4 rounded-md border border-border bg-muted/90 px-3 py-2 text-xs text-muted-foreground">
        Static canvas fallback
      </div>
    </div>
  )
}

function useResolvedCssVar(variable: string): string | null {
  const [value, setValue] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const root = document.documentElement
    const read = () => {
      const raw = window
        .getComputedStyle(root)
        .getPropertyValue(variable)
        .trim()
      setValue((previous) => {
        const next = normalizeToRgb(raw)
        return next === previous ? previous : next
      })
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    })
    return () => observer.disconnect()
  }, [variable])

  return value
}

function normalizeToRgb(input: string): string | null {
  if (!input) {
    return null
  }
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: false })
  if (!context) {
    return null
  }
  context.fillStyle = "rgba(0, 0, 0, 0)"
  context.fillStyle = input
  if (
    typeof context.fillStyle === "string" &&
    context.fillStyle.startsWith("#")
  ) {
    return context.fillStyle
  }
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

function getStaticPosition(index: number, count: number, radius = 35) {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2

  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
  }
}
