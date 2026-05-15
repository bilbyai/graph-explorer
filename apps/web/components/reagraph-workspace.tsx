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
  lightTheme,
  type NodeRendererProps,
} from "reagraph"
import { CanvasTexture, LinearFilter, type Texture } from "three"

import type { GraphNodeRecord, GraphPayload } from "@/lib/graph-types"
import {
  emptyStyling,
  getRelationshipColor,
  type StylingState,
  styleNodes,
} from "@/lib/node-styling"

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
  canvasKey?: string | number
  hiddenCategories: string[]
  styling?: StylingState
  selected: GraphSelection
  onSelect: (selection: GraphSelection) => void
  onExpandNode: (nodeId: string) => void
}

export function ReagraphWorkspace({
  graph,
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
        return {
          id: node.id,
          label: style?.caption ?? node.caption,
          subLabel:
            style?.hoverText && style.hoverText.length > 0
              ? style.hoverText
              : node.labels.join(", "),
          fill: style?.color ?? node.color,
          size: style?.size ?? node.size,
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

  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = React.useState<GraphNodeRecord | null>(
    null
  )
  const [pointer, setPointer] = React.useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })

  React.useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      setPointer({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }
    el.addEventListener("pointermove", onMove)
    return () => el.removeEventListener("pointermove", onMove)
  }, [])

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden bg-background"
      ref={wrapperRef}
    >
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
          layoutType="forceDirected2d"
          layoutOverrides={{
            nodeStrength: -600,
            linkDistance: 140,
          }}
          cameraMode="pan"
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
          onCanvasClick={() => {
            onSelect(null)
            setHoveredNode(null)
          }}
          onNodeClick={(node: InternalGraphNode) =>
            onSelect({ type: "node", id: node.id })
          }
          onEdgeClick={(edge: InternalGraphEdge) =>
            onSelect({ type: "relationship", id: edge.id })
          }
          onNodePointerOver={(node: InternalGraphNode) => {
            const data = (node.data ?? null) as GraphNodeRecord | null
            setHoveredNode(data)
          }}
          onNodePointerOut={() => setHoveredNode(null)}
        />
      </GraphCanvasErrorBoundary>
      {hoveredNode && (
        <NodeHoverCard
          node={hoveredNode}
          pointer={pointer}
          wrapperRef={wrapperRef}
        />
      )}
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
  return <FlatNode {...props} />
}

function FlatNode(props: NodeRendererProps) {
  const { size, color, node, selected, id } = props
  const caption = typeof node.label === "string" ? node.label : ""
  const truncated = truncateForCircle(caption, size)
  const showText = size >= 10 && truncated.length > 0
  const texture = React.useMemo(
    () => (showText ? createCaptionTexture(truncated) : null),
    [truncated, showText]
  )
  React.useEffect(() => () => texture?.dispose(), [texture])

  return (
    <>
      {selected && (
        <mesh position={[0, 0, -0.02]}>
          <circleGeometry args={[size * 1.22, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.4}
            depthWrite={false}
          />
        </mesh>
      )}
      <mesh userData={{ id, type: "node" }}>
        <circleGeometry args={[size, 48]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
      {texture && (
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[size * 1.7, size * 1.7]} />
          <meshBasicMaterial
            map={texture}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </>
  )
}

function createCaptionTexture(text: string): Texture | null {
  if (typeof document === "undefined") return null
  const dpr = 2
  const dim = 256
  const canvas = document.createElement("canvas")
  canvas.width = dim * dpr
  canvas.height = dim * dpr
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.scale(dpr, dpr)
  ctx.fillStyle = "#111316"
  ctx.font =
    '500 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const lines = wrapTextToWidth(ctx, text, dim * 0.86)
  const lineHeight = 32
  const startY = dim / 2 - ((lines.length - 1) * lineHeight) / 2
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line) ctx.fillText(line, dim / 2, startY + i * lineHeight)
  }
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

function wrapTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2
): string[] {
  const lines: string[] = []
  let buffer = ""
  for (const char of text) {
    const candidate = buffer + char
    if (ctx.measureText(candidate).width > maxWidth) {
      if (buffer.length === 0) {
        lines.push(char)
        buffer = ""
      } else {
        lines.push(buffer)
        buffer = char
      }
      if (lines.length === maxLines) {
        const lastIndex = lines.length - 1
        const last = lines[lastIndex] ?? ""
        lines[lastIndex] = `${last.slice(0, Math.max(0, last.length - 1))}…`
        return lines
      }
    } else {
      buffer = candidate
    }
  }
  if (buffer.length > 0) lines.push(buffer)
  return lines
}

function truncateForCircle(text: string, size: number): string {
  if (!text) return ""
  const maxChars = Math.max(6, Math.floor(size * 1.0))
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 1)}…`
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

function NodeHoverCard({
  node,
  pointer,
  wrapperRef,
}: {
  node: GraphNodeRecord
  pointer: { x: number; y: number }
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const primaryLabel = node.labels[0] ?? "Node"
  const entries = Object.entries(node.properties).slice(0, 8)
  const rect = wrapperRef.current?.getBoundingClientRect()
  const maxLeft = (rect?.width ?? 0) - 320 - 16
  const maxTop = (rect?.height ?? 0) - 240
  const left = Math.max(8, Math.min(pointer.x + 16, Math.max(8, maxLeft)))
  const top = Math.max(8, Math.min(pointer.y + 16, Math.max(8, maxTop)))

  return (
    <div
      className="pointer-events-none absolute z-10 w-80 rounded-lg border border-border bg-popover/95 p-4 text-sm text-popover-foreground shadow-xl backdrop-blur"
      style={{ left, top }}
    >
      <div className="mb-3 inline-flex items-center rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-accent-foreground">
        {primaryLabel}
      </div>
      <div className="space-y-2">
        <div className="font-semibold">{node.caption || node.id}</div>
        {entries.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {entries.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="truncate font-mono">{String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </div>
    </div>
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

  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[GraphCanvasErrorBoundary]", error, info)
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
}: Omit<ReagraphWorkspaceProps, "onExpandNode">) {
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
