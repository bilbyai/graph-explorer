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
  Minus,
  Orbit,
  Plus,
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
import { CanvasTexture, LinearFilter, type Texture, Vector3 } from "three"

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

const autoLabelNodeThreshold = 250
const lightRenderNodeThreshold = 750
const lightRenderRelationshipThreshold = 1500
const minZoomPercent = 20
const maxZoomPercent = 8000
const spinRadiansPerMillisecond = 0.00015

type SpinCameraControls = {
  rotate: (
    azimuthAngle: number,
    polarAngle: number,
    enableTransition?: boolean
  ) => Promise<void>
  addEventListener: (
    type: "controlstart" | "controlend",
    listener: () => void
  ) => void
  removeEventListener: (
    type: "controlstart" | "controlend",
    listener: () => void
  ) => void
}

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
  hiddenRelationshipTypes?: string[]
  hiddenIds?: string[]
  styling?: StylingState
  selected: GraphSelection
  isLoading?: boolean
  isExpanding?: boolean
  onSelect: (selection: GraphSelection) => void
  onClearScene?: () => void
  onExpandNodes: (nodeIds: string[], options?: ExpandNodeOptions) => void
  onFetchRelationshipSummary?: (
    nodeIds: string[]
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
  hiddenRelationshipTypes = EMPTY_SELECTIONS,
  hiddenIds,
  styling = emptyStyling,
  selected,
  isLoading = false,
  isExpanding = false,
  onSelect,
  onClearScene,
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
  const [mode, setMode] = React.useState<"2d" | "3d">("2d")
  const hiddenIdSet = React.useMemo(() => new Set(hiddenIds ?? []), [hiddenIds])
  const [sceneMenuPosition, setSceneMenuPosition] = React.useState<{
    x: number
    y: number
  } | null>(null)
  const reagraphContextMenuPendingRef = React.useRef(false)
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
          !hiddenRelationshipTypes.includes(relationship.type) &&
          !hiddenIdSet.has(relationship.id)
      ),
    [graph.relationships, visibleNodeIds, hiddenRelationshipTypes, hiddenIdSet]
  )
  const singleNodeIds = React.useMemo(() => {
    const connectedNodeIds = new Set<string>()
    for (const relationship of visibleRelationships) {
      connectedNodeIds.add(relationship.source)
      connectedNodeIds.add(relationship.target)
    }

    const ids: string[] = []
    for (const node of visibleNodes) {
      if (!connectedNodeIds.has(node.id)) {
        ids.push(node.id)
      }
    }

    return ids
  }, [visibleNodes, visibleRelationships])
  const adaptiveRendering = React.useMemo(() => {
    const nodeCount = visibleNodes.length
    const relationshipCount = visibleRelationships.length
    const useLightRendering =
      isExpanding ||
      nodeCount >= lightRenderNodeThreshold ||
      relationshipCount >= lightRenderRelationshipThreshold

    return {
      animated: !useLightRendering,
      draggable: !useLightRendering,
      edgeArrowPosition:
        useLightRendering || relationshipCount >= autoLabelNodeThreshold
          ? ("none" as const)
          : ("end" as const),
      labelType: isExpanding
        ? ("none" as const)
        : nodeCount >= autoLabelNodeThreshold ||
            relationshipCount >= autoLabelNodeThreshold
          ? ("auto" as const)
          : ("all" as const),
      lassoType: useLightRendering ? ("node" as const) : ("all" as const),
      useCustomNodeRenderer: mode === "2d" && !useLightRendering,
    }
  }, [isExpanding, mode, visibleNodes.length, visibleRelationships.length])
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
        arrowPlacement: adaptiveRendering.edgeArrowPosition,
        data: relationship,
      })),
    [adaptiveRendering.edgeArrowPosition, visibleRelationships, styling]
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
  const [spinEnabled, setSpinEnabled] = React.useState(false)
  const cameraMode = mode === "3d" ? "rotate" : "orthographic"
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
  const relationshipSummaryCacheRef = React.useRef(
    new Map<string, Promise<NodeRelationshipSummary>>()
  )
  const relationshipSummaryFetcherRef = React.useRef(onFetchRelationshipSummary)
  const relationshipSummaryGraphRef = React.useRef(graph)
  const relationshipSummaryVisibilityKey = React.useMemo(
    () =>
      JSON.stringify({
        hiddenCategories,
        hiddenRelationshipTypes,
        hiddenIds: hiddenIds ?? EMPTY_SELECTIONS,
      }),
    [hiddenCategories, hiddenRelationshipTypes, hiddenIds]
  )
  const [hoveredNode, setHoveredNode] = React.useState<GraphNodeRecord | null>(
    null
  )
  const [zoomPercent, setZoomPercent] = React.useState(100)
  const displayedZoomPercent = useLerpedInteger(zoomPercent)
  const [isEditingZoom, setIsEditingZoom] = React.useState(false)
  const [zoomInputValue, setZoomInputValue] = React.useState("100")
  const zoomInputRef = React.useRef<HTMLInputElement>(null)
  const shouldApplyZoomInputOnBlurRef = React.useRef(true)
  const graphCanvasControlsKey = `${canvasKey ?? "default"}-${mode}`

  const syncZoomPercent = React.useCallback(() => {
    const nextZoomPercent = getCanvasZoomPercent(canvasRef.current)
    if (nextZoomPercent === null) return
    setZoomPercent((currentZoomPercent) =>
      currentZoomPercent === nextZoomPercent
        ? currentZoomPercent
        : nextZoomPercent
    )
  }, [])

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
    relationshipSummaryFetcherRef.current = onFetchRelationshipSummary
  }, [onFetchRelationshipSummary])

  React.useEffect(() => {
    if (relationshipSummaryGraphRef.current === graph) return
    relationshipSummaryGraphRef.current = graph
    relationshipSummaryCacheRef.current.clear()
  })

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

  React.useEffect(() => {
    if (!isEditingZoom) return
    zoomInputRef.current?.focus()
    zoomInputRef.current?.select()
  }, [isEditingZoom])

  React.useEffect(() => {
    if (!graphCanvasControlsKey) return

    let cancelled = false
    let attempts = 0
    let retryTimer: number | null = null
    let cleanup: (() => void) | null = null

    const attach = () => {
      if (cancelled) return

      const controls = canvasRef.current?.getControls?.()
      if (!controls) {
        if (attempts < 60) {
          attempts += 1
          retryTimer = window.setTimeout(attach, 50)
        }
        return
      }

      const syncFromControls = () => {
        const nextZoomPercent = getControlsZoomPercent(controls)
        if (nextZoomPercent === null) return
        setZoomPercent((currentZoomPercent) =>
          currentZoomPercent === nextZoomPercent
            ? currentZoomPercent
            : nextZoomPercent
        )
      }

      controls.addEventListener("update", syncFromControls)
      controls.addEventListener("rest", syncFromControls)
      syncFromControls()

      cleanup = () => {
        controls.removeEventListener("update", syncFromControls)
        controls.removeEventListener("rest", syncFromControls)
      }
    }

    attach()

    return () => {
      cancelled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
      cleanup?.()
    }
  }, [graphCanvasControlsKey])

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

  const pendingFocusRef = React.useRef<string[] | null>(null)
  const prevExpandingRef = React.useRef(isExpanding)

  const handleExpandNodes = React.useCallback(
    (nodeIds: string[], options?: ExpandNodeOptions) => {
      pendingFocusRef.current = nodeIds
      onExpandNodes(nodeIds, options)
    },
    [onExpandNodes]
  )

  React.useEffect(() => {
    if (cameraMode === "orthographic") return

    let cancelled = false
    let attempts = 0
    let shiftPressed = false
    const apply = () => {
      if (cancelled) return
      const controls = canvasRef.current?.getControls() as
        | { mouseButtons?: { left?: number } }
        | undefined
      if (controls?.mouseButtons) {
        controls.mouseButtons.left = shiftPressed ? 2 : 1
        return
      }
      if (attempts < 60) {
        attempts += 1
        window.setTimeout(apply, 50)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift" || shiftPressed) return
      shiftPressed = true
      apply()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return
      shiftPressed = false
      apply()
    }
    const onBlur = () => {
      shiftPressed = false
      apply()
    }

    apply()
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)

    return () => {
      cancelled = true
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [cameraMode])

  React.useEffect(() => {
    if (mode === "3d" || !spinEnabled) return
    setSpinEnabled(false)
  }, [mode, spinEnabled])

  React.useEffect(() => {
    if (mode !== "3d" || !spinEnabled) return

    let controls: SpinCameraControls | null = null
    let frameId: number | null = null
    let previousTime: number | null = null
    let isControlling = false

    const onControlStart = () => {
      isControlling = true
      previousTime = null
    }
    const onControlEnd = () => {
      isControlling = false
      previousTime = null
    }
    const detachControls = () => {
      controls?.removeEventListener("controlstart", onControlStart)
      controls?.removeEventListener("controlend", onControlEnd)
      controls = null
    }
    const syncControls = () => {
      const nextControls = canvasRef.current?.getControls?.() as
        | SpinCameraControls
        | null
        | undefined
      if (nextControls === controls) return

      detachControls()
      controls = nextControls ?? null
      controls?.addEventListener("controlstart", onControlStart)
      controls?.addEventListener("controlend", onControlEnd)
    }
    const tick = (time: number) => {
      syncControls()

      if (controls && !isControlling) {
        if (previousTime !== null) {
          const delta = Math.min(time - previousTime, 32)
          void controls.rotate(delta * spinRadiansPerMillisecond, 0, false)
        }
        previousTime = time
      }

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      detachControls()
    }
  }, [mode, spinEnabled])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!(event.metaKey || event.ctrlKey)) return
      if (key !== "a" && key !== "e" && key !== "h") return
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

      if (key === "e") {
        const selectedVisibleNodeIds = selectedIds.filter((id) =>
          visibleNodeIds.has(id)
        )
        if (selectedVisibleNodeIds.length === 0) return
        event.preventDefault()
        handleExpandNodes(selectedVisibleNodeIds)
        return
      }

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
    handleExpandNodes,
    onHideId,
    onHideIds,
    onSelect,
    selected,
    visibleNodeIds,
    visibleSelectionIds,
  ])

  const handleCanvasClick = React.useCallback(() => {
    onSelect(null)
    setHoveredNode(null)
    setSceneMenuPosition(null)
  }, [onSelect])

  const handleWrapperContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()

      if (reagraphContextMenuPendingRef.current) {
        reagraphContextMenuPendingRef.current = false
        return
      }

      const target = event.target
      if (target instanceof Element && target.closest("[data-graph-menu]")) {
        return
      }

      const rect = wrapperRef.current?.getBoundingClientRect()
      if (!rect) return

      setHoveredNode(null)
      setSceneMenuPosition({
        x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 360)),
        y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 160)),
      })
    },
    []
  )

  const handleDismissSingleNodes = React.useCallback(() => {
    if (singleNodeIds.length === 0) return
    onHideIds?.(singleNodeIds)
    setSceneMenuPosition(null)
  }, [onHideIds, singleNodeIds])

  const handleClearScene = React.useCallback(() => {
    onClearScene?.()
    setSceneMenuPosition(null)
  }, [onClearScene])

  const handleZoomIn = React.useCallback(() => {
    canvasRef.current?.zoomIn()
    window.requestAnimationFrame(syncZoomPercent)
  }, [syncZoomPercent])

  const handleZoomOut = React.useCallback(() => {
    canvasRef.current?.zoomOut()
    window.requestAnimationFrame(syncZoomPercent)
  }, [syncZoomPercent])

  const startZoomEdit = React.useCallback(() => {
    shouldApplyZoomInputOnBlurRef.current = true
    setZoomInputValue(String(zoomPercent))
    setIsEditingZoom(true)
  }, [zoomPercent])

  const cancelZoomEdit = React.useCallback(() => {
    shouldApplyZoomInputOnBlurRef.current = false
    setZoomInputValue(String(zoomPercent))
    setIsEditingZoom(false)
  }, [zoomPercent])

  const applyZoomInput = React.useCallback(() => {
    const parsedZoomPercent = Number.parseFloat(zoomInputValue)
    if (!Number.isFinite(parsedZoomPercent)) {
      cancelZoomEdit()
      return
    }

    const nextZoomPercent = clampZoomPercent(Math.round(parsedZoomPercent))
    setZoomPercent(nextZoomPercent)
    setZoomInputValue(String(nextZoomPercent))
    setIsEditingZoom(false)
    void canvasRef.current?.getControls?.()?.zoomTo(nextZoomPercent / 100, true)
  }, [cancelZoomEdit, zoomInputValue])

  const handleZoomInputBlur = React.useCallback(() => {
    if (!shouldApplyZoomInputOnBlurRef.current) {
      shouldApplyZoomInputOnBlurRef.current = true
      return
    }
    applyZoomInput()
  }, [applyZoomInput])

  const handleZoomInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        applyZoomInput()
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        cancelZoomEdit()
      }
    },
    [applyZoomInput, cancelZoomEdit]
  )

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

  const fetchCachedRelationshipSummary = React.useCallback(
    (nodeIds: string[]) => {
      const fetchSummary = relationshipSummaryFetcherRef.current
      if (!fetchSummary) {
        return Promise.reject(new Error("Relationship summary unavailable"))
      }

      const uniqueNodeIds = Array.from(new Set(nodeIds))
      const cacheKey = `${relationshipSummaryVisibilityKey}\0${[
        ...uniqueNodeIds,
      ]
        .sort()
        .join("\0")}`
      const cached = relationshipSummaryCacheRef.current.get(cacheKey)
      if (cached) return cached

      const request = fetchSummary(uniqueNodeIds).catch((error) => {
        relationshipSummaryCacheRef.current.delete(cacheKey)
        throw error
      })
      relationshipSummaryCacheRef.current.set(cacheKey, request)
      return request
    },
    [relationshipSummaryVisibilityKey]
  )

  const handleContextMenu = React.useCallback(
    (event: ContextMenuEvent) => {
      reagraphContextMenuPendingRef.current = true
      window.setTimeout(() => {
        reagraphContextMenuPendingRef.current = false
      }, 0)
      const targetNodeIds = getContextMenuTargetNodeIds(
        event,
        selected,
        visibleNodeIds
      )

      return renderContextMenu(
        event,
        targetNodeIds,
        handleExpandNodes,
        onFetchRelationshipSummary ? fetchCachedRelationshipSummary : undefined,
        onHideId,
        onHideIds,
        handleInspectRelationship
      )
    },
    [
      fetchCachedRelationshipSummary,
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
      centerGraphWithoutTilt(
        canvasRef.current,
        nodeIds,
        { animated: true },
        mode === "2d"
      )
    }, 500)
    const secondTimer = window.setTimeout(() => {
      centerGraphWithoutTilt(
        canvasRef.current,
        nodeIds,
        { animated: true },
        mode === "2d"
      )
    }, 1400)
    return () => {
      window.clearTimeout(firstTimer)
      window.clearTimeout(secondTimer)
    }
  }, [isExpanding, mode])

  React.useEffect(() => {
    if (!focusRequest) return
    if (!visibleNodeIds.has(focusRequest.nodeId)) return

    const firstTimer = window.setTimeout(() => {
      centerGraphWithoutTilt(
        canvasRef.current,
        [focusRequest.nodeId],
        {
          animated: true,
        },
        mode === "2d"
      )
    }, 300)
    const secondTimer = window.setTimeout(() => {
      centerGraphWithoutTilt(
        canvasRef.current,
        [focusRequest.nodeId],
        {
          animated: true,
        },
        mode === "2d"
      )
    }, 1000)

    return () => {
      window.clearTimeout(firstTimer)
      window.clearTimeout(secondTimer)
    }
  }, [focusRequest, visibleNodeIds, mode])

  return (
    <div
      aria-label="Graph workspace"
      className="relative h-full min-h-0 overflow-hidden bg-background"
      onContextMenu={handleWrapperContextMenu}
      ref={wrapperRef}
      role="application"
      tabIndex={-1}
    >
      <GraphCanvasErrorBoundary
        key={`${canvasKey}-${mode}`}
        fallback={
          <StaticGraphFallback
            graph={graph}
            hiddenCategories={hiddenCategories}
            hiddenRelationshipTypes={hiddenRelationshipTypes}
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
          cameraMode={cameraMode}
          selections={selections}
          draggable={adaptiveRendering.draggable}
          animated={adaptiveRendering.animated}
          labelType={adaptiveRendering.labelType}
          edgeArrowPosition={adaptiveRendering.edgeArrowPosition}
          edgeLabelPosition="natural"
          lassoType={adaptiveRendering.lassoType}
          minZoom={0.2}
          maxZoom={80}
          renderNode={
            adaptiveRendering.useCustomNodeRenderer ? renderNode : undefined
          }
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
      {sceneMenuPosition && (
        <SceneContextMenu
          position={sceneMenuPosition}
          singleNodeCount={singleNodeIds.length}
          canDismissSingleNodes={singleNodeIds.length > 0 && !!onHideIds}
          canClearScene={!!onClearScene}
          onClearScene={handleClearScene}
          onDismissSingleNodes={handleDismissSingleNodes}
          onClose={() => setSceneMenuPosition(null)}
        />
      )}
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
      <TooltipProvider delayDuration={150}>
        <fieldset
          className="pointer-events-auto absolute bottom-4 left-4 z-10 grid h-10 grid-cols-[2.25rem_minmax(3.75rem,4.5rem)_2.25rem] items-center overflow-hidden rounded-full border border-border bg-background/90 p-0 text-foreground shadow-xl backdrop-blur"
          data-graph-menu
        >
          <legend className="sr-only">Canvas zoom</legend>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Zoom out"
                className="h-full w-full rounded-none border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={handleZoomOut}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Minus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Zoom out</TooltipContent>
          </Tooltip>
          {isEditingZoom ? (
            <div className="flex h-full items-center justify-center border-x border-border/70 px-2">
              <input
                aria-label="Zoom percentage"
                className="h-full w-full min-w-0 bg-transparent text-center text-sm font-medium tabular-nums outline-none"
                inputMode="decimal"
                onBlur={handleZoomInputBlur}
                onChange={(event) => setZoomInputValue(event.target.value)}
                onKeyDown={handleZoomInputKeyDown}
                ref={zoomInputRef}
                type="text"
                value={zoomInputValue}
              />
              <span className="pointer-events-none text-sm font-medium tabular-nums">
                %
              </span>
            </div>
          ) : (
            <button
              aria-label="Edit zoom percentage"
              className="flex h-full w-full items-center justify-center border-x border-border/70 bg-transparent px-2 text-sm font-medium tabular-nums outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/30"
              onDoubleClick={startZoomEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  startZoomEdit()
                }
              }}
              type="button"
            >
              {displayedZoomPercent}%
            </button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Zoom in"
                className="h-full w-full rounded-none border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={handleZoomIn}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Zoom in</TooltipContent>
          </Tooltip>
        </fieldset>
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
          onClick={() =>
            centerGraphWithoutTilt(
              canvasRef.current,
              undefined,
              {
                animated: true,
              },
              mode === "2d"
            )
          }
          type="button"
          variant="outline"
        >
          <IconCenterBox className="size-3.5" />
          Center
        </Button>
        {mode === "3d" && (
          <Button
            aria-pressed={spinEnabled}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 hover:bg-accent"
            onClick={() => setSpinEnabled((enabled) => !enabled)}
            type="button"
            variant={spinEnabled ? "default" : "outline"}
          >
            <Orbit className="size-3.5" />
            Spin
          </Button>
        )}
      </div>
    </div>
  )
}

function getCanvasZoomPercent(canvas: GraphCanvasRef | null) {
  return getControlsZoomPercent(canvas?.getControls?.())
}

function getControlsZoomPercent(
  controls: ReturnType<GraphCanvasRef["getControls"]> | null | undefined
) {
  const zoom = controls?.camera?.zoom
  if (typeof zoom !== "number" || !Number.isFinite(zoom) || zoom <= 0) {
    return null
  }
  return Math.round(zoom * 100)
}

function clampZoomPercent(zoomPercent: number) {
  return Math.max(minZoomPercent, Math.min(maxZoomPercent, zoomPercent))
}

function useLerpedInteger(targetValue: number) {
  const [value, setValue] = React.useState(targetValue)
  const valueRef = React.useRef(targetValue)

  React.useEffect(() => {
    let frameId: number | null = null

    const tick = () => {
      const currentValue = valueRef.current
      const delta = targetValue - currentValue

      if (Math.abs(delta) < 1) {
        valueRef.current = targetValue
        setValue(targetValue)
        return
      }

      const easedValue = currentValue + delta * 0.22
      const roundedValue = Math.round(easedValue)
      const nextValue =
        roundedValue === currentValue
          ? currentValue + Math.sign(delta)
          : roundedValue

      valueRef.current = nextValue
      setValue(nextValue)
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [targetValue])

  return value
}

function centerGraphWithoutTilt(
  canvas: GraphCanvasRef | null,
  nodeIds?: string[],
  options?: Parameters<GraphCanvasRef["centerGraph"]>[1],
  flatten2d = true
) {
  canvas?.centerGraph?.(nodeIds, options)
  if (flatten2d) {
    restoreOrthographicCameraAxis(canvas, options?.animated ?? true)
  }
}

// Reagraph centerGraph targets far-off nodes by rotating the camera toward
// them. In 2D we want a pan instead, so rebuild the look-at from above.
function restoreOrthographicCameraAxis(
  canvas: GraphCanvasRef | null,
  animated: boolean
) {
  const controls = canvas?.getControls?.()
  if (!controls) return

  const target = controls.getTarget(new Vector3(), true)
  const position = controls.getPosition(new Vector3(), true)
  const height = Math.max(Math.abs(position.z - target.z), 1000)
  void controls
    .normalizeRotations()
    .setLookAt(
      target.x,
      target.y,
      target.z + height,
      target.x,
      target.y,
      target.z,
      animated
    )
}

function renderNode(props: NodeRendererProps) {
  return <FlatNode {...props} />
}

function FlatNode(props: NodeRendererProps) {
  const { size, color, node, selected, id, opacity = 1 } = props
  const caption = typeof node.label === "string" ? node.label : ""
  const truncated = truncateForCircle(caption, size)
  const showText = size >= 10 && truncated.length > 0
  const circleTexture = React.useMemo(() => createCircleTexture(), [])
  const selectionTexture = React.useMemo(
    () => (selected ? createRingTexture() : null),
    [selected]
  )
  const texture = React.useMemo(
    () => (showText ? createCaptionTexture(truncated) : null),
    [truncated, showText]
  )
  React.useEffect(() => () => circleTexture?.dispose(), [circleTexture])
  React.useEffect(() => () => selectionTexture?.dispose(), [selectionTexture])
  React.useEffect(() => () => texture?.dispose(), [texture])

  return (
    <>
      {selected && selectionTexture && (
        <sprite position={[0, 0, -0.02]} scale={[size * 2.44, size * 2.44, 1]}>
          <spriteMaterial
            map={selectionTexture}
            color={color}
            transparent
            opacity={0.4}
            depthTest={false}
            depthWrite={false}
          />
        </sprite>
      )}
      {circleTexture && (
        <sprite userData={{ id, type: "node" }} scale={[size * 2, size * 2, 1]}>
          <spriteMaterial
            map={circleTexture}
            color={color}
            transparent
            opacity={opacity}
            depthTest={false}
            depthWrite={false}
          />
        </sprite>
      )}
      {texture && (
        <sprite position={[0, 0, 0.05]} scale={[size * 1.7, size * 1.7, 1]}>
          <spriteMaterial
            map={texture}
            transparent
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </sprite>
      )}
    </>
  )
}

function createCircleTexture(): Texture | null {
  if (typeof document === "undefined") return null
  const dim = 128
  const canvas = document.createElement("canvas")
  canvas.width = dim
  canvas.height = dim
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.arc(dim / 2, dim / 2, dim * 0.48, 0, Math.PI * 2)
  ctx.fill()
  return createLinearCanvasTexture(canvas)
}

function createRingTexture(): Texture | null {
  if (typeof document === "undefined") return null
  const dim = 128
  const canvas = document.createElement("canvas")
  canvas.width = dim
  canvas.height = dim
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.strokeStyle = "#ffffff"
  ctx.lineWidth = dim * 0.12
  ctx.beginPath()
  ctx.arc(dim / 2, dim / 2, dim * 0.41, 0, Math.PI * 2)
  ctx.stroke()
  return createLinearCanvasTexture(canvas)
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
  return createLinearCanvasTexture(canvas)
}

function createLinearCanvasTexture(canvas: HTMLCanvasElement): Texture {
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
    nodeIds: string[]
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

function ExpandMenuItem({
  nodeIds,
  onExpandNodes,
  onFetchRelationshipSummary,
  onCloseMenu,
}: {
  nodeIds: string[]
  onExpandNodes: (nodeIds: string[], options?: ExpandNodeOptions) => void
  onFetchRelationshipSummary?: (
    nodeIds: string[]
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

  const startFetch = React.useCallback(() => {
    if (hasFetchedRef.current || !onFetchRelationshipSummary || isLoading) {
      return
    }

    hasFetchedRef.current = true
    setIsLoading(true)
    setHasError(false)

    onFetchRelationshipSummary(nodeIds)
      .then((result) => {
        setSummary(result)
      })
      .catch(() => {
        setHasError(true)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [isLoading, nodeIds, onFetchRelationshipSummary])

  const openSubmenu = React.useCallback(() => {
    cancelClose()
    setIsSubmenuOpen(true)
    startFetch()
  }, [cancelClose, startFetch])

  React.useEffect(() => {
    if (onFetchRelationshipSummary) {
      startFetch()
    }
  }, [onFetchRelationshipSummary, startFetch])

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
        <span className="flex items-center gap-2">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘ E
          </kbd>
          {supportsSubmenu && (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </span>
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

function SceneContextMenu({
  position,
  singleNodeCount,
  canDismissSingleNodes,
  canClearScene,
  onClearScene,
  onDismissSingleNodes,
  onClose,
}: {
  position: { x: number; y: number }
  singleNodeCount: number
  canDismissSingleNodes: boolean
  canClearScene: boolean
  onClearScene: () => void
  onDismissSingleNodes: () => void
  onClose: () => void
}) {
  return (
    <GraphContextMenu
      className="absolute z-30 min-w-52"
      onClose={onClose}
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <button
        className="flex w-full cursor-pointer items-center rounded-sm p-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        disabled={!canClearScene}
        type="button"
        onClick={onClearScene}
      >
        Clear scene
      </button>
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm p-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        disabled={!canDismissSingleNodes}
        type="button"
        onClick={onDismissSingleNodes}
      >
        <span>Dismiss single nodes</span>
        {singleNodeCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {singleNodeCount}
          </span>
        )}
      </button>
      <div className="group/export relative">
        <button
          aria-haspopup="menu"
          className="flex w-full cursor-pointer items-center gap-2 rounded-sm p-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
          type="button"
        >
          <span>Export</span>
          <ChevronRight className="ml-auto size-3.5 shrink-0" />
        </button>
        <div className="invisible absolute top-0 left-[calc(100%+0.25rem)] min-w-28 rounded-md border border-border bg-popover p-1 opacity-0 shadow-md transition group-focus-within/export:visible group-focus-within/export:opacity-100 group-hover/export:visible group-hover/export:opacity-100">
          {EXPORT_OPTIONS.map((option) => (
            <button
              className="flex w-full items-center rounded-sm p-2 text-sm text-popover-foreground opacity-50"
              disabled
              key={option}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </GraphContextMenu>
  )
}

const EXPORT_OPTIONS = ["CSV", "PNG", "SVG"] as const

function GraphContextMenu({
  children,
  className,
  onClose,
  style,
}: {
  children: React.ReactNode
  className?: string
  onClose: () => void
  style?: React.CSSProperties
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
      className={[
        "min-w-40 rounded-md border border-border bg-popover p-1 shadow-md",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-graph-menu=""
      ref={menuRef}
      style={style}
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
  hiddenRelationshipTypes = EMPTY_SELECTIONS,
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
          if (
            hiddenRelationshipTypes.includes(relationship.type) ||
            hiddenIdSet.has(relationship.id)
          ) {
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
