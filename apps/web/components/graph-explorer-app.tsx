"use client"

import { Button } from "@workspace/ui/components/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { FadedEdgeScrollArea } from "@workspace/ui/components/faded-edge-scroll-area"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { toast } from "@workspace/ui/components/sonner"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  BadgeInfo,
  ChevronDown,
  Copy,
  Database,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Maximize,
  Minimize2,
  Moon,
  Play,
  Plus,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react"
import { useTheme } from "next-themes"
import * as React from "react"
import {
  IconGraphNetwork,
  IconNodeCircle,
  IconQuery,
  IconRelationshipType,
} from "@/assets/icons"
import {
  type ExpandNodeOptions,
  type GraphSelection,
  getGraphSelectionIds,
  ReagraphWorkspace,
} from "@/components/reagraph-workspace"
import {
  NodeStylingPopoverContent,
  RelationshipStylingPopoverContent,
} from "@/components/styling-panel"
import { readAppPreferences, updateAppPreferences } from "@/lib/app-preferences"
import { authClient } from "@/lib/auth-client"
import {
  closeLocalDriver,
  expandLocalGraphNodes,
  getLocalNodeAdjacency,
  getLocalNodesRelationshipSummary,
  readLocalSchema,
  runLocalReadQuery,
  searchLocalGraph,
  suggestLocalGraph,
} from "@/lib/browser-neo4j"
import { validateReadOnlyMatchQuery } from "@/lib/cypher"
import type {
  GraphNodeRecord,
  GraphPayload,
  GraphRelationshipRecord,
  GraphSearchSuggestion,
  NodeRelationshipSummary,
  QueryResultPayload,
  SchemaPayload,
} from "@/lib/graph-types"
import {
  deleteLocalConnection,
  type LocalConnection,
  listLocalConnections,
  saveLocalConnection,
} from "@/lib/local-connections"
import {
  DEFAULT_RELATIONSHIP_COLOR,
  emptyStyling,
  type RelationshipStyle,
  type StylingState,
} from "@/lib/node-styling"
import {
  addQueryHistoryEntry,
  listQueryHistory,
  type QueryHistoryEntry,
} from "@/lib/query-history"

const emptySchema: SchemaPayload = {
  labels: [],
  relationshipTypes: [],
  propertyKeys: [],
}

const noExpansionResultsMessage = "Sorry, we couldn't find any results."

type AdminConnection = {
  id: string
  source: "admin"
  name: string
  host: string
  scheme: string
  username: string
}

type ConnectionOption = AdminConnection | LocalConnection

type StatusDetails = {
  message: string
  debug: Record<string, unknown>
}

type RevealRequest = {
  graph: GraphPayload
  selection: NonNullable<GraphSelection>
  focusNodeId: string
}

type ApiErrorPayload = {
  error?: string
  details?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getClientErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }

  return {
    name: typeof error,
    message: String(error),
  }
}

function getApiErrorPayload(payload: unknown): ApiErrorPayload {
  if (!isRecord(payload)) {
    return {}
  }

  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
    details: payload.details,
  }
}

type AppAccess = {
  mode: "authenticated" | "no-auth-local"
  user: {
    email: string
    name: string
  } | null
}

type GraphExplorerAppProps = {
  initialConnections: AdminConnection[]
  access: AppAccess
}

const defaultQuery = "MATCH (n)-[r]-(m)\nRETURN n, r, m\nLIMIT 50"

const emptyGraph: GraphPayload = {
  nodes: [],
  relationships: [],
}

const expandNodeBatchSize = 100

export function GraphExplorerApp({
  initialConnections,
  access,
}: GraphExplorerAppProps) {
  const [activeTab, setActiveTab] = React.useState<"explore" | "query">(
    "explore"
  )
  const [localConnections, setLocalConnections] = React.useState<
    LocalConnection[]
  >([])
  const [localConnectionsLoaded, setLocalConnectionsLoaded] =
    React.useState(false)
  const [preferencesRestored, setPreferencesRestored] = React.useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = React.useState<
    string | null
  >(initialConnections[0]?.id ?? null)
  const [graph, setGraph] = React.useState<GraphPayload>(emptyGraph)
  const [schema, setSchema] = React.useState<SchemaPayload>(emptySchema)
  const [isGraphLoading, setIsGraphLoading] = React.useState(false)
  const [isGraphExpanding, setIsGraphExpanding] = React.useState(false)
  const [selection, setSelection] = React.useState<GraphSelection>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [searchSuggestions, setSearchSuggestions] = React.useState<
    GraphSearchSuggestion[]
  >([])
  const [isSearchSuggesting, setIsSearchSuggesting] = React.useState(false)
  const [searchResultCount, setSearchResultCount] = React.useState<
    number | null
  >(null)
  const [focusRequest, setFocusRequest] = React.useState<{
    nodeId: string
    version: number
  } | null>(null)
  const [canvasVersion, setCanvasVersion] = React.useState(0)
  const [hiddenCategories, setHiddenCategories] = React.useState<string[]>([])
  const [hiddenIds, setHiddenIds] = React.useState<string[]>([])
  const [status, setStatus] = React.useState("Ready")
  const [statusDetails, setStatusDetails] =
    React.useState<StatusDetails | null>(null)
  const [showConnectionManager, setShowConnectionManager] =
    React.useState(false)
  const [query, setQuery] = React.useState(defaultQuery)
  const [paramsText, setParamsText] = React.useState("{}")
  const [queryResult, setQueryResult] =
    React.useState<QueryResultPayload | null>(null)
  const [queryError, setQueryError] = React.useState<string | null>(null)
  const [history, setHistory] = React.useState<QueryHistoryEntry[]>([])
  const [styling, setStyling] = React.useState<StylingState>(emptyStyling)

  const clearScene = React.useCallback(() => {
    setGraph(emptyGraph)
    setSelection(null)
    setSearchTerm("")
    setSearchSuggestions([])
    setSearchResultCount(null)
    setHiddenCategories([])
    setHiddenIds([])
    setFocusRequest(null)
    setStatusDetails(null)
    setCanvasVersion((version) => version + 1)
    setStatus("Canvas cleared")
  }, [])

  const connections = React.useMemo<ConnectionOption[]>(
    () => [...initialConnections, ...localConnections],
    [initialConnections, localConnections]
  )
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ??
    connections[0] ??
    null

  React.useEffect(() => {
    listLocalConnections()
      .then(setLocalConnections)
      .catch(() => setStatus("Local connection storage is unavailable"))
      .finally(() => setLocalConnectionsLoaded(true))
    listQueryHistory()
      .then(setHistory)
      .catch(() => undefined)
  }, [])

  React.useEffect(() => {
    if (!localConnectionsLoaded || preferencesRestored) {
      return
    }

    const storedConnectionId = readAppPreferences().selectedConnectionId

    const restoredConnectionId =
      storedConnectionId &&
      connections.some((connection) => connection.id === storedConnectionId)
        ? storedConnectionId
        : (connections[0]?.id ?? null)

    setSelectedConnectionId(restoredConnectionId)

    setPreferencesRestored(true)
  }, [connections, localConnectionsLoaded, preferencesRestored])

  React.useEffect(() => {
    if (!preferencesRestored) {
      return
    }

    updateAppPreferences((preferences) => ({
      ...preferences,
      selectedConnectionId,
    }))
  }, [preferencesRestored, selectedConnectionId])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s") return
      if (!event.shiftKey || !(event.metaKey || event.ctrlKey)) return

      event.preventDefault()
      clearScene()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [clearScene])

  const loadSchema = React.useCallback(
    async (connection: ConnectionOption | null) => {
      if (!connection) {
        setSchema(emptySchema)
        return
      }

      if (connection.source === "local") {
        try {
          setSchema(await readLocalSchema(connection))
        } catch {
          setSchema(emptySchema)
          setStatus("Local schema request failed")
        }
        return
      }

      try {
        const response = await fetch(
          `/api/explore/schema?connectionId=${connection.id}`
        )
        setSchema(await response.json())
      } catch {
        setSchema(emptySchema)
      }
    },
    []
  )

  const applyGraphSearchResult = React.useCallback(
    (result: GraphPayload, search: string, loadedStatus: string) => {
      const trimmedSearch = search.trim()

      setGraph((currentGraph) =>
        trimmedSearch ? mergeGraphs(currentGraph, result) : result
      )

      if (trimmedSearch) {
        const nodeCount = result.nodes.length
        setSearchResultCount(nodeCount)
        setStatus(`${nodeCount} ${nodeCount === 1 ? "node" : "nodes"} found`)

        if (nodeCount === 1) {
          const nodeId = result.nodes[0]?.id
          if (nodeId) {
            setSelection({ type: "node", id: nodeId })
            setFocusRequest((currentRequest) => ({
              nodeId,
              version: (currentRequest?.version ?? 0) + 1,
            }))
          }
        } else {
          setSelection(null)
        }

        return
      }

      setSelection(null)
      setSearchResultCount(null)
      setStatus(loadedStatus)
    },
    []
  )

  const loadGraph = React.useCallback(
    async (connection: ConnectionOption | null, search: string) => {
      const trimmedSearch = search.trim()

      setStatusDetails(null)
      if (!connection) {
        setGraph(emptyGraph)
        setHiddenIds([])
        setSearchResultCount(null)
        setIsGraphLoading(false)
        setStatus("Add a connection to explore a graph")
        return
      }

      if (!trimmedSearch) {
        setGraph(emptyGraph)
        setHiddenIds([])
      }
      setSearchResultCount(null)
      setIsGraphLoading(true)

      try {
        if (connection.source === "local") {
          setStatus("Searching local graph from this browser")

          try {
            const result = await searchLocalGraph(connection, search, 120)
            applyGraphSearchResult(result.graph, search, "Local graph loaded")
          } catch (error) {
            if (!trimmedSearch) {
              setGraph(emptyGraph)
            }
            setStatus("Local browser connection failed")
            setStatusDetails({
              message: "Local browser connection failed",
              debug: {
                operation: "searchLocalGraph",
                source: "local",
                connection: {
                  id: connection.id,
                  name: connection.name,
                  host: connection.host,
                  scheme: connection.scheme,
                  username: connection.username,
                },
                search,
                limit: 120,
                timestamp: new Date().toISOString(),
                error: getClientErrorDetails(error),
              },
            })
          }
          return
        }

        setStatus("Searching graph")

        try {
          const response = await fetch("/api/explore/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              connectionId: connection.id,
              search,
              limit: 120,
            }),
          })

          if (!response.ok) {
            const payload = getApiErrorPayload(
              await response.json().catch(() => null)
            )
            const message =
              payload.error ?? `Graph search failed (${response.status})`

            if (!trimmedSearch) {
              setGraph(emptyGraph)
            }
            setStatus(message)
            setStatusDetails({
              message,
              debug: {
                operation: "fetchGraphSearch",
                source: "admin",
                http: {
                  status: response.status,
                  statusText: response.statusText,
                },
                connection: {
                  id: connection.id,
                  name: connection.name,
                  host: connection.host,
                  scheme: connection.scheme,
                  username: connection.username,
                },
                search,
                limit: 120,
                timestamp: new Date().toISOString(),
                api: payload.details,
              },
            })
            return
          }

          applyGraphSearchResult(
            (await response.json()) as GraphPayload,
            search,
            "Graph loaded"
          )
          setStatusDetails(null)
        } catch (error) {
          if (!trimmedSearch) {
            setGraph(emptyGraph)
          }
          setStatus("Graph request failed")
          setStatusDetails({
            message: "Graph request failed",
            debug: {
              operation: "fetchGraphSearch",
              source: "admin",
              connection: {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                scheme: connection.scheme,
                username: connection.username,
              },
              search,
              limit: 120,
              timestamp: new Date().toISOString(),
              error: getClientErrorDetails(error),
            },
          })
        }
      } finally {
        setIsGraphLoading(false)
      }
    },
    [applyGraphSearchResult]
  )

  React.useEffect(() => {
    const trimmedSearch = searchTerm.trim()

    if (trimmedSearch.length < 2) {
      setSearchSuggestions([])
      setIsSearchSuggesting(false)
      return
    }

    if (!selectedConnection) {
      setSearchSuggestions([])
      setIsSearchSuggesting(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setIsSearchSuggesting(true)

      if (selectedConnection.source === "local") {
        suggestLocalGraph(selectedConnection, trimmedSearch)
          .then((suggestions) => {
            if (!cancelled) {
              setSearchSuggestions(suggestions)
            }
          })
          .catch(() => {
            if (!cancelled) {
              setSearchSuggestions([])
            }
          })
          .finally(() => {
            if (!cancelled) {
              setIsSearchSuggesting(false)
            }
          })
        return
      }

      fetch("/api/explore/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId: selectedConnection.id,
          search: trimmedSearch,
          limit: 8,
        }),
        signal: controller.signal,
      })
        .then((response) =>
          response.ok
            ? (response.json() as Promise<GraphSearchSuggestion[]>)
            : []
        )
        .then((suggestions) => {
          if (!cancelled) {
            setSearchSuggestions(suggestions)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchSuggestions([])
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearchSuggesting(false)
          }
        })
    }, 180)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [searchTerm, selectedConnection])

  const schemaSearchSuggestions = React.useMemo<GraphSearchSuggestion[]>(() => {
    const trimmedSearch = searchTerm.trim().toLowerCase()

    if (trimmedSearch.length < 2) {
      return []
    }

    return schema.labels
      .filter((label) => label.name.toLowerCase().includes(trimmedSearch))
      .map((label) => ({
        id: `label:${label.name}`,
        caption: label.name,
        labels: [label.name],
        detail: `Label - ${label.count} nodes`,
        searchValue: label.name,
      }))
  }, [schema.labels, searchTerm])

  const visibleSearchSuggestions = React.useMemo(() => {
    const seenSearchValues = new Set<string>()

    return [...schemaSearchSuggestions, ...searchSuggestions].filter(
      (suggestion) => {
        const key = suggestion.searchValue.toLowerCase()

        if (seenSearchValues.has(key)) {
          return false
        }

        seenSearchValues.add(key)
        return true
      }
    )
  }, [schemaSearchSuggestions, searchSuggestions])

  React.useEffect(() => {
    if (!preferencesRestored) {
      return
    }

    setSelection(null)
    setHiddenCategories([])
    void loadSchema(selectedConnection)
    void loadGraph(selectedConnection, "")
  }, [loadGraph, loadSchema, preferencesRestored, selectedConnection])

  async function expandNodes(
    nodeIds: string[],
    options: ExpandNodeOptions = {}
  ) {
    const targetNodeIds = getNodeIdsFromIds(nodeIds, graph)

    if (targetNodeIds.length === 0) {
      setStatus("Select a node to expand")
      return
    }

    if (!selectedConnection) {
      setStatus("Add a connection to expand graph nodes")
      return
    }

    const direction = options.direction ?? "both"
    const relType = options.relType
    const expansionLabel = relType ? `${relType} neighborhood` : "neighborhood"
    const targetLabel =
      targetNodeIds.length === 1 ? "this node" : `${targetNodeIds.length} nodes`

    setIsGraphExpanding(true)
    try {
      if (selectedConnection.source === "local") {
        setStatus(
          `Expanding local ${expansionLabel} from ${targetLabel} in this browser`
        )

        try {
          let expandedGraph: GraphPayload = emptyGraph

          for (const batch of chunkArray(targetNodeIds, expandNodeBatchSize)) {
            const result = await expandLocalGraphNodes(
              selectedConnection,
              batch,
              direction,
              120,
              relType
            )
            expandedGraph = mergeGraphs(expandedGraph, result.graph)
          }

          if (expandedGraph.nodes.length === 0) {
            toast.error(noExpansionResultsMessage)
            setStatus("Local graph expansion returned no results")
            return
          }

          const newGraph = getNewGraphItems(graph, expandedGraph)
          setGraph((currentGraph) => mergeGraphs(currentGraph, expandedGraph))
          toast.success(formatExpansionResultMessage(newGraph))
          setStatus(`Local ${expansionLabel} expanded from ${targetLabel}`)
        } catch {
          toast.error(noExpansionResultsMessage)
          setStatus("Local graph expansion failed")
        }
        return
      }

      setStatus(`Expanding ${expansionLabel} from ${targetLabel}`)

      try {
        let expandedGraph: GraphPayload = emptyGraph

        for (const batch of chunkArray(targetNodeIds, expandNodeBatchSize)) {
          const response = await fetch("/api/explore/expand", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              connectionId: selectedConnection.id,
              nodeIds: batch,
              direction,
              limit: 120,
              relType,
            }),
          })

          if (!response.ok) {
            throw new Error("Expansion request failed")
          }

          const result = (await response.json()) as GraphPayload
          expandedGraph = mergeGraphs(expandedGraph, result)
        }

        if (expandedGraph.nodes.length === 0) {
          toast.error(noExpansionResultsMessage)
          setStatus("Expansion returned no results")
          return
        }

        const newGraph = getNewGraphItems(graph, expandedGraph)
        setGraph((currentGraph) => mergeGraphs(currentGraph, expandedGraph))
        toast.success(formatExpansionResultMessage(newGraph))
        const capitalLabel =
          expansionLabel.charAt(0).toUpperCase() + expansionLabel.slice(1)
        setStatus(`${capitalLabel} expanded from ${targetLabel}`)
      } catch {
        toast.error(noExpansionResultsMessage)
        setStatus("Expansion failed")
      }
    } finally {
      setIsGraphExpanding(false)
    }
  }

  async function fetchNodeRelationshipSummary(
    nodeIds: string[]
  ): Promise<NodeRelationshipSummary> {
    if (!selectedConnection) {
      return { total: 0, entries: [] }
    }

    if (selectedConnection.source === "local") {
      return getLocalNodesRelationshipSummary(selectedConnection, nodeIds)
    }

    const response = await fetch("/api/explore/relationship-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: selectedConnection.id,
        nodeIds,
      }),
    })

    if (!response.ok) {
      return { total: 0, entries: [] }
    }

    return (await response.json()) as NodeRelationshipSummary
  }

  function expandSelected() {
    const selectedNodeIds = getSelectionNodeIds(selection, graph)

    if (selectedNodeIds.length === 0) {
      setStatus("Select a node to expand")
      return
    }

    void expandNodes(selectedNodeIds)
  }

  async function runQuery() {
    const validation = validateReadOnlyMatchQuery(query)

    if (!validation.ok) {
      setQueryError(validation.error)
      return
    }

    let params: Record<string, unknown>

    try {
      params = JSON.parse(paramsText)
    } catch {
      setQueryError("Parameters must be valid JSON.")
      return
    }

    if (!selectedConnection) {
      setQueryError("Add a connection before running a query.")
      return
    }

    if (selectedConnection.source === "local") {
      setQueryError(null)
      setStatus("Running local browser query")

      try {
        const result = await runLocalReadQuery(
          selectedConnection,
          validation.query,
          params
        )
        setQueryResult(result)
        setGraph(result.graph.nodes.length > 0 ? result.graph : graph)
        const entry = await addQueryHistoryEntry({
          connectionName: selectedConnection.name,
          query,
          params,
          snapshot: result,
        })
        setHistory((currentHistory) => [entry, ...currentHistory].slice(0, 100))
        setStatus(`Local query returned ${result.summary.records} records`)
      } catch {
        setQueryError(
          "Local browser query failed. Check the URL, TLS mode, network access, and read-only credentials."
        )
      }
      return
    }

    setQueryError(null)
    setStatus("Running read query")

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId: selectedConnection.id,
          query: validation.query,
          params,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setQueryError(payload.error ?? "Query failed")
        return
      }

      setQueryResult(payload)
      setGraph(payload.graph.nodes.length > 0 ? payload.graph : graph)
      const entry = await addQueryHistoryEntry({
        connectionName: selectedConnection.name,
        query,
        params,
        snapshot: payload,
      })
      setHistory((currentHistory) => [entry, ...currentHistory].slice(0, 100))
      setStatus(`Query returned ${payload.summary.records} records`)
    } catch {
      setQueryError("Query request failed.")
    }
  }

  function toggleCategory(category: string) {
    setHiddenCategories((currentCategories) =>
      currentCategories.includes(category)
        ? currentCategories.filter((item) => item !== category)
        : [...currentCategories, category]
    )
  }

  function hideIds(ids: string[]) {
    const idSet = new Set(ids)
    if (idSet.size === 0) return

    setHiddenIds((currentIds) => {
      const nextIds = new Set(currentIds)
      for (const id of idSet) {
        nextIds.add(id)
      }

      if (nextIds.size === currentIds.length) {
        return currentIds
      }

      return Array.from(nextIds)
    })
    setSelection((currentSelection) => {
      if (!currentSelection) return currentSelection
      return getGraphSelectionIds(currentSelection).some((id) => idSet.has(id))
        ? null
        : currentSelection
    })
  }

  function hideId(id: string) {
    hideIds([id])
  }

  function revealGraphItem(request: RevealRequest) {
    const revealedIds = getGraphSelectionIds(request.selection)
    const nodeIds = request.graph.nodes.map((node) => node.id)
    const labels = new Set(request.graph.nodes.flatMap((node) => node.labels))

    setGraph((currentGraph) => mergeGraphs(currentGraph, request.graph))
    setHiddenCategories((currentCategories) =>
      currentCategories.filter((category) => !labels.has(category))
    )
    setHiddenIds((currentIds) =>
      currentIds.filter(
        (id) => !revealedIds.includes(id) && !nodeIds.includes(id)
      )
    )
    setSelection(request.selection)
    setFocusRequest((currentRequest) => ({
      nodeId: request.focusNodeId,
      version: (currentRequest?.version ?? 0) + 1,
    }))
  }

  async function deleteConnection(id: string) {
    await closeLocalDriver(id)
    await deleteLocalConnection(id)
    setLocalConnections((currentConnections) => {
      const nextConnections = currentConnections.filter(
        (connection) => connection.id !== id
      )

      if (selectedConnectionId === id) {
        setSelectedConnectionId(
          initialConnections[0]?.id ?? nextConnections[0]?.id ?? null
        )
      }

      return nextConnections
    })
  }

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        access={access}
        connections={connections}
        selectedConnection={selectedConnection}
        onConnectionChange={setSelectedConnectionId}
        onAddConnection={() => setShowConnectionManager(true)}
        onManageConnections={() => setShowConnectionManager(true)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "explore" ? (
        <section className="grid min-h-0 flex-1 grid-cols-[310px_minmax(0,1fr)_330px] border-t border-border max-xl:grid-cols-[280px_minmax(0,1fr)] max-lg:grid-cols-1">
          <ExploreLeftPanel
            searchTerm={searchTerm}
            searchResultCount={searchResultCount}
            onSearchTermChange={setSearchTerm}
            schema={schema}
            graph={graph}
            hiddenCategories={hiddenCategories}
            styling={styling}
            onStylingChange={setStyling}
            onToggleCategory={toggleCategory}
            searchSuggestions={visibleSearchSuggestions}
            isSearchSuggesting={isSearchSuggesting}
            hasConnection={selectedConnection !== null}
            onSearch={() => loadGraph(selectedConnection, searchTerm)}
            onSearchSuggestionSelect={(suggestion) => {
              setSearchTerm(suggestion.searchValue)
              void loadGraph(selectedConnection, suggestion.searchValue)
            }}
            onExpand={expandSelected}
            onHideIds={hideIds}
            selection={selection}
            onReset={clearScene}
          />
          <section className="min-h-0 border-x border-border max-lg:h-[58vh]">
            {selectedConnection ? (
              <ReagraphWorkspace
                graph={graph}
                canvasKey={canvasVersion}
                focusRequest={focusRequest}
                hiddenCategories={hiddenCategories}
                hiddenIds={hiddenIds}
                styling={styling}
                selected={selection}
                isLoading={isGraphLoading}
                isExpanding={isGraphExpanding}
                onSelect={setSelection}
                onClearScene={clearScene}
                onExpandNodes={(nodeIds, options) =>
                  void expandNodes(nodeIds, options)
                }
                onFetchRelationshipSummary={fetchNodeRelationshipSummary}
                onHideId={hideId}
                onHideIds={hideIds}
              />
            ) : (
              <NoConnectionState
                onAddConnection={() => setShowConnectionManager(true)}
              />
            )}
          </section>
          <DetailsPanel
            graph={graph}
            selected={selection}
            connection={selectedConnection}
            status={status}
            statusDetails={statusDetails}
            onDismissIds={hideIds}
            onReveal={revealGraphItem}
          />
        </section>
      ) : (
        <QueryWorkspace
          query={query}
          paramsText={paramsText}
          result={queryResult}
          error={queryError}
          history={history}
          selectedConnection={selectedConnection}
          onQueryChange={setQuery}
          onParamsTextChange={setParamsText}
          onRunQuery={runQuery}
          onLoadHistory={(entry) => {
            setQuery(entry.query)
            setParamsText(JSON.stringify(entry.params, null, 2))
            setQueryResult(entry.snapshot ?? null)
          }}
        />
      )}

      {showConnectionManager ? (
        <ConnectionManagerDialog
          connections={connections}
          selectedConnectionId={selectedConnection?.id ?? null}
          onClose={() => setShowConnectionManager(false)}
          onDelete={deleteConnection}
          onSelect={setSelectedConnectionId}
          onSaved={(connection) => {
            setLocalConnections((currentConnections) => [
              ...currentConnections,
              connection,
            ])
            setSelectedConnectionId(connection.id)
          }}
        />
      ) : null}
    </main>
  )
}

function TopBar({
  access,
  connections,
  selectedConnection,
  activeTab,
  onTabChange,
  onConnectionChange,
  onAddConnection,
  onManageConnections,
}: {
  access: AppAccess
  connections: ConnectionOption[]
  selectedConnection: ConnectionOption | null
  activeTab: "explore" | "query"
  onTabChange: (tab: "explore" | "query") => void
  onConnectionChange: (id: string) => void
  onAddConnection: () => void
  onManageConnections: () => void
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 xl:flex xl:h-14 xl:justify-between xl:gap-4 xl:px-4 xl:py-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <IconGraphNetwork className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">Graph Explorer</div>
          <div className="hidden truncate text-xs text-muted-foreground sm:block">
            Read-only Neo4j workspace
          </div>
        </div>
      </div>

      <div className="order-3 col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto] xl:order-none xl:col-span-1 xl:flex xl:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="inline-flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-border px-2 text-sm font-normal hover:bg-accent xl:min-w-64"
              type="button"
              variant="outline"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Database className="size-4 text-primary" />
                <span className="truncate">
                  {selectedConnection?.name ?? "Add connection"}
                </span>
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={selectedConnection?.id ?? ""}
              onValueChange={onConnectionChange}
            >
              {connections.map((connection) => (
                <DropdownMenuRadioItem
                  key={connection.id}
                  value={connection.id}
                >
                  {connection.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onAddConnection}>
              <Plus className="size-3.5" />
              Add
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Manage connections"
                className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent"
                onClick={onManageConnections}
                type="button"
                variant="outline"
              >
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>manage connections</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className="rounded-md border border-border bg-muted/50 p-1">
          <Button
            className={`inline-flex h-7 items-center gap-1.5 rounded px-3 text-sm sm:px-4 ${
              activeTab === "explore"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => onTabChange("explore")}
            type="button"
            variant="ghost"
          >
            <IconGraphNetwork className="size-3.5" />
            Explore
          </Button>
          <Button
            className={`inline-flex h-7 items-center gap-1.5 rounded px-3 text-sm sm:px-4 ${
              activeTab === "query"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => onTabChange("query")}
            type="button"
            variant="ghost"
          >
            <IconQuery className="size-3.5" />
            Query
          </Button>
        </div>
        <div className="hidden items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground md:flex">
          <ShieldCheck className="size-3.5 text-primary" />
          {access.mode === "no-auth-local"
            ? "No-auth local"
            : access.user?.email}
        </div>
        <Button
          className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          type="button"
          title="Toggle theme"
          variant="outline"
        >
          <span suppressHydrationWarning>
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </span>
        </Button>
        {access.mode === "authenticated" ? (
          <Button
            className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent"
            onClick={() => void authClient.signOut()}
            type="button"
            title="Sign out"
            variant="outline"
          >
            <LogOut className="size-4" />
          </Button>
        ) : null}
      </div>
    </header>
  )
}

function NoConnectionState({
  onAddConnection,
}: {
  onAddConnection: () => void
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="max-w-sm rounded-lg border border-dashed border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Database className="size-5" />
        </div>
        <h2 className="text-sm font-medium text-foreground">
          Add a Neo4j connection
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Configure an admin connection or save a browser-local connection to
          start exploring graph data.
        </p>
        <Button
          className="mt-4 inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onAddConnection}
          type="button"
        >
          <Plus className="size-3.5" />
          Add connection
        </Button>
      </div>
    </div>
  )
}

function ExploreLeftPanel({
  searchTerm,
  searchResultCount,
  schema,
  graph,
  hiddenCategories,
  styling,
  onStylingChange,
  onSearchTermChange,
  onToggleCategory,
  searchSuggestions,
  isSearchSuggesting,
  hasConnection,
  onSearch,
  onSearchSuggestionSelect,
  onExpand,
  onHideIds,
  selection,
  onReset,
}: {
  searchTerm: string
  searchResultCount: number | null
  schema: SchemaPayload
  graph: GraphPayload
  hiddenCategories: string[]
  styling: StylingState
  onStylingChange: (next: StylingState) => void
  onSearchTermChange: (value: string) => void
  onToggleCategory: (category: string) => void
  searchSuggestions: GraphSearchSuggestion[]
  isSearchSuggesting: boolean
  hasConnection: boolean
  onSearch: () => void
  onSearchSuggestionSelect: (suggestion: GraphSearchSuggestion) => void
  onExpand: () => void
  onHideIds: (ids: string[]) => void
  selection: GraphSelection
  onReset: () => void
}) {
  const [openCategory, setOpenCategory] = React.useState<string | null>(null)
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(-1)
  const [sidebarTab, setSidebarTab] = React.useState<"nodes" | "relationships">(
    "nodes"
  )
  const [nodeFilter, setNodeFilter] = React.useState("")
  const [nodeScope, setNodeScope] = React.useState<
    "all" | "in-scene" | "off-scene"
  >("all")

  const inSceneLabels = React.useMemo(() => {
    const set = new Set<string>()
    for (const graphNode of graph.nodes) {
      for (const label of graphNode.labels) {
        set.add(label)
      }
    }
    return set
  }, [graph.nodes])

  const inSceneLabelCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const graphNode of graph.nodes) {
      for (const label of graphNode.labels) {
        counts[label] = (counts[label] ?? 0) + 1
      }
    }
    return counts
  }, [graph.nodes])

  const visibleLabels = React.useMemo(() => {
    const trimmedFilter = nodeFilter.trim().toLowerCase()
    return schema.labels.filter((label) => {
      if (trimmedFilter && !label.name.toLowerCase().includes(trimmedFilter)) {
        return false
      }
      if (nodeScope === "in-scene" && !inSceneLabels.has(label.name)) {
        return false
      }
      if (nodeScope === "off-scene" && inSceneLabels.has(label.name)) {
        return false
      }
      return true
    })
  }, [schema.labels, nodeFilter, nodeScope, inSceneLabels])
  const showSuggestions =
    suggestionsOpen &&
    searchTerm.trim().length >= 2 &&
    (isSearchSuggesting || searchSuggestions.length > 0)
  const searchResultLabel =
    searchResultCount === null
      ? null
      : `Found ${searchResultCount} node${searchResultCount === 1 ? "" : "s"}`
  const selectedIds = getGraphSelectionIds(selection)
  const selectedNodeIds = getSelectionNodeIds(selection, graph)

  React.useEffect(() => {
    const categoryNames = new Set(schema.labels.map((label) => label.name))
    if (openCategory && !categoryNames.has(openCategory)) {
      setOpenCategory(null)
    }
  }, [openCategory, schema.labels])

  const updateLabelStyle = (
    label: string,
    next: Partial<NonNullable<StylingState["labelStyles"][string]>>
  ) => {
    const currentStyle = styling.labelStyles[label] ?? { text: [] }
    onStylingChange({
      ...styling,
      labelStyles: {
        ...styling.labelStyles,
        [label]: { ...currentStyle, ...next },
      },
    })
  }

  const resetLabelStyle = (label: string) => {
    const { [label]: _removed, ...labelStyles } = styling.labelStyles
    onStylingChange({ ...styling, labelStyles })
  }

  const selectSuggestion = (suggestion: GraphSearchSuggestion) => {
    setSuggestionsOpen(false)
    onSearchSuggestionSelect(suggestion)
  }

  const handleSearchTermChange = (value: string) => {
    setActiveSuggestionIndex(-1)
    onSearchTermChange(value)
  }

  return (
    <FadedEdgeScrollArea
      as="aside"
      className="flex min-h-0 flex-col gap-4 bg-card p-4"
    >
      <div className="relative">
        <label
          className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3"
          htmlFor="explore-search"
        >
          <Search className="size-4 text-muted-foreground" />
          <input
            className="h-auto min-w-0 flex-1 bg-transparent px-0 text-sm outline-none placeholder:text-muted-foreground"
            id="explore-search"
            placeholder="Search nodes"
            disabled={!hasConnection}
            value={searchTerm}
            onChange={(event) => handleSearchTermChange(event.target.value)}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setSuggestionsOpen(false), 100)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSuggestionsOpen(false)
                return
              }

              if (showSuggestions && searchSuggestions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setActiveSuggestionIndex((index) =>
                    Math.min(index + 1, searchSuggestions.length - 1)
                  )
                  return
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setActiveSuggestionIndex((index) => Math.max(index - 1, 0))
                  return
                }
              }

              if (event.key === "Enter") {
                if (
                  showSuggestions &&
                  activeSuggestionIndex >= 0 &&
                  searchSuggestions[activeSuggestionIndex]
                ) {
                  event.preventDefault()
                  selectSuggestion(searchSuggestions[activeSuggestionIndex])
                  return
                }

                setSuggestionsOpen(false)
                if (hasConnection) {
                  onSearch()
                }
              }
            }}
          />
        </label>
        {showSuggestions ? (
          <div className="absolute top-11 right-0 left-0 z-20 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
            {isSearchSuggesting && searchSuggestions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Searching
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto p-1">
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    className={`flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-accent hover:text-accent-foreground ${
                      activeSuggestionIndex === index
                        ? "bg-accent text-accent-foreground"
                        : ""
                    }`}
                    key={suggestion.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    onClick={() => selectSuggestion(suggestion)}
                    type="button"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded border border-border bg-background text-[10px] font-semibold">
                      {suggestion.labels[0]?.slice(0, 1) ?? "N"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {suggestion.caption}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {suggestion.detail}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {searchResultLabel ? (
          <div className="mt-2 px-1 text-xs font-medium text-muted-foreground">
            {searchResultLabel}
          </div>
        ) : null}
      </div>

      <PanelSection icon={<Settings2 className="size-4" />} title="Graph">
        {selection ? (
          <div className="flex gap-2">
            {selectedNodeIds.length > 0 ? (
              <Button
                className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md border border-border text-xs hover:bg-accent"
                onClick={onExpand}
                type="button"
                variant="outline"
              >
                <Maximize className="size-3.5" />
                {selectedNodeIds.length === 1
                  ? "Expand node"
                  : `Expand ${selectedNodeIds.length} nodes`}
              </Button>
            ) : null}
            <Button
              className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md border border-border text-xs hover:bg-accent"
              onClick={() => onHideIds(selectedIds)}
              type="button"
              variant="outline"
            >
              <EyeOff className="size-3.5" />
              {selection.type === "multi"
                ? `Hide ${selectedIds.length} selected`
                : "Hide"}
            </Button>
          </div>
        ) : null}
        <Button
          className="h-8 rounded-md border border-border text-xs hover:bg-accent"
          disabled={!hasConnection}
          onClick={onReset}
          type="button"
          variant="outline"
        >
          Reset canvas
        </Button>
      </PanelSection>

      <div className="space-y-3">
        <Tabs
          value={sidebarTab}
          onValueChange={(value) =>
            setSidebarTab(value as "nodes" | "relationships")
          }
        >
          <TabsList className="grid h-9 w-full grid-cols-2">
            <TabsTrigger className="inline-flex gap-1.5 text-sm" value="nodes">
              <IconNodeCircle className="size-3.5" />
              Nodes
            </TabsTrigger>
            <TabsTrigger
              className="inline-flex gap-1.5 text-sm"
              value="relationships"
            >
              <IconRelationshipType className="size-3.5" />
              Relationships
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {sidebarTab === "nodes" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label
                className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3"
                htmlFor="node-filter"
              >
                <Search className="size-3.5 text-muted-foreground" />
                <input
                  className="h-auto min-w-0 flex-1 bg-transparent px-0 text-sm outline-none placeholder:text-muted-foreground"
                  id="node-filter"
                  placeholder="Filter categories"
                  value={nodeFilter}
                  onChange={(event) => setNodeFilter(event.target.value)}
                />
              </label>
              <Button
                aria-label="Collapse all"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
                onClick={() => setOpenCategory(null)}
                type="button"
                variant="outline"
              >
                <Minimize2 className="size-3.5" />
              </Button>
            </div>

            <RadioGroup
              className="flex items-center gap-4"
              value={nodeScope}
              onValueChange={(value) =>
                setNodeScope(value as "all" | "in-scene" | "off-scene")
              }
            >
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem
                  aria-label="All"
                  id="node-scope-all"
                  value="all"
                />
                <label className="cursor-pointer" htmlFor="node-scope-all">
                  All
                </label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem
                  aria-label="In Scene"
                  id="node-scope-in"
                  value="in-scene"
                />
                <label className="cursor-pointer" htmlFor="node-scope-in">
                  In Scene
                </label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem
                  aria-label="Off Scene"
                  id="node-scope-off"
                  value="off-scene"
                />
                <label className="cursor-pointer" htmlFor="node-scope-off">
                  Off Scene
                </label>
              </div>
            </RadioGroup>

            {visibleLabels.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No categories match this filter.
              </div>
            ) : null}

            {visibleLabels.map((label) => {
              const hidden = hiddenCategories.includes(label.name)
              const labelStyle = styling.labelStyles[label.name] ?? { text: [] }
              const displayColor = labelStyle.color ?? label.color
              const sceneCount = inSceneLabelCounts[label.name] ?? 0
              const showCount =
                nodeScope === "in-scene"
                  ? sceneCount
                  : nodeScope === "off-scene"
                    ? label.count
                    : sceneCount || label.count

              return (
                <div
                  className="overflow-hidden rounded-md border border-border bg-background"
                  key={label.name}
                >
                  <div className="flex items-center gap-1 pr-2">
                    <Popover
                      open={openCategory === label.name}
                      onOpenChange={(open) =>
                        setOpenCategory(open ? label.name : null)
                      }
                    >
                      <PopoverTrigger asChild>
                        <button
                          aria-label={`Edit styling for ${label.name}`}
                          className="flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                          type="button"
                        >
                          <span
                            className="size-4 rounded-full"
                            style={{ backgroundColor: displayColor }}
                          />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="right"
                        align="start"
                        className="w-96 p-4"
                      >
                        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {label.name}
                        </div>
                        <NodeStylingPopoverContent
                          label={label.name}
                          labelStyle={labelStyle}
                          baseColor={label.color}
                          graph={graph}
                          onChange={(next) =>
                            updateLabelStyle(label.name, next)
                          }
                        />
                        {styling.labelStyles[label.name] ? (
                          <Button
                            className="mt-3 h-7 w-full rounded-md border border-border text-xs text-muted-foreground hover:bg-accent"
                            onClick={() => resetLabelStyle(label.name)}
                            type="button"
                            variant="outline"
                          >
                            Reset {label.name} styling
                          </Button>
                        ) : null}
                      </PopoverContent>
                    </Popover>
                    <span className="min-w-0 flex-1 truncate py-2 text-sm font-medium">
                      {label.name}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {showCount}
                    </span>
                    <Button
                      aria-label={
                        hidden ? `Show ${label.name}` : `Hide ${label.name}`
                      }
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                      onClick={() => onToggleCategory(label.name)}
                      type="button"
                      variant="ghost"
                    >
                      {hidden ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5 text-primary" />
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <RelationshipsList
            schema={schema}
            graph={graph}
            styling={styling}
            onStylingChange={onStylingChange}
          />
        )}

        {(Object.keys(styling.labelStyles).length > 0 ||
          Object.keys(styling.relationshipStyles).length > 0 ||
          styling.rules.length > 0) && (
          <Button
            className="h-8 w-full rounded-md border border-border text-xs text-muted-foreground hover:bg-accent"
            onClick={() => onStylingChange(emptyStyling)}
            type="button"
            variant="outline"
          >
            Reset all styling
          </Button>
        )}
      </div>
    </FadedEdgeScrollArea>
  )
}

function RelationshipsList({
  schema,
  graph,
  styling,
  onStylingChange,
}: {
  schema: SchemaPayload
  graph: GraphPayload
  styling: StylingState
  onStylingChange: (next: StylingState) => void
}) {
  const [filter, setFilter] = React.useState("")
  const [scope, setScope] = React.useState<"all" | "in-scene" | "off-scene">(
    "all"
  )
  const [openType, setOpenType] = React.useState<string | null>(null)

  const inSceneTypes = React.useMemo(() => {
    const set = new Set<string>()
    for (const relationship of graph.relationships) {
      set.add(relationship.type)
    }
    return set
  }, [graph.relationships])

  const inSceneCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const relationship of graph.relationships) {
      counts[relationship.type] = (counts[relationship.type] ?? 0) + 1
    }
    return counts
  }, [graph.relationships])

  const visibleTypes = React.useMemo(() => {
    const trimmedFilter = filter.trim().toLowerCase()
    return schema.relationshipTypes.filter((type) => {
      if (trimmedFilter && !type.name.toLowerCase().includes(trimmedFilter)) {
        return false
      }
      if (scope === "in-scene" && !inSceneTypes.has(type.name)) return false
      if (scope === "off-scene" && inSceneTypes.has(type.name)) return false
      return true
    })
  }, [schema.relationshipTypes, filter, scope, inSceneTypes])

  const updateRelationshipStyle = (
    type: string,
    next: Partial<RelationshipStyle>
  ) => {
    onStylingChange({
      ...styling,
      relationshipStyles: {
        ...styling.relationshipStyles,
        [type]: { ...styling.relationshipStyles[type], ...next },
      },
    })
  }

  const resetRelationshipStyle = (type: string) => {
    const { [type]: _removed, ...relationshipStyles } =
      styling.relationshipStyles
    onStylingChange({ ...styling, relationshipStyles })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3"
          htmlFor="relationship-filter"
        >
          <Search className="size-3.5 text-muted-foreground" />
          <input
            className="h-auto min-w-0 flex-1 bg-transparent px-0 text-sm outline-none placeholder:text-muted-foreground"
            id="relationship-filter"
            placeholder="Filter relationships"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <Button
          aria-label="Collapse all"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
          onClick={() => setOpenType(null)}
          type="button"
          variant="outline"
        >
          <Minimize2 className="size-3.5" />
        </Button>
      </div>

      <RadioGroup
        className="flex items-center gap-4"
        value={scope}
        onValueChange={(value) =>
          setScope(value as "all" | "in-scene" | "off-scene")
        }
      >
        <div className="flex items-center gap-2 text-sm">
          <RadioGroupItem aria-label="All" id="rel-scope-all" value="all" />
          <label className="cursor-pointer" htmlFor="rel-scope-all">
            All
          </label>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <RadioGroupItem
            aria-label="In Scene"
            id="rel-scope-in"
            value="in-scene"
          />
          <label className="cursor-pointer" htmlFor="rel-scope-in">
            In Scene
          </label>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <RadioGroupItem
            aria-label="Off Scene"
            id="rel-scope-off"
            value="off-scene"
          />
          <label className="cursor-pointer" htmlFor="rel-scope-off">
            Off Scene
          </label>
        </div>
      </RadioGroup>

      {visibleTypes.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No relationship types match this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleTypes.map((type) => {
            const styled = styling.relationshipStyles[type.name]
            const color = styled?.color ?? DEFAULT_RELATIONSHIP_COLOR
            const expanded = openType === type.name
            const sceneCount = inSceneCounts[type.name] ?? 0
            const showCount =
              scope === "in-scene"
                ? sceneCount
                : scope === "off-scene"
                  ? type.count
                  : sceneCount || type.count

            return (
              <div
                className="overflow-hidden rounded-md border border-border bg-background"
                key={type.name}
              >
                <Popover
                  open={expanded}
                  onOpenChange={(open) => setOpenType(open ? type.name : null)}
                >
                  <div className="flex items-center gap-2 pr-3">
                    <PopoverTrigger asChild>
                      <button
                        aria-label={`Edit styling for ${type.name}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                        type="button"
                      >
                        <span
                          className="h-0.5 w-6 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      </button>
                    </PopoverTrigger>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {type.name}
                      </span>
                      {showCount > 0 ? (
                        <span className="text-xs font-semibold text-foreground">
                          {showCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <PopoverContent
                    side="right"
                    align="start"
                    className="w-96 p-4"
                  >
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {type.name}
                    </div>
                    <RelationshipStylingPopoverContent
                      typeName={type.name}
                      relStyle={styled ?? {}}
                      onChange={(next) =>
                        updateRelationshipStyle(type.name, next)
                      }
                    />
                    {styled ? (
                      <Button
                        className="mt-3 h-7 w-full rounded-md border border-border text-xs text-muted-foreground hover:bg-accent"
                        onClick={() => resetRelationshipStyle(type.name)}
                        type="button"
                        variant="outline"
                      >
                        Reset {type.name} styling
                      </Button>
                    ) : null}
                  </PopoverContent>
                </Popover>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DetailsPanel({
  graph,
  selected,
  connection,
  status,
  statusDetails,
  onDismissIds,
  onReveal,
}: {
  graph: GraphPayload
  selected: GraphSelection
  connection: ConnectionOption | null
  status: string
  statusDetails: StatusDetails | null
  onDismissIds: (ids: string[]) => void
  onReveal: (request: RevealRequest) => void
}) {
  const node =
    selected?.type === "node"
      ? graph.nodes.find((graphNode) => graphNode.id === selected.id)
      : null
  const relationship =
    selected?.type === "relationship"
      ? graph.relationships.find((item) => item.id === selected.id)
      : null
  const multiSelectionCounts = React.useMemo(() => {
    if (selected?.type !== "multi") {
      return null
    }

    const nodeIds = new Set(graph.nodes.map((graphNode) => graphNode.id))
    let nodes = 0
    let relationships = 0

    for (const id of selected.ids) {
      if (nodeIds.has(id)) {
        nodes += 1
      } else {
        relationships += 1
      }
    }

    return { nodes, relationships, total: selected.ids.length }
  }, [graph.nodes, selected])

  return (
    <FadedEdgeScrollArea
      as="aside"
      className="flex min-h-0 flex-col gap-4 bg-card p-4 max-xl:hidden"
    >
      <PanelSection icon={<BadgeInfo className="size-4" />} title="Selection">
        {node && connection ? (
          <NodeInspector
            key={`${connection.id}:${node.id}`}
            connection={connection}
            graph={graph}
            node={node}
            onDismissIds={onDismissIds}
            onReveal={onReveal}
          />
        ) : relationship ? (
          <InspectorBlock
            title={relationship.type}
            rows={{
              Source: relationship.source,
              Target: relationship.target,
              Direction: "source -> target",
              Id: relationship.id,
            }}
            properties={relationship.properties}
          />
        ) : multiSelectionCounts ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Metric label="Selected" value={multiSelectionCounts.total} wide />
            <Metric label="Nodes" value={multiSelectionCounts.nodes} />
            <Metric label="Edges" value={multiSelectionCounts.relationships} />
          </dl>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Select a node or relationship to inspect properties and expansion
            options.
          </div>
        )}
      </PanelSection>

      <PanelSection icon={<Database className="size-4" />} title="Connection">
        <div className="space-y-2 text-sm">
          {connection ? (
            <>
              <div className="font-medium text-foreground">
                {connection.name}
              </div>
              <div className="text-muted-foreground">{connection.host}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="size-3.5 text-primary" />
                {connection.scheme}
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              No connection selected.
            </div>
          )}
        </div>
      </PanelSection>

      <PanelSection
        icon={<IconGraphNetwork className="size-4" />}
        title="Scene"
      >
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Metric label="Nodes" value={graph.nodes.length} />
          <Metric label="Edges" value={graph.relationships.length} />
          <StatusMetric details={statusDetails} status={status} />
        </dl>
      </PanelSection>
    </FadedEdgeScrollArea>
  )
}

function StatusMetric({
  status,
  details,
}: {
  status: string
  details: StatusDetails | null
}) {
  const [copyStatus, setCopyStatus] = React.useState<
    "idle" | "copied" | "failed"
  >("idle")
  const copyText = React.useMemo(
    () =>
      details
        ? JSON.stringify(
            {
              status,
              message: details.message,
              debug: details.debug,
            },
            null,
            2
          )
        : "",
    [details, status]
  )

  async function copyDebugInfo() {
    if (!copyText) {
      return
    }

    try {
      await navigator.clipboard.writeText(copyText)
      setCopyStatus("copied")
    } catch {
      setCopyStatus("failed")
    }

    window.setTimeout(() => setCopyStatus("idle"), 1600)
  }

  return (
    <div className="col-span-2 rounded-md border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">Status</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{status}</dd>
      {details ? (
        <div className="mt-3 space-y-2">
          <pre className="max-h-48 overflow-auto rounded-md border border-border bg-card p-2 text-xs leading-5 text-muted-foreground">
            {copyText}
          </pre>
          <Button
            className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border text-xs hover:bg-accent"
            onClick={() => void copyDebugInfo()}
            type="button"
            variant="outline"
          >
            <Copy className="size-3.5" />
            {copyStatus === "copied"
              ? "Copied"
              : copyStatus === "failed"
                ? "Copy failed"
                : "Copy debug info"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function QueryWorkspace({
  query,
  paramsText,
  result,
  error,
  history,
  selectedConnection,
  onQueryChange,
  onParamsTextChange,
  onRunQuery,
  onLoadHistory,
}: {
  query: string
  paramsText: string
  result: QueryResultPayload | null
  error: string | null
  history: QueryHistoryEntry[]
  selectedConnection: ConnectionOption | null
  onQueryChange: (query: string) => void
  onParamsTextChange: (params: string) => void
  onRunQuery: () => void
  onLoadHistory: (entry: QueryHistoryEntry) => void
}) {
  return (
    <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] border-t border-border max-lg:grid-cols-1">
      <div className="flex min-h-0 flex-col gap-4 p-4">
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 max-xl:grid-cols-1">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium">Cypher Query</h2>
                <p className="text-xs text-muted-foreground">
                  MATCH/RETURN only. Write and CALL commands are blocked.
                </p>
              </div>
              <Button
                className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                disabled={!selectedConnection}
                onClick={onRunQuery}
                type="button"
              >
                <Play className="size-3.5" />
                Run
              </Button>
            </div>
            <Textarea
              className="min-h-64 flex-1 resize-none rounded-md border border-border bg-muted p-4 font-mono text-sm leading-6 text-foreground outline-none focus:border-primary"
              spellCheck={false}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            <Textarea
              className="h-32 resize-none rounded-md border border-border bg-muted p-3 font-mono text-xs leading-5 text-foreground outline-none focus:border-primary"
              spellCheck={false}
              value={paramsText}
              onChange={(event) => onParamsTextChange(event.target.value)}
            />
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 overflow-hidden rounded-md border border-border bg-muted">
            <div className="flex h-10 items-center justify-between border-b border-border px-3 text-sm">
              <span>Results</span>
              <span className="text-xs text-muted-foreground">
                {selectedConnection?.name ?? "No connection"}
              </span>
            </div>
            <ResultTable result={result} />
          </div>
        </div>
      </div>

      <FadedEdgeScrollArea
        as="aside"
        className="min-h-0 border-l border-border bg-card p-4 max-lg:hidden"
      >
        <PanelSection icon={<IconQuery className="size-4" />} title="History">
          <div className="space-y-2">
            {history.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                The last 100 queries are stored locally with capped result
                snapshots.
              </div>
            ) : (
              history.map((entry) => (
                <Button
                  className="w-full rounded-md border border-border bg-background p-3 text-left hover:bg-accent"
                  key={entry.id}
                  onClick={() => onLoadHistory(entry)}
                  type="button"
                  variant="outline"
                >
                  <div className="truncate text-sm text-foreground">
                    {entry.query.split("\n")[0]}
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{entry.connectionName}</span>
                    <span>{entry.snapshotStatus}</span>
                  </div>
                </Button>
              ))
            )}
          </div>
        </PanelSection>
      </FadedEdgeScrollArea>
    </section>
  )
}

function ResultTable({ result }: { result: QueryResultPayload | null }) {
  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Run a read query to inspect table, graph, and raw JSON results.
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            {result.columns.map((column) => (
              <th className="border-b border-border px-3 py-2" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr className="border-b border-border/50" key={getRowKey(row)}>
              {result.columns.map((column) => (
                <td className="max-w-80 px-3 py-2 align-top" key={column}>
                  <pre className="whitespace-pre-wrap break-words font-mono text-muted-foreground">
                    {JSON.stringify(row[column], null, 2)}
                  </pre>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        {result.summary.records} records, {result.graph.nodes.length} graph
        nodes, {result.graph.relationships.length} relationships
      </div>
    </div>
  )
}

function ConnectionManagerDialog({
  connections,
  selectedConnectionId,
  onClose,
  onDelete,
  onSelect,
  onSaved,
}: {
  connections: ConnectionOption[]
  selectedConnectionId: string | null
  onClose: () => void
  onDelete: (id: string) => Promise<void>
  onSelect: (id: string) => void
  onSaved: (connection: LocalConnection) => void
}) {
  const [form, setForm] = React.useState({
    name: "",
    connectionUrl: "",
    username: "",
    password: "",
  })
  const [error, setError] = React.useState<string | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  async function save() {
    setError(null)

    try {
      const connection = await saveLocalConnection(form)
      onSaved(connection)
      setForm({
        name: "",
        connectionUrl: "",
        username: "",
        password: "",
      })
    } catch {
      setError("Enter a valid Neo4j URL and connection details.")
    }
  }

  async function removeConnection(id: string) {
    setDeletingId(id)

    try {
      await onDelete(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[calc(100svh-2rem)] w-[min(calc(100vw-2rem),48rem)] !max-w-none overflow-y-auto border border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>Manage connections</DialogTitle>
          <DialogDescription>
            Select an active connection, remove browser-local connections, or
            add a new local Neo4j database.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[minmax(280px,1fr)_320px]">
          <section className="min-w-0 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Connections
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {connections.map((connection) => {
                const selected = connection.id === selectedConnectionId
                const canDelete = connection.source === "local"

                return (
                  <div
                    className={`flex min-w-0 items-center gap-3 rounded-md border p-3 ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background"
                    }`}
                    key={connection.id}
                  >
                    <Database
                      className={`size-4 shrink-0 ${
                        selected ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {connection.name}
                        </span>
                        <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {getConnectionSourceLabel(connection)}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {connection.scheme} - {connection.host} -{" "}
                        {connection.username}
                      </div>
                    </div>
                    {selected ? (
                      <span className="shrink-0 text-xs font-medium text-primary">
                        Active
                      </span>
                    ) : (
                      <Button
                        className="h-8 rounded-md border border-border px-3 text-xs hover:bg-accent"
                        onClick={() => onSelect(connection.id)}
                        type="button"
                        variant="outline"
                      >
                        Use
                      </Button>
                    )}
                    {canDelete ? (
                      <Button
                        aria-label={`Delete ${connection.name}`}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
                        disabled={deletingId === connection.id}
                        onClick={() => void removeConnection(connection.id)}
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add local
            </div>
            {(
              [
                ["name", "Name"],
                ["connectionUrl", "neo4j+s://..."],
                ["username", "Username"],
                ["password", "Password"],
              ] as const
            ).map(([key, label]) => (
              <label className="block" htmlFor={`local-${key}`} key={key}>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {label}
                </span>
                <Input
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  id={`local-${key}`}
                  type={key === "password" ? "password" : "text"}
                  value={form[key]}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <p className="text-xs leading-5 text-muted-foreground">
              Passwords are encrypted in this browser and are not sent to the
              app server.
            </p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              className="h-8 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => void save()}
              type="button"
            >
              Save locally
            </Button>
          </section>
        </div>
        <DialogFooter className="mt-1">
          <Button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent"
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Close manager
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getConnectionSourceLabel(connection: ConnectionOption) {
  if (connection.source === "admin") {
    return "Admin"
  }

  return "Local"
}

function PanelSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </section>
  )
}

type NodeConnection = {
  relationship: GraphRelationshipRecord
  neighbor: GraphNodeRecord
  direction: "incoming" | "outgoing" | "self"
}

async function loadNodeAdjacency(
  connection: ConnectionOption,
  nodeId: string
): Promise<GraphPayload> {
  if (connection.source === "local") {
    const result = await getLocalNodeAdjacency(connection, nodeId)

    return result.graph
  }

  const response = await fetch("/api/explore/adjacency", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectionId: connection.id,
      nodeId,
    }),
  })

  if (!response.ok) {
    throw new Error("Adjacency request failed")
  }

  return (await response.json()) as GraphPayload
}

function NodeInspector({
  connection,
  graph,
  node,
  onDismissIds,
  onReveal,
}: {
  connection: ConnectionOption
  graph: GraphPayload
  node: GraphNodeRecord
  onDismissIds: (ids: string[]) => void
  onReveal: (request: RevealRequest) => void
}) {
  const [adjacencyState, setAdjacencyState] = React.useState<{
    graph: GraphPayload | null
    status: "loading" | "loaded" | "error"
  }>({ graph: null, status: "loading" })
  const inspectedGraph = adjacencyState.graph ?? graph
  const inspectedNode =
    inspectedGraph.nodes.find((graphNode) => graphNode.id === node.id) ?? node
  const connections = getNodeConnections(inspectedNode, inspectedGraph)
  const neighborCount = new Set(connections.map((item) => item.neighbor.id))
    .size

  React.useEffect(() => {
    let active = true

    loadNodeAdjacency(connection, node.id)
      .then((nextAdjacency) => {
        if (!active) return
        setAdjacencyState({ graph: nextAdjacency, status: "loaded" })
      })
      .catch(() => {
        if (!active) return
        setAdjacencyState({ graph: null, status: "error" })
      })

    return () => {
      active = false
    }
  }, [connection, node.id])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="break-words text-base font-medium">
          {inspectedNode.caption}
        </h3>
        {adjacencyState.status === "loading" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Loading database neighbors and relationships.
          </p>
        ) : null}
        {adjacencyState.status === "error" ? (
          <p className="mt-1 text-xs text-destructive">
            Could not load database neighbors. Showing scene data.
          </p>
        ) : null}
      </div>

      <Tabs defaultValue="properties">
        <TabsList className="grid h-9 w-full grid-cols-3">
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="neighbors">Neighbors</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-2" value="properties">
          <NodePropertiesTab
            node={inspectedNode}
            relationshipCount={connections.length}
          />
        </TabsContent>
        <TabsContent className="pt-2" value="neighbors">
          <NodeNeighborsTab
            connections={connections}
            graph={inspectedGraph}
            neighborCount={neighborCount}
            onDismissIds={onDismissIds}
            sceneGraph={graph}
            onReveal={onReveal}
          />
        </TabsContent>
        <TabsContent className="pt-2" value="relationships">
          <NodeRelationshipsTab
            connections={connections}
            graph={inspectedGraph}
            sceneGraph={graph}
            onDismissIds={onDismissIds}
            onReveal={onReveal}
            selectedNode={inspectedNode}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function NodePropertiesTab({
  node,
  relationshipCount,
}: {
  node: GraphNodeRecord
  relationshipCount: number
}) {
  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm">
        <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">Labels</dt>
          <dd className="break-words text-foreground">
            {node.labels.join(", ")}
          </dd>
        </div>
        <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">Degree</dt>
          <dd className="break-words text-foreground">{relationshipCount}</dd>
        </div>
        <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">Id</dt>
          <dd className="break-words text-foreground">{node.id}</dd>
        </div>
      </dl>
      <PropertiesPreview properties={node.properties} />
    </div>
  )
}

function NodeNeighborsTab({
  connections,
  graph,
  neighborCount,
  onDismissIds,
  sceneGraph,
  onReveal,
}: {
  connections: NodeConnection[]
  graph: GraphPayload
  neighborCount: number
  onDismissIds: (ids: string[]) => void
  sceneGraph: GraphPayload
  onReveal: (request: RevealRequest) => void
}) {
  const byNode = new Map<
    string,
    {
      node: GraphNodeRecord
      connections: NodeConnection[]
    }
  >()

  for (const connection of connections) {
    const current = byNode.get(connection.neighbor.id)
    if (current) {
      current.connections.push(connection)
    } else {
      byNode.set(connection.neighbor.id, {
        node: connection.neighbor,
        connections: [connection],
      })
    }
  }

  const neighbors = Array.from(byNode.values())

  if (neighbors.length === 0) {
    return (
      <EmptySelectionMessage>
        No connected nodes are in the scene.
      </EmptySelectionMessage>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <DetailChip>{neighborCount} nodes</DetailChip>
        <DetailChip>{connections.length} relationships</DetailChip>
      </div>
      <div className="space-y-2">
        {neighbors.map(({ node: neighbor, connections: nodeConnections }) => {
          const nodeInScene = sceneGraph.nodes.some(
            (node) => node.id === neighbor.id
          )

          return (
            <RevealContextMenu
              key={neighbor.id}
              label={nodeInScene ? "Jump to node" : "Reveal"}
              onDismiss={nodeInScene ? () => onDismissIds([neighbor.id]) : null}
              onReveal={() =>
                onReveal({
                  graph,
                  selection: { type: "node", id: neighbor.id },
                  focusNodeId: neighbor.id,
                })
              }
            >
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {neighbor.caption}
                    </div>
                    <div className="mt-1 break-words text-xs text-muted-foreground">
                      {neighbor.id}
                    </div>
                  </div>
                  <DetailChip>{nodeConnections.length}</DetailChip>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {neighbor.labels.map((label) => (
                    <DetailChip key={label}>{label}</DetailChip>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {nodeConnections.map((connection) => (
                    <DetailChip key={connection.relationship.id}>
                      {getDirectionLabel(connection.direction)}{" "}
                      {connection.relationship.type}
                    </DetailChip>
                  ))}
                </div>
              </div>
            </RevealContextMenu>
          )
        })}
      </div>
    </div>
  )
}

function NodeRelationshipsTab({
  connections,
  graph,
  sceneGraph,
  onDismissIds,
  onReveal,
  selectedNode,
}: {
  connections: NodeConnection[]
  graph: GraphPayload
  sceneGraph: GraphPayload
  onDismissIds: (ids: string[]) => void
  onReveal: (request: RevealRequest) => void
  selectedNode: GraphNodeRecord
}) {
  if (connections.length === 0) {
    return (
      <EmptySelectionMessage>
        No connected relationships are in the scene.
      </EmptySelectionMessage>
    )
  }

  return (
    <div className="space-y-2">
      {connections.map((connection) => {
        const sourceIsSelected =
          connection.relationship.source === selectedNode.id
        const targetIsSelected =
          connection.relationship.target === selectedNode.id
        const sourceNode = sourceIsSelected ? selectedNode : connection.neighbor
        const targetNode = targetIsSelected ? selectedNode : connection.neighbor
        const propertyCount = Object.keys(
          connection.relationship.properties
        ).length
        const relationshipInScene = sceneGraph.relationships.some(
          (relationship) => relationship.id === connection.relationship.id
        )

        return (
          <RelationshipContextMenu
            key={connection.relationship.id}
            relationshipInScene={relationshipInScene}
            onDismiss={() => onDismissIds([connection.relationship.id])}
            onJump={() =>
              onReveal({
                graph,
                selection: {
                  type: "relationship",
                  id: connection.relationship.id,
                },
                focusNodeId: connection.relationship.source,
              })
            }
            onReveal={() =>
              onReveal({
                graph,
                selection: {
                  type: "relationship",
                  id: connection.relationship.id,
                },
                focusNodeId: connection.relationship.source,
              })
            }
          >
            <div className="overflow-hidden rounded-md border border-primary/40 bg-background">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(96px,120px)_minmax(0,1fr)] items-stretch text-xs">
                <NodeEndpoint
                  active={sourceIsSelected}
                  labels={sourceNode.labels}
                  title={sourceNode.caption}
                />
                <div className="flex min-w-0 flex-col items-center justify-center border-x border-border px-2 py-3">
                  <div className="max-w-full truncate rounded-full bg-primary/10 px-2 py-1 font-semibold text-primary">
                    {connection.relationship.type}
                  </div>
                  <div className="mt-2 flex w-full items-center gap-1 text-muted-foreground">
                    <span className="h-px flex-1 bg-muted-foreground/60" />
                    <span>-&gt;</span>
                  </div>
                </div>
                <NodeEndpoint
                  active={targetIsSelected}
                  labels={targetNode.labels}
                  title={targetNode.caption}
                />
              </div>
              <div className="border-t border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">
                    Edge {connection.relationship.id}
                  </span>
                  <DetailChip>
                    <Plus className="mr-1 size-3" />
                    {propertyCount}{" "}
                    {propertyCount === 1 ? "property" : "properties"}
                  </DetailChip>
                </div>
                {propertyCount > 0 ? (
                  <PropertiesPreview
                    properties={connection.relationship.properties}
                  />
                ) : (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No edge properties.
                  </div>
                )}
              </div>
            </div>
          </RelationshipContextMenu>
        )
      })}
    </div>
  )
}

function NodeEndpoint({
  active,
  labels,
  title,
}: {
  active: boolean
  labels: string[]
  title: string
}) {
  return (
    <div className={`min-w-0 p-3 ${active ? "bg-primary/10" : ""}`}>
      <div className="line-clamp-2 text-foreground">{title}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {labels.map((label) => (
          <DetailChip key={label}>{label}</DetailChip>
        ))}
      </div>
    </div>
  )
}

function RevealContextMenu({
  children,
  label = "Reveal",
  onDismiss,
  onReveal,
}: {
  children: React.ReactNode
  label?: string
  onDismiss?: (() => void) | null
  onReveal: () => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-36">
        <ContextMenuItem onSelect={onReveal}>
          <Eye className="size-3.5" />
          {label}
        </ContextMenuItem>
        {onDismiss ? (
          <ContextMenuItem onSelect={onDismiss}>
            <EyeOff className="size-3.5" />
            Dismiss
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function RelationshipContextMenu({
  children,
  relationshipInScene,
  onDismiss,
  onJump,
  onReveal,
}: {
  children: React.ReactNode
  relationshipInScene: boolean
  onDismiss: () => void
  onJump: () => void
  onReveal: () => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {relationshipInScene ? (
          <>
            <ContextMenuItem onSelect={onJump}>
              <Eye className="size-3.5" />
              Jump to relationship
            </ContextMenuItem>
            <ContextMenuItem onSelect={onDismiss}>
              <EyeOff className="size-3.5" />
              Dismiss
            </ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem onSelect={onReveal}>
            <Eye className="size-3.5" />
            Reveal
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function PropertiesPreview({
  properties,
}: {
  properties: Record<string, unknown>
}) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
      {JSON.stringify(properties, null, 2)}
    </pre>
  )
}

function DetailChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function EmptySelectionMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function InspectorBlock({
  title,
  rows,
  properties,
}: {
  title: string
  rows: Record<string, string>
  properties: Record<string, unknown>
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="break-words text-base font-medium">{title}</h3>
      </div>
      <dl className="space-y-2 text-sm">
        {Object.entries(rows).map(([key, value]) => (
          <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3" key={key}>
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="break-words text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Properties
        </div>
        <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
          {JSON.stringify(properties, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  wide = false,
}: {
  label: string
  value: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={`rounded-md border border-border bg-background p-3 ${
        wide ? "col-span-2" : ""
      }`}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  )
}

function mergeGraphs(currentGraph: GraphPayload, nextGraph: GraphPayload) {
  const nodeIds = new Set(currentGraph.nodes.map((node) => node.id))
  const relationshipIds = new Set(
    currentGraph.relationships.map((relationship) => relationship.id)
  )

  return {
    nodes: [
      ...currentGraph.nodes,
      ...nextGraph.nodes.filter((node) => {
        if (nodeIds.has(node.id)) return false
        nodeIds.add(node.id)
        return true
      }),
    ],
    relationships: [
      ...currentGraph.relationships,
      ...nextGraph.relationships.filter((relationship) => {
        if (relationshipIds.has(relationship.id)) return false
        relationshipIds.add(relationship.id)
        return true
      }),
    ],
  }
}

function getNewGraphItems(currentGraph: GraphPayload, nextGraph: GraphPayload) {
  const nodeIds = new Set(currentGraph.nodes.map((node) => node.id))
  const relationshipIds = new Set(
    currentGraph.relationships.map((relationship) => relationship.id)
  )

  return {
    nodes: nextGraph.nodes.filter((node) => !nodeIds.has(node.id)),
    relationships: nextGraph.relationships.filter(
      (relationship) => !relationshipIds.has(relationship.id)
    ),
  }
}

function getNodeIdsFromIds(ids: string[], graph: GraphPayload) {
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id))
  const seen = new Set<string>()

  return ids.filter((id) => {
    if (seen.has(id) || !graphNodeIds.has(id)) {
      return false
    }

    seen.add(id)
    return true
  })
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function formatExpansionResultMessage(graph: GraphPayload) {
  const nodeCount = graph.nodes.length
  const relationshipCount = graph.relationships.length

  return `${nodeCount} ${nodeCount === 1 ? "node" : "nodes"} and ${relationshipCount} ${relationshipCount === 1 ? "relationship" : "relationships"} are found.`
}

function getSelectionNodeIds(selection: GraphSelection, graph: GraphPayload) {
  return getNodeIdsFromIds(getGraphSelectionIds(selection), graph)
}

function getNodeConnections(node: GraphNodeRecord, graph: GraphPayload) {
  const nodesById = new Map(
    graph.nodes.map((graphNode) => [graphNode.id, graphNode] as const)
  )
  const connections: NodeConnection[] = []

  for (const relationship of graph.relationships) {
    if (relationship.source !== node.id && relationship.target !== node.id) {
      continue
    }

    const neighborId =
      relationship.source === node.id
        ? relationship.target
        : relationship.source
    const neighbor = nodesById.get(neighborId)
    if (!neighbor) continue

    connections.push({
      relationship,
      neighbor,
      direction:
        relationship.source === relationship.target
          ? "self"
          : relationship.source === node.id
            ? "outgoing"
            : "incoming",
    })
  }

  return connections
}

function getDirectionLabel(direction: NodeConnection["direction"]) {
  if (direction === "incoming") return "In"
  if (direction === "outgoing") return "Out"
  return "Self"
}

function getRowKey(row: Record<string, unknown>) {
  return JSON.stringify(row)
}
