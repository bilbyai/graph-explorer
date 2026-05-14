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
import { Textarea } from "@workspace/ui/components/textarea"
import {
  BadgeInfo,
  ChevronDown,
  CircleDot,
  Database,
  Eye,
  EyeOff,
  GitBranch,
  ListFilter,
  Lock,
  LogOut,
  Maximize,
  Moon,
  Palette,
  Play,
  Plus,
  RefreshCw,
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
import { StylingPanel } from "@/components/styling-panel"
import { authClient } from "@/lib/auth-client"
import {
  expandLocalGraph,
  readLocalSchema,
  runLocalReadQuery,
  searchLocalGraph,
} from "@/lib/browser-neo4j"
import { validateReadOnlyMatchQuery } from "@/lib/cypher"
import type {
  GraphPayload,
  QueryResultPayload,
  SchemaPayload,
} from "@/lib/graph-types"
import {
  deleteLocalConnection,
  type LocalConnection,
  listLocalConnections,
  saveLocalConnection,
} from "@/lib/local-connections"
import { emptyStyling, type StylingState } from "@/lib/node-styling"
import {
  addQueryHistoryEntry,
  listQueryHistory,
  type QueryHistoryEntry,
} from "@/lib/query-history"
import { sampleGraph, sampleSchema } from "@/lib/sample-graph"

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
  const [graph, setGraph] = React.useState<GraphPayload>(sampleGraph)
  const [schema, setSchema] = React.useState<SchemaPayload>(sampleSchema)
  const [selection, setSelection] = React.useState<GraphSelection>(null)
  const [graphMode, setGraphMode] = React.useState<"2d" | "3d">("2d")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [hiddenCategories, setHiddenCategories] = React.useState<string[]>([])
  const [status, setStatus] = React.useState("Ready")
  const [showConnectionForm, setShowConnectionForm] = React.useState(false)
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
      if (connection.source === "sample") {
        setGraph(sampleGraph)
        setStatus("Loaded sample graph")
        return
      }

      if (connection.source === "local") {
        setStatus("Searching local graph from this browser")

        try {
          const result = await searchLocalGraph(connection, search, 120)
          setGraph(result.graph.nodes.length > 0 ? result.graph : sampleGraph)
          setStatus("Local graph loaded")
        } catch {
          setGraph(sampleGraph)
          setStatus("Local browser connection failed; showing sample graph")
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

        setGraph(await response.json())
        setStatus("Graph loaded")
      } catch {
        setGraph(sampleGraph)
        setStatus("Graph request failed; showing sample graph")
      }
    },
    []
  )

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

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        access={access}
        connections={connections}
        selectedConnection={selectedConnection}
        onConnectionChange={setSelectedConnectionId}
        onAddConnection={() => setShowConnectionForm(true)}
        onManageConnections={() => setShowConnectionForm(true)}
        onDeleteConnection={async (id) => {
          await deleteLocalConnection(id)
          setLocalConnections((currentConnections) =>
            currentConnections.filter((connection) => connection.id !== id)
          )
          setSelectedConnectionId(
            initialConnections[0]?.id ?? sampleConnection.id
          )
        }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "explore" ? (
        <section className="grid min-h-0 flex-1 grid-cols-[310px_minmax(0,1fr)_330px] border-t border-border max-xl:grid-cols-[280px_minmax(0,1fr)] max-lg:grid-cols-1">
          <ExploreLeftPanel
            graphMode={graphMode}
            onGraphModeChange={setGraphMode}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            schema={schema}
            graph={graph}
            hiddenCategories={hiddenCategories}
            styling={styling}
            onStylingChange={setStyling}
            onToggleCategory={toggleCategory}
            onSearch={() => loadGraph(selectedConnection, searchTerm)}
            onExpand={expandSelected}
            onReset={() => {
              setGraph(sampleGraph)
              setSelection(null)
              setStatus("Graph reset")
            }}
          />
          <section className="min-h-0 border-x border-border max-lg:h-[58vh]">
            <ReagraphWorkspace
              graph={graph}
              mode={graphMode}
              hiddenCategories={hiddenCategories}
              styling={styling}
              selected={selection}
              onSelect={setSelection}
              onExpandNode={(nodeId) => void expandNode(nodeId)}
            />
          </section>
          <DetailsPanel
            graph={graph}
            selected={selection}
            connection={selectedConnection}
            status={status}
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

      {showConnectionForm ? (
        <ConnectionDialog
          onClose={() => setShowConnectionForm(false)}
          onSaved={(connection) => {
            setLocalConnections((currentConnections) => [
              ...currentConnections,
              connection,
            ])
            setSelectedConnectionId(connection.id)
            setShowConnectionForm(false)
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
  onDeleteConnection,
}: {
  access: AppAccess
  connections: ConnectionOption[]
  selectedConnection: ConnectionOption
  activeTab: "explore" | "query"
  onTabChange: (tab: "explore" | "query") => void
  onConnectionChange: (id: string) => void
  onAddConnection: () => void
  onManageConnections: () => void
  onDeleteConnection: (id: string) => Promise<void>
}) {
  const { resolvedTheme, setTheme } = useTheme()

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
        <Button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs hover:bg-accent"
          onClick={onManageConnections}
          type="button"
          variant="outline"
        >
          <Settings className="size-3.5" />
          Manage Connections
        </Button>
        {selectedConnection.source === "local" ? (
          <Button
            className="inline-flex size-8 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => void onDeleteConnection(selectedConnection.id)}
            title="Delete local connection"
            type="button"
            variant="outline"
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
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
          {resolvedTheme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
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
  graphMode,
  searchTerm,
  schema,
  graph,
  hiddenCategories,
  styling,
  onStylingChange,
  onGraphModeChange,
  onSearchTermChange,
  onToggleCategory,
  onSearch,
  onExpand,
  onReset,
}: {
  graphMode: "2d" | "3d"
  searchTerm: string
  schema: SchemaPayload
  graph: GraphPayload
  hiddenCategories: string[]
  styling: StylingState
  onStylingChange: (next: StylingState) => void
  onGraphModeChange: (mode: "2d" | "3d") => void
  onSearchTermChange: (value: string) => void
  onToggleCategory: (category: string) => void
  onSearch: () => void
  onExpand: () => void
  onReset: () => void
}) {
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto bg-card p-4">
      <div>
        <label
          className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3"
          htmlFor="explore-search"
        >
          <Search className="size-4 text-muted-foreground" />
          <Input
            className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none focus-visible:ring-0"
            id="explore-search"
            placeholder="Search nodes"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSearch()
              }
            }}
          />
        </label>
      </div>

      <PanelSection icon={<Settings2 className="size-4" />} title="Graph">
        <div className="grid grid-cols-2 gap-2">
          {(["2d", "3d"] as const).map((mode) => (
            <Button
              className={`h-8 rounded-md border text-sm ${
                graphMode === mode
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
              key={mode}
              onClick={() => onGraphModeChange(mode)}
              type="button"
              variant="outline"
            >
              {mode.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border text-xs hover:bg-accent"
            onClick={onSearch}
            type="button"
            variant="outline"
          >
            <RefreshCw className="size-3.5" />
            Search
          </Button>
          <Button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border text-xs hover:bg-accent"
            onClick={onExpand}
            type="button"
            variant="outline"
          >
            <Maximize className="size-3.5" />
            Expand
          </Button>
        </div>
        <Button
          className="h-8 rounded-md border border-border text-xs hover:bg-accent"
          onClick={onReset}
          type="button"
          variant="outline"
        >
          Reset canvas
        </Button>
      </PanelSection>

      <PanelSection icon={<Palette className="size-4" />} title="Styling">
        <StylingPanel
          styling={styling}
          schema={schema}
          graph={graph}
          onChange={onStylingChange}
        />
      </PanelSection>

      <PanelSection icon={<ListFilter className="size-4" />} title="Categories">
        <div className="space-y-2">
          {schema.labels.map((label) => {
            const hidden = hiddenCategories.includes(label.name)

            return (
              <Button
                className="flex w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                key={label.name}
                onClick={() => onToggleCategory(label.name)}
                type="button"
                variant="outline"
              >
                <span
                  className="size-4 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {label.name}
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {label.count}
                </span>
                {hidden ? (
                  <EyeOff className="size-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="size-3.5 text-primary" />
                )}
              </Button>
            )
          })}
        </div>
      </PanelSection>
    </aside>
  )
}

function DetailsPanel({
  graph,
  selected,
  connection,
  status,
}: {
  graph: GraphPayload
  selected: GraphSelection
  connection: ConnectionOption
  status: string
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
          <Metric label="Status" value={status} wide />
        </dl>
      </PanelSection>
    </aside>
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

function ConnectionDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (connection: LocalConnection) => void
}) {
  const [form, setForm] = React.useState({
    name: "",
    connectionUrl: "",
    username: "",
    password: "",
  })
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    try {
      const connection = await saveLocalConnection(form)
      onSaved(connection)
    } catch {
      setError("Enter a valid Neo4j URL and connection details.")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="border border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>Add local connection</DialogTitle>
          <DialogDescription>
            Passwords are encrypted in this browser and are not sent to the app
            server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="mt-1 flex-row justify-between">
          <Button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent"
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => void save()}
            type="button"
          >
            Save locally
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
