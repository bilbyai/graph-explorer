"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  BadgeInfo,
  ChevronRight,
  EyeOff,
  Loader2,
  Maximize,
} from "lucide-react"
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

import { IconCenterBox, IconFitBox } from "@/assets/icons"
import type {
  GraphNodeRecord,
  GraphPayload,
  GraphRelationshipRecord,
  NodeRelationshipSummary,
} from "@/lib/graph-types"
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
  | {
      type: "multi"
      ids: string[]
    }
  | null

export function getGraphSelectionIds(selection: GraphSelection): string[] {
  if (!selection) return EMPTY_SELECTIONS
  if (selection.type === "multi") return selection.ids
  return [selection.id]
}

export type ExpandNodeOptions = {
  relType?: string
  direction?: "incoming" | "outgoing" | "both"
}

type ReagraphWorkspaceProps = {
  graph: GraphPayload
  canvasKey?: string | number
  focusRequest?: {
    nodeId: string
    version: number
  } | null
  hiddenCategories: string[]
  hiddenIds?: string[]
  styling?: StylingState
  selected: GraphSelection
  isLoading?: boolean
  isExpanding?: boolean
  onSelect: (selection: GraphSelection) => void
  onExpandNodes: (nodeIds: string[], options?: ExpandNodeOptions) => void
  onFetchRelationshipSummary?: (
    nodeId: string
  ) => Promise<NodeRelationshipSummary>
  onHideId?: (id: string) => void
  onHideIds?: (ids: string[]) => void
}

type ModifierClickEvent = {
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  nativeEvent?: {
    shiftKey?: boolean
    metaKey?: boolean
    ctrlKey?: boolean
  }
  preventDefault?: () => void
  stopPropagation?: () => void
}

export function ReagraphWorkspace({
  graph,
  canvasKey,
  focusRequest,
  hiddenCategories,
  hiddenIds,
  styling = emptyStyling,
  selected,
  isLoading = false,
  isExpanding = false,
  onSelect,
  onExpandNodes,
  onFetchRelationshipSummary,
  onHideId,
  onHideIds,
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
  const hiddenIdSet = React.useMemo(() => new Set(hiddenIds ?? []), [hiddenIds])
  const visibleNodes = React.useMemo(
    () =>
      graph.nodes.filter(
        (node) =>
          !hiddenCategories.includes(node.labels[0] ?? "Node") &&
          !hiddenIdSet.has(node.id)
      ),
    [graph.nodes, hiddenCategories, hiddenIdSet]
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
          visibleNodeIds.has(relationship.target) &&
          !hiddenIdSet.has(relationship.id)
      ),
    [graph.relationships, visibleNodeIds, hiddenIdSet]
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
  const visibleRelationshipIds = React.useMemo(
    () => new Set(edges.map((edge) => edge.id)),
    [edges]
  )
  const selections = React.useMemo(
    () => getGraphSelectionIds(selected),
    [selected]
  )
  const visibleSelectionIds = React.useMemo(
    () => nodes.map((node) => node.id),
    [nodes]
  )
  const layoutOverrides = React.useMemo(
    () => ({ nodeStrength: -600, linkDistance: 140 }),
    []
  )
  const [mode, setMode] = React.useState<"2d" | "3d">("2d")
  const [inspectedRelationshipId, setInspectedRelationshipId] = React.useState<
    string | null
  >(null)
  const inspectedRelationship = React.useMemo(
    () =>
      inspectedRelationshipId
        ? (graph.relationships.find(
            (relationship) => relationship.id === inspectedRelationshipId
          ) ?? null)
        : null,
    [graph.relationships, inspectedRelationshipId]
  )

  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const hoverCardRef = React.useRef<HTMLDivElement>(null)
  const pointerRef = React.useRef({ x: 0, y: 0 })
  const hoveredNodeRef = React.useRef<GraphNodeRecord | null>(null)
  const [hoveredNode, setHoveredNode] = React.useState<GraphNodeRecord | null>(
    null
  )

  const getSelectionFromVisibleIds = React.useCallback(
    (ids: string[]): GraphSelection => {
      const seen = new Set<string>()
      const visibleIds = ids.filter((id) => {
        if (seen.has(id)) return false
        if (!visibleNodeIds.has(id) && !visibleRelationshipIds.has(id)) {
          return false
        }

        seen.add(id)
        return true
      })

      if (visibleIds.length === 0) return null
      if (visibleIds.length > 1) return { type: "multi", ids: visibleIds }

      const id = visibleIds[0]
      if (!id) return null

      if (visibleNodeIds.has(id)) {
        return { type: "node", id }
      }

      if (visibleRelationshipIds.has(id)) {
        return { type: "relationship", id }
      }

      return null
    },
    [visibleNodeIds, visibleRelationshipIds]
  )

  React.useEffect(() => {
    hoveredNodeRef.current = hoveredNode
  }, [hoveredNode])

  React.useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const onMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      if (!hoveredNodeRef.current) return
      positionHoverCard(wrapper, hoverCardRef.current, pointerRef.current)
    }
    wrapper.addEventListener("pointermove", onMove, { passive: true })
    return () => wrapper.removeEventListener("pointermove", onMove)
  }, [])

  React.useLayoutEffect(() => {
    if (!hoveredNode) return
    positionHoverCard(
      wrapperRef.current,
      hoverCardRef.current,
      pointerRef.current
    )
  }, [hoveredNode])

  // Reagraph defaults the wheel action to DOLLY/ZOOM. Override to TRUCK so
  // two-finger trackpad scroll pans via deltaX/deltaY. macOS pinch arrives
  // with ctrlKey=true, which camera-controls always maps to ZOOM regardless
  // of this setting, so pinch-to-zoom keeps working.
  React.useEffect(() => {
    if (mode !== "2d") return
    let cancelled = false
    let attempts = 0
    const apply = () => {
      if (cancelled) return
      const controls = canvasRef.current?.getControls() as
        | { mouseButtons?: { wheel?: number }; dollySpeed?: number }
        | undefined
      if (controls?.mouseButtons) {
        controls.mouseButtons.wheel = 2 // ACTION.TRUCK → two-finger pan
        controls.dollySpeed = 25 // scales pinch zoom (camera-controls default 1)
        return
      }
      if (attempts < 60) {
        attempts += 1
        window.setTimeout(apply, 50)
      }
    }
    apply()
    return () => {
      cancelled = true
    }
  }, [mode])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!(event.metaKey || event.ctrlKey)) return
      if (key !== "a" && key !== "h") return
      if (isEditableKeyboardTarget(event.target)) return

      if (key === "a") {
        if (visibleSelectionIds.length === 0) return
        event.preventDefault()
        onSelect(getSelectionFromVisibleIds(visibleSelectionIds))
        setHoveredNode(null)
        return
      }

      const selectedIds = getGraphSelectionIds(selected)
      if (selectedIds.length === 0) return
      if (!onHideIds && !onHideId) return
      event.preventDefault()
      if (onHideIds) {
        onHideIds(selectedIds)
        return
      }
      for (const id of selectedIds) {
        onHideId?.(id)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [
    getSelectionFromVisibleIds,
    onHideId,
    onHideIds,
    onSelect,
    selected,
    visibleSelectionIds,
  ])

  const handleCanvasClick = React.useCallback(() => {
    onSelect(null)
    setHoveredNode(null)
  }, [onSelect])

  const toggleSelectionId = React.useCallback(
    (id: string) => {
      const selectedIds = getGraphSelectionIds(selected)
      const nextIds = selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id]

      onSelect(getSelectionFromVisibleIds(nextIds))
      setHoveredNode(null)
    },
    [getSelectionFromVisibleIds, onSelect, selected]
  )

  const handleNodeClick = React.useCallback(
    (node: InternalGraphNode, _props?: unknown, event?: ModifierClickEvent) => {
      if (isModifierClick(event)) {
        event?.preventDefault?.()
        event?.stopPropagation?.()
        toggleSelectionId(node.id)
        return
      }

      onSelect({ type: "node", id: node.id })
    },
    [onSelect, toggleSelectionId]
  )

  const handleEdgeClick = React.useCallback(
    (edge: InternalGraphEdge, event?: ModifierClickEvent) => {
      if (isModifierClick(event)) {
        event?.preventDefault?.()
        event?.stopPropagation?.()
        toggleSelectionId(edge.id)
        return
      }

      onSelect({ type: "relationship", id: edge.id })
    },
    [onSelect, toggleSelectionId]
  )

  const handleInspectRelationship = React.useCallback(
    (relationshipId: string) => {
      onSelect({ type: "relationship", id: relationshipId })
      setHoveredNode(null)
      setInspectedRelationshipId(relationshipId)
    },
    [onSelect]
  )

  const handleLassoEnd = React.useCallback(
    (ids?: string[]) => {
      if (!Array.isArray(ids)) return

      onSelect(getSelectionFromVisibleIds(ids))
      setHoveredNode(null)
    },
    [getSelectionFromVisibleIds, onSelect]
  )

  const handleNodePointerOver = React.useCallback((node: InternalGraphNode) => {
    const data = (node.data ?? null) as GraphNodeRecord | null
    setHoveredNode(data)
  }, [])

  const handleNodePointerOut = React.useCallback(() => setHoveredNode(null), [])

  const pendingFocusRef = React.useRef<string[] | null>(null)
  const prevExpandingRef = React.useRef(isExpanding)

  const handleExpandNodes = React.useCallback(
    (nodeIds: string[], options?: ExpandNodeOptions) => {
      pendingFocusRef.current = nodeIds
      onExpandNodes(nodeIds, options)
    },
    [onExpandNodes]
  )

  const handleContextMenu = React.useCallback(
    (event: ContextMenuEvent) => {
      const targetNodeIds = getContextMenuTargetNodeIds(
        event,
        selected,
        visibleNodeIds
      )

      return renderContextMenu(
        event,
        targetNodeIds,
        handleExpandNodes,
        onFetchRelationshipSummary,
        onHideId,
        onHideIds,
        handleInspectRelationship
      )
    },
    [
      handleExpandNodes,
      handleInspectRelationship,
      onFetchRelationshipSummary,
      onHideId,
      onHideIds,
      selected,
      visibleNodeIds,
    ]
  )

  React.useEffect(() => {
    const wasExpanding = prevExpandingRef.current
    prevExpandingRef.current = isExpanding
    if (!wasExpanding || isExpanding) return
    const nodeIds = pendingFocusRef.current
    pendingFocusRef.current = null
    if (!nodeIds || nodeIds.length === 0) return
    // Force-directed layout keeps shifting the new node for a moment; pan
    // once positions have settled, then again to catch any residual drift.
    const firstTimer = window.setTimeout(() => {
      canvasRef.current?.centerGraph?.(nodeIds, { animated: true })
    }, 500)
    const secondTimer = window.setTimeout(() => {
      canvasRef.current?.centerGraph?.(nodeIds, { animated: true })
    }, 1400)
    return () => {
      window.clearTimeout(firstTimer)
      window.clearTimeout(secondTimer)
    }
  }, [isExpanding])

  React.useEffect(() => {
    if (!focusRequest) return
    if (!visibleNodeIds.has(focusRequest.nodeId)) return

    const firstTimer = window.setTimeout(() => {
      canvasRef.current?.centerGraph?.([focusRequest.nodeId], {
        animated: true,
      })
    }, 300)
    const secondTimer = window.setTimeout(() => {
      canvasRef.current?.centerGraph?.([focusRequest.nodeId], {
        animated: true,
      })
    }, 1000)

    return () => {
      window.clearTimeout(firstTimer)
      window.clearTimeout(secondTimer)
    }
  }, [focusRequest, visibleNodeIds])

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden bg-background"
      ref={wrapperRef}
    >
      <GraphCanvasErrorBoundary
        key={`${canvasKey}-${mode}`}
        fallback={
          <StaticGraphFallback
            graph={graph}
            hiddenCategories={hiddenCategories}
            hiddenIds={hiddenIds}
            styling={styling}
            selected={selected}
            onSelect={onSelect}
          />
        }
      >
        <GraphCanvas
          key={`${canvasKey}-${mode}`}
          ref={canvasRef}
          nodes={nodes}
          edges={edges}
          theme={graphTheme}
          layoutType={mode === "3d" ? "forceDirected3d" : "forceDirected2d"}
          layoutOverrides={layoutOverrides}
          cameraMode={mode === "3d" ? "rotate" : "orthographic"}
          selections={selections}
          draggable
          animated
          labelType="all"
          edgeArrowPosition="end"
          edgeLabelPosition="natural"
          lassoType="all"
          minZoom={0.2}
          maxZoom={80}
          renderNode={mode === "3d" ? undefined : renderNode}
          contextMenu={handleContextMenu}
          onLassoEnd={handleLassoEnd}
          onCanvasClick={handleCanvasClick}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onNodePointerOver={handleNodePointerOver}
          onNodePointerOut={handleNodePointerOut}
        />
      </GraphCanvasErrorBoundary>
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/75 backdrop-blur-sm">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Loading graph…</div>
        </div>
      )}
      {!isLoading && graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">No graph data</div>
        </div>
      )}
      {!isLoading && isExpanding && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/10">
          <div className="flex items-center gap-2 rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg">
            <Loader2 className="size-4 animate-spin" />
            Expanding…
          </div>
        </div>
      )}
      {hoveredNode && <NodeHoverCard node={hoveredNode} ref={hoverCardRef} />}
      {inspectedRelationship && (
        <RelationshipInspectDialog
          relationship={inspectedRelationship}
          sourceNode={
            graph.nodes.find(
              (node) => node.id === inspectedRelationship.source
            ) ?? null
          }
          targetNode={
            graph.nodes.find(
              (node) => node.id === inspectedRelationship.target
            ) ?? null
          }
          onClose={() => setInspectedRelationshipId(null)}
        />
      )}
      <TooltipProvider delayDuration={150}>
        <div className="absolute top-3 left-3 flex items-center gap-0.5 rounded-md border border-border bg-muted/90 p-0.5 text-xs shadow-md">
          <Button
            className="h-6 rounded px-2 text-xs"
            onClick={() => setMode("2d")}
            type="button"
            variant={mode === "2d" ? "default" : "ghost"}
          >
            2D
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-6 rounded px-2 text-xs"
                onClick={() => setMode("3d")}
                type="button"
                variant={mode === "3d" ? "default" : "ghost"}
              >
                3D
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              3D mode is experimental and may be unstable.
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <div className="pointer-events-none absolute right-4 bottom-4 flex flex-col gap-2 rounded-md border border-border bg-muted/90 p-2 text-xs text-muted-foreground shadow-xl">
        <Button
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 hover:bg-accent"
          onClick={() => canvasRef.current?.fitNodesInView()}
          type="button"
          variant="outline"
        >
          <IconFitBox className="size-3.5" />
          Fit
        </Button>
        <Button
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 hover:bg-accent"
          onClick={() => canvasRef.current?.centerGraph()}
          type="button"
          variant="outline"
        >
          <IconCenterBox className="size-3.5" />
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

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  )
}

function isModifierClick(event?: ModifierClickEvent) {
  return Boolean(
    event?.shiftKey ||
      event?.metaKey ||
      event?.ctrlKey ||
      event?.nativeEvent?.shiftKey ||
      event?.nativeEvent?.metaKey ||
      event?.nativeEvent?.ctrlKey
  )
}

function getContextMenuTargetNodeIds(
  event: ContextMenuEvent,
  selected: GraphSelection,
  visibleNodeIds: Set<string>
) {
  if ("source" in event.data) return EMPTY_SELECTIONS

  const nodeId = event.data.id
  const selectedNodeIds = getGraphSelectionIds(selected).filter((id) =>
    visibleNodeIds.has(id)
  )

  return selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId]
}

function renderContextMenu(
  event: ContextMenuEvent,
  targetNodeIds: string[],
  onExpandNodes: (nodeIds: string[], options?: ExpandNodeOptions) => void,
  onFetchRelationshipSummary?: (
    nodeId: string
  ) => Promise<NodeRelationshipSummary>,
  onHideId?: (id: string) => void,
  onHideIds?: (ids: string[]) => void,
  onInspectRelationship?: (relationshipId: string) => void
) {
  const isEdge = "source" in event.data
  if (isEdge) {
    const relationshipId = event.data.id

    return (
      <GraphContextMenu onClose={event.onClose}>
        <button
          className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
          type="button"
          onClick={() => {
            onInspectRelationship?.(relationshipId)
            event.onClose()
          }}
        >
          <BadgeInfo className="size-3.5 shrink-0" />
          Inspect
        </button>
      </GraphContextMenu>
    )
  }

  const nodeId = event.data.id
  const nodeIds = targetNodeIds.length > 0 ? targetNodeIds : [nodeId]
  const isMultiNodeTarget = nodeIds.length > 1

  return (
    <GraphContextMenu onClose={event.onClose}>
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
        {isMultiNodeTarget ? "Selected node actions" : "Node actions"}
      </div>
      <ExpandMenuItem
        nodeIds={nodeIds}
        onExpandNodes={onExpandNodes}
        onFetchRelationshipSummary={onFetchRelationshipSummary}
        onCloseMenu={event.onClose}
      />
      {(onHideId || onHideIds) && (
        <button
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
          type="button"
          onClick={() => {
            if (isMultiNodeTarget && onHideIds) {
              onHideIds(nodeIds)
            } else {
              for (const id of nodeIds) {
                onHideId?.(id)
              }
            }
            event.onClose()
          }}
        >
          <span className="flex items-center gap-2">
            <EyeOff className="size-3.5 shrink-0" />
            {isMultiNodeTarget ? `Hide ${nodeIds.length} selected` : "Hide"}
          </span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘ H
          </kbd>
        </button>
      )}
    </GraphContextMenu>
  )
}

function RelationshipInspectDialog({
  relationship,
  sourceNode,
  targetNode,
  onClose,
}: {
  relationship: GraphRelationshipRecord
  sourceNode: GraphNodeRecord | null
  targetNode: GraphNodeRecord | null
  onClose: () => void
}) {
  const propertyEntries = Object.entries(relationship.properties)

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[calc(100svh-2rem)] w-[min(calc(100vw-2rem),56rem)] !max-w-none overflow-hidden border border-border bg-card p-0 text-foreground">
        <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
          <DialogTitle className="font-mono text-xl font-semibold tracking-normal">
            {relationship.type}
          </DialogTitle>
          <DialogDescription className="break-all">
            {relationship.source} {"->"} {relationship.target}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[calc(100svh-8rem)] gap-6 overflow-y-auto px-6 pb-6 text-sm">
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Relationship Properties
            </div>
            {propertyEntries.length > 0 ? (
              <PropertyGrid properties={relationship.properties} />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                This relationship has no properties.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <EntitySummaryCard
              fallbackId={relationship.source}
              node={sourceNode}
            />
            <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-4 px-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div className="flex justify-center">
                <div className="h-16 w-px bg-border" />
              </div>
              <div className="font-mono text-sm text-muted-foreground">
                {relationship.type}
              </div>
            </div>
            <EntitySummaryCard
              fallbackId={relationship.target}
              node={targetNode}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EntitySummaryCard({
  node,
  fallbackId,
}: {
  node: GraphNodeRecord | null
  fallbackId: string
}) {
  const primaryLabel = node?.labels[0] ?? "Node"
  const title = node?.caption || fallbackId
  const properties = node?.properties ?? {}

  return (
    <article className="grid overflow-hidden rounded-md border border-border bg-background sm:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col justify-center gap-3 border-b border-border p-4 sm:border-r sm:border-b-0">
        <div className="break-words text-base font-medium">{title}</div>
        <div className="w-fit rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
          {primaryLabel}
        </div>
      </div>
      <div className="min-w-0 p-4">
        <PropertyGrid
          fallbackRows={{
            Id: fallbackId,
            Labels: node?.labels.join(", ") ?? "",
          }}
          maxEntries={6}
          properties={properties}
        />
      </div>
    </article>
  )
}

function PropertyGrid({
  properties,
  fallbackRows,
  maxEntries,
}: {
  properties: Record<string, unknown>
  fallbackRows?: Record<string, string>
  maxEntries?: number
}) {
  const entries = Object.entries(properties)
  const visibleEntries =
    typeof maxEntries === "number" ? entries.slice(0, maxEntries) : entries
  const rows = [
    ...Object.entries(fallbackRows ?? {}).filter(([, value]) => value),
    ...visibleEntries.map(([key, value]) => [key, formatPropertyValue(value)]),
  ]

  if (rows.length === 0) {
    return (
      <div className="text-sm italic text-muted-foreground">No properties.</div>
    )
  }

  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      {rows.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="min-w-0 truncate font-semibold text-foreground">
            {key}
          </dt>
          <dd className="min-w-0 break-words font-mono text-muted-foreground">
            {value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function formatPropertyValue(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function fetchRelationshipSummaries(
  nodeIds: string[],
  fetchSummary: (nodeId: string) => Promise<NodeRelationshipSummary>
): Promise<NodeRelationshipSummary> {
  const results = await Promise.allSettled(
    nodeIds.map((nodeId) => fetchSummary(nodeId))
  )
  const summaries = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  )

  if (summaries.length === 0 && results.length > 0) {
    throw new Error("Relationship summaries failed")
  }

  const entries = new Map<
    string,
    {
      type: string
      direction: NodeRelationshipSummary["entries"][number]["direction"]
      nodeCount: number
    }
  >()

  for (const summary of summaries) {
    for (const entry of summary.entries) {
      const key = `${entry.direction}:${entry.type}`
      const existing = entries.get(key)
      if (existing) {
        existing.nodeCount += entry.nodeCount
      } else {
        entries.set(key, { ...entry })
      }
    }
  }

  const mergedEntries = Array.from(entries.values()).sort((a, b) =>
    a.type === b.type
      ? a.direction.localeCompare(b.direction)
      : a.type.localeCompare(b.type)
  )

  return {
    total: mergedEntries.reduce((sum, entry) => sum + entry.nodeCount, 0),
    entries: mergedEntries,
  }
}

function ExpandMenuItem({
  nodeIds,
  onExpandNodes,
  onFetchRelationshipSummary,
  onCloseMenu,
}: {
  nodeIds: string[]
  onExpandNodes: (nodeIds: string[], options?: ExpandNodeOptions) => void
  onFetchRelationshipSummary?: (
    nodeId: string
  ) => Promise<NodeRelationshipSummary>
  onCloseMenu: () => void
}) {
  const [isSubmenuOpen, setIsSubmenuOpen] = React.useState(false)
  const [summary, setSummary] = React.useState<NodeRelationshipSummary | null>(
    null
  )
  const [isLoading, setIsLoading] = React.useState(false)
  const [hasError, setHasError] = React.useState(false)
  const closeTimerRef = React.useRef<number | null>(null)
  const hasFetchedRef = React.useRef(false)

  const cancelClose = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = React.useCallback(() => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      setIsSubmenuOpen(false)
    }, 120)
  }, [cancelClose])

  const openSubmenu = React.useCallback(() => {
    cancelClose()
    setIsSubmenuOpen(true)

    if (hasFetchedRef.current || !onFetchRelationshipSummary || isLoading) {
      return
    }

    hasFetchedRef.current = true
    setIsLoading(true)
    setHasError(false)

    fetchRelationshipSummaries(nodeIds, onFetchRelationshipSummary)
      .then((result) => {
        setSummary(result)
      })
      .catch(() => {
        setHasError(true)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [cancelClose, isLoading, nodeIds, onFetchRelationshipSummary])

  React.useEffect(() => () => cancelClose(), [cancelClose])

  const supportsSubmenu = Boolean(onFetchRelationshipSummary)

  return (
    <div
      className="relative"
      onPointerEnter={supportsSubmenu ? openSubmenu : undefined}
      onPointerLeave={supportsSubmenu ? scheduleClose : undefined}
    >
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground data-[open=true]:bg-accent data-[open=true]:text-accent-foreground"
        data-open={supportsSubmenu && isSubmenuOpen ? "true" : "false"}
        type="button"
        onClick={() => {
          if (!supportsSubmenu) {
            onExpandNodes(nodeIds)
            onCloseMenu()
          }
        }}
      >
        <span className="flex items-center gap-2">
          <Maximize className="size-3.5 shrink-0" />
          Expand
        </span>
        {supportsSubmenu && (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {supportsSubmenu && isSubmenuOpen && (
        <ExpandSubmenu
          nodeIds={nodeIds}
          summary={summary}
          isLoading={isLoading}
          hasError={hasError}
          onExpandNodes={onExpandNodes}
          onCloseMenu={onCloseMenu}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        />
      )}
    </div>
  )
}

function ExpandSubmenu({
  nodeIds,
  summary,
  isLoading,
  hasError,
  onExpandNodes,
  onCloseMenu,
  onPointerEnter,
  onPointerLeave,
}: {
  nodeIds: string[]
  summary: NodeRelationshipSummary | null
  isLoading: boolean
  hasError: boolean
  onExpandNodes: (nodeIds: string[], options?: ExpandNodeOptions) => void
  onCloseMenu: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}) {
  const entries = summary?.entries ?? []
  const total = summary?.total ?? 0
  const totalLabel = total === 1 ? "(1 node)" : `(${total} nodes)`

  return (
    <div
      className="absolute top-0 left-full z-20 ml-1 min-w-60 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={isLoading && total === 0}
        onClick={() => {
          onExpandNodes(nodeIds)
          onCloseMenu()
        }}
      >
        <span>All</span>
        <span className="text-xs text-muted-foreground">
          {isLoading && total === 0 ? "…" : totalLabel}
        </span>
      </button>
      <div className="my-1 h-px bg-border" />
      {isLoading && entries.length === 0 && (
        <div className="px-2 py-2 text-xs text-muted-foreground">
          Loading relationships…
        </div>
      )}
      {!isLoading && hasError && (
        <div className="px-2 py-2 text-xs text-muted-foreground">
          Could not load relationships
        </div>
      )}
      {!isLoading && !hasError && entries.length === 0 && summary && (
        <div className="px-2 py-2 text-xs text-muted-foreground">
          No relationships
        </div>
      )}
      {entries.map((entry) => {
        const key = `${entry.direction}:${entry.type}`
        const arrowLeft = entry.direction === "incoming" ? "←" : "—"
        const arrowRight = entry.direction === "outgoing" ? "→" : "—"
        const countLabel =
          entry.nodeCount === 1 ? "(1 node)" : `(${entry.nodeCount} nodes)`

        return (
          <button
            key={key}
            className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            type="button"
            onClick={() => {
              onExpandNodes(nodeIds, {
                relType: entry.type,
                direction: entry.direction,
              })
              onCloseMenu()
            }}
          >
            <span className="flex min-w-0 items-center gap-2 font-mono text-xs">
              <span className="text-muted-foreground">{arrowLeft}</span>
              <span className="truncate">{entry.type}</span>
              <span className="text-muted-foreground">{arrowRight}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {countLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function NodeHoverCard({
  node,
  ref,
}: {
  node: GraphNodeRecord
  ref: React.Ref<HTMLDivElement>
}) {
  const primaryLabel = node.labels[0] ?? "Node"
  const entries = Object.entries(node.properties).slice(0, 8)

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-10 w-80 rounded-lg border border-border bg-popover/95 p-4 text-sm text-popover-foreground shadow-xl backdrop-blur will-change-transform"
      ref={ref}
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

function positionHoverCard(
  wrapper: HTMLDivElement | null,
  card: HTMLDivElement | null,
  pointer: { x: number; y: number }
) {
  if (!wrapper || !card) return
  const rect = wrapper.getBoundingClientRect()
  const x = pointer.x - rect.left
  const y = pointer.y - rect.top
  const cardWidth = card.offsetWidth || 320
  const cardHeight = card.offsetHeight || 240
  const maxLeft = rect.width - cardWidth - 16
  const maxTop = rect.height - cardHeight - 16
  const left = Math.max(8, Math.min(x + 16, Math.max(8, maxLeft)))
  const top = Math.max(8, Math.min(y + 16, Math.max(8, maxTop)))
  card.style.transform = `translate3d(${left}px, ${top}px, 0)`
}

const EMPTY_SELECTIONS: string[] = []

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
      className="min-w-40 rounded-md border border-border bg-popover p-1 shadow-md"
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
  hiddenIds = EMPTY_SELECTIONS,
  styling = emptyStyling,
  selected,
}: Omit<ReagraphWorkspaceProps, "onExpandNodes">) {
  const hiddenIdSet = new Set(hiddenIds)
  const visibleNodes = graph.nodes.filter(
    (node) =>
      !hiddenCategories.includes(node.labels[0] ?? "Node") &&
      !hiddenIdSet.has(node.id)
  )
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const selectedIds = new Set(getGraphSelectionIds(selected))
  const styled = styleNodes(graph, styling)
  const centerX = 50
  const centerY = 50
  const radius = 35

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background">
      <svg className="h-full w-full" role="img" viewBox="0 0 100 100">
        <title>Static graph fallback</title>
        {graph.relationships.map((relationship) => {
          if (hiddenIdSet.has(relationship.id)) {
            return null
          }

          if (
            !visibleNodeIds.has(relationship.source) ||
            !visibleNodeIds.has(relationship.target)
          ) {
            return null
          }

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
                opacity={selectedIds.has(node.id) ? "1" : "0.9"}
                r={Math.max(2.2, size / 7)}
                stroke={selectedIds.has(node.id) ? "#ffffff" : "transparent"}
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
