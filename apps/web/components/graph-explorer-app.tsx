"use client"

import { Button } from "@workspace/ui/components/button"
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
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
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
  CircleDot,
  Copy,
  Database,
  Eye,
  EyeOff,
  GitBranch,
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
  Type,
} from "lucide-react"
import { useTheme } from "next-themes"
import * as React from "react"
import {
  type GraphSelection,
  ReagraphWorkspace,
} from "@/components/reagraph-workspace"
import {
  NodeStylingPopoverContent,
  RelationshipStylingPopoverContent,
} from "@/components/styling-panel"
import { authClient } from "@/lib/auth-client"
import {
  expandLocalGraph,
  readLocalSchema,
  runLocalReadQuery,
  searchLocalGraph,
  suggestLocalGraph,
} from "@/lib/browser-neo4j"
import { validateReadOnlyMatchQuery } from "@/lib/cypher"
import type {
  GraphPayload,
  GraphSearchSuggestion,
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
import {
  sampleGraph,
  sampleSchema,
  searchSampleGraph,
  suggestSampleGraph,
} from "@/lib/sample-graph"

const emptySchema: SchemaPayload = {
  labels: [],
  relationshipTypes: [],
  propertyKeys: [],
}

type AdminConnection = {
  id: string
  source: "admin"
  name: string
  host: string
  scheme: string
  username: string
}

type SampleConnection = {
  id: "sample"
  source: "sample"
  name: string
  host: string
  scheme: string
  username: string
}

type ConnectionOption = AdminConnection | LocalConnection | SampleConnection

type StatusDetails = {
  message: string
  debug: Record<string, unknown>
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

const sampleConnection: SampleConnection = {
  id: "sample",
  source: "sample",
  name: "Sample Graph",
  host: "browser demo",
  scheme: "sample",
  username: "read-only",
}

const defaultQuery = "MATCH (n)-[r]-(m)\nRETURN n, r, m\nLIMIT 50"

const emptyGraph: GraphPayload = {
  nodes: [],
  relationships: [],
}

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
  const [selectedConnectionId, setSelectedConnectionId] = React.useState(
    initialConnections[0]?.id ?? sampleConnection.id
  )
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
  const [canvasVersion, setCanvasVersion] = React.useState(0)
  const [hiddenCategories, setHiddenCategories] = React.useState<string[]>([])
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

  const connections = React.useMemo<ConnectionOption[]>(
    () => [sampleConnection, ...initialConnections, ...localConnections],
    [initialConnections, localConnections]
  )
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ??
    connections[0] ??
    sampleConnection

  React.useEffect(() => {
    listLocalConnections()
      .then(setLocalConnections)
      .catch(() => setStatus("Local connection storage is unavailable"))
    listQueryHistory()
      .then(setHistory)
      .catch(() => undefined)
  }, [])

  const loadSchema = React.useCallback(async (connection: ConnectionOption) => {
    if (connection.source === "sample") {
      setSchema(sampleSchema)
      return
    }

    if (connection.source === "local") {
      try {
        setSchema(await readLocalSchema(connection))
      } catch {
        setSchema(sampleSchema)
        setStatus("Local schema request failed; showing sample categories")
      }
      return
    }

    try {
      const response = await fetch(
        `/api/explore/schema?connectionId=${connection.id}`
      )
      setSchema(await response.json())
    } catch {
      setSchema(sampleSchema)
    }
  }, [])

  const loadGraph = React.useCallback(
    async (connection: ConnectionOption, search: string) => {
      setStatusDetails(null)
      setGraph(emptyGraph)
      setIsGraphLoading(true)

      try {
        if (connection.source === "sample") {
          setGraph(searchSampleGraph(search))
          setStatus("Loaded sample graph")
          return
        }

        if (connection.source === "local") {
          setStatus("Searching local graph from this browser")

          try {
            const result = await searchLocalGraph(connection, search, 120)
            setGraph(result.graph)
            setStatus("Local graph loaded")
          } catch (error) {
            setGraph(emptyGraph)
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

            setGraph(emptyGraph)
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

          setGraph(await response.json())
          setStatus("Graph loaded")
          setStatusDetails(null)
        } catch (error) {
          setGraph(emptyGraph)
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
    []
  )

  React.useEffect(() => {
    const trimmedSearch = searchTerm.trim()

    if (trimmedSearch.length < 2) {
      setSearchSuggestions([])
      setIsSearchSuggesting(false)
      return
    }

    if (selectedConnection.source === "sample") {
      setSearchSuggestions(suggestSampleGraph(trimmedSearch))
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
    setSelection(null)
    setHiddenCategories([])
    void loadSchema(selectedConnection)
    void loadGraph(selectedConnection, "")
  }, [loadGraph, loadSchema, selectedConnection])

  async function expandNode(nodeId: string) {
    if (selectedConnection.source === "sample") {
      setStatus("Sample graph expansion is already loaded")
      return
    }

    setIsGraphExpanding(true)
    try {
      if (selectedConnection.source === "local") {
        setStatus("Expanding local neighborhood from this browser")

        try {
          const expandedGraph = await expandLocalGraph(
            selectedConnection,
            nodeId,
            "both",
            120
          )

          setGraph((currentGraph) =>
            mergeGraphs(currentGraph, expandedGraph.graph)
          )
          setStatus("Local neighborhood expanded")
        } catch {
          setStatus("Local graph expansion failed")
        }
        return
      }

      setStatus("Expanding neighborhood")

      try {
        const response = await fetch("/api/explore/expand", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connectionId: selectedConnection.id,
            nodeId,
            direction: "both",
            limit: 120,
          }),
        })
        const expandedGraph = (await response.json()) as GraphPayload

        setGraph((currentGraph) => mergeGraphs(currentGraph, expandedGraph))
        setStatus("Neighborhood expanded")
      } catch {
        setStatus("Expansion failed")
      }
    } finally {
      setIsGraphExpanding(false)
    }
  }

  function expandSelected() {
    if (!selection || selection.type !== "node") {
      setStatus("Select a node to expand")
      return
    }
    void expandNode(selection.id)
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

    if (selectedConnection.source === "sample") {
      const result = sampleQueryResult()
      setQueryResult(result)
      setQueryError(null)
      setStatus("Local/sample query preview stored")
      const entry = await addQueryHistoryEntry({
        connectionName: selectedConnection.name,
        query,
        params,
        snapshot: result,
      })
      setHistory((currentHistory) => [entry, ...currentHistory].slice(0, 100))
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

  async function deleteConnection(id: string) {
    await deleteLocalConnection(id)
    setLocalConnections((currentConnections) =>
      currentConnections.filter((connection) => connection.id !== id)
    )

    if (selectedConnectionId === id) {
      setSelectedConnectionId(initialConnections[0]?.id ?? sampleConnection.id)
    }
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
            onSearchTermChange={setSearchTerm}
            schema={schema}
            graph={graph}
            hiddenCategories={hiddenCategories}
            styling={styling}
            onStylingChange={setStyling}
            onToggleCategory={toggleCategory}
            searchSuggestions={visibleSearchSuggestions}
            isSearchSuggesting={isSearchSuggesting}
            onSearch={() => loadGraph(selectedConnection, searchTerm)}
            onSearchSuggestionSelect={(suggestion) => {
              setSearchTerm(suggestion.searchValue)
              void loadGraph(selectedConnection, suggestion.searchValue)
            }}
            onExpand={expandSelected}
            selection={selection}
            onReset={() => {
              setGraph(emptyGraph)
              setSelection(null)
              setSearchTerm("")
              setSearchSuggestions([])
              setHiddenCategories([])
              setStatusDetails(null)
              setCanvasVersion((version) => version + 1)
              setStatus("Canvas cleared")
            }}
          />
          <section className="min-h-0 border-x border-border max-lg:h-[58vh]">
            <ReagraphWorkspace
              graph={graph}
              canvasKey={canvasVersion}
              hiddenCategories={hiddenCategories}
              styling={styling}
              selected={selection}
              isLoading={isGraphLoading}
              isExpanding={isGraphExpanding}
              onSelect={setSelection}
              onExpandNode={(nodeId) => void expandNode(nodeId)}
            />
          </section>
          <DetailsPanel
            graph={graph}
            selected={selection}
            connection={selectedConnection}
            status={status}
            statusDetails={statusDetails}
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
          selectedConnectionId={selectedConnection.id}
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
  selectedConnection: ConnectionOption
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
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 px-4">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <GitBranch className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">Graph Explorer</div>
          <div className="truncate text-xs text-muted-foreground">
            Read-only Neo4j workspace
          </div>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="inline-flex h-8 min-w-64 items-center justify-between gap-2 rounded-md border border-border px-2 text-sm font-normal hover:bg-accent"
              type="button"
              variant="outline"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Database className="size-4 text-primary" />
                <span className="truncate">{selectedConnection.name}</span>
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={selectedConnection.id}
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

      <div className="flex items-center gap-2">
        <div className="rounded-md border border-border bg-muted/50 p-1">
          <Button
            className={`h-7 rounded px-4 text-sm ${
              activeTab === "explore"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => onTabChange("explore")}
            type="button"
            variant="ghost"
          >
            Explore
          </Button>
          <Button
            className={`h-7 rounded px-4 text-sm ${
              activeTab === "query"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => onTabChange("query")}
            type="button"
            variant="ghost"
          >
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

function ExploreLeftPanel({
  searchTerm,
  schema,
  graph,
  hiddenCategories,
  styling,
  onStylingChange,
  onSearchTermChange,
  onToggleCategory,
  searchSuggestions,
  isSearchSuggesting,
  onSearch,
  onSearchSuggestionSelect,
  onExpand,
  selection,
  onReset,
}: {
  searchTerm: string
  schema: SchemaPayload
  graph: GraphPayload
  hiddenCategories: string[]
  styling: StylingState
  onStylingChange: (next: StylingState) => void
  onSearchTermChange: (value: string) => void
  onToggleCategory: (category: string) => void
  searchSuggestions: GraphSearchSuggestion[]
  isSearchSuggesting: boolean
  onSearch: () => void
  onSearchSuggestionSelect: (suggestion: GraphSearchSuggestion) => void
  onExpand: () => void
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

  React.useEffect(() => {
    const categoryNames = new Set(schema.labels.map((label) => label.name))
    if (openCategory && !categoryNames.has(openCategory)) {
      setOpenCategory(null)
    }
  }, [openCategory, schema.labels])

  React.useEffect(() => {
    setActiveSuggestionIndex(searchSuggestions.length > 0 ? 0 : -1)
  }, [searchSuggestions])

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

  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto bg-card p-4">
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
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
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
                onSearch()
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
      </div>

      <PanelSection icon={<Settings2 className="size-4" />} title="Graph">
        {selection?.type === "node" ? (
          <Button
            className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border text-xs hover:bg-accent"
            onClick={onExpand}
            type="button"
            variant="outline"
          >
            <Maximize className="size-3.5" />
            Expand node
          </Button>
        ) : null}
        <Button
          className="h-8 rounded-md border border-border text-xs hover:bg-accent"
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
            <TabsTrigger className="text-sm" value="nodes">
              Nodes
            </TabsTrigger>
            <TabsTrigger className="text-sm" value="relationships">
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
    </aside>
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
}: {
  graph: GraphPayload
  selected: GraphSelection
  connection: ConnectionOption
  status: string
  statusDetails: StatusDetails | null
}) {
  const node =
    selected?.type === "node"
      ? graph.nodes.find((graphNode) => graphNode.id === selected.id)
      : null
  const relationship =
    selected?.type === "relationship"
      ? graph.relationships.find((item) => item.id === selected.id)
      : null

  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto bg-card p-4 max-xl:hidden">
      <PanelSection icon={<BadgeInfo className="size-4" />} title="Selection">
        {node ? (
          <InspectorBlock
            title={node.caption}
            rows={{
              Labels: node.labels.join(", "),
              Degree: String(
                graph.relationships.filter(
                  (item) => item.source === node.id || item.target === node.id
                ).length
              ),
              Id: node.id,
            }}
            properties={node.properties}
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
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Select a node or relationship to inspect properties and expansion
            options.
          </div>
        )}
      </PanelSection>

      <PanelSection icon={<Database className="size-4" />} title="Connection">
        <div className="space-y-2 text-sm">
          <div className="font-medium text-foreground">{connection.name}</div>
          <div className="text-muted-foreground">{connection.host}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-3.5 text-primary" />
            {connection.scheme}
          </div>
        </div>
      </PanelSection>

      <PanelSection icon={<CircleDot className="size-4" />} title="Scene">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Metric label="Nodes" value={graph.nodes.length} />
          <Metric label="Edges" value={graph.relationships.length} />
          <StatusMetric details={statusDetails} status={status} />
        </dl>
      </PanelSection>
    </aside>
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
  selectedConnection: ConnectionOption
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
                {selectedConnection.name}
              </span>
            </div>
            <ResultTable result={result} />
          </div>
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-l border-border bg-card p-4 max-lg:hidden">
        <PanelSection icon={<Type className="size-4" />} title="History">
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
      </aside>
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
  selectedConnectionId: string
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

  if (connection.source === "local") {
    return "Local"
  }

  return "Sample"
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
  return {
    nodes: [
      ...currentGraph.nodes,
      ...nextGraph.nodes.filter(
        (node) =>
          !currentGraph.nodes.some((currentNode) => currentNode.id === node.id)
      ),
    ],
    relationships: [
      ...currentGraph.relationships,
      ...nextGraph.relationships.filter(
        (relationship) =>
          !currentGraph.relationships.some(
            (currentRelationship) => currentRelationship.id === relationship.id
          )
      ),
    ],
  }
}

function sampleQueryResult(): QueryResultPayload {
  return {
    columns: ["n", "r", "m"],
    rows: sampleGraph.relationships.slice(0, 10).map((relationship) => ({
      n: sampleGraph.nodes.find((node) => node.id === relationship.source),
      r: relationship,
      m: sampleGraph.nodes.find((node) => node.id === relationship.target),
    })),
    graph: sampleGraph,
    summary: {
      records: Math.min(sampleGraph.relationships.length, 10),
    },
  }
}

function getRowKey(row: Record<string, unknown>) {
  return JSON.stringify(row)
}
