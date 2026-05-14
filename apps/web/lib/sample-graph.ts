import type {
  GraphPayload,
  GraphRelationshipRecord,
  GraphSearchSuggestion,
  SchemaPayload,
} from "@/lib/graph-types"

const categoryColors: Record<string, string> = {
  Bank: "#8acfd2",
  Company: "#ffb8b0",
  ESG: "#ffec8a",
  GICS: "#d6af00",
  Media: "#d866d8",
  Person: "#b7b790",
  Pilot: "#62d85a",
  Region: "#7fb276",
  StateBody: "#a9c4f5",
}

export const sampleGraph: GraphPayload = {
  nodes: [
    node("state-body-1", ["StateBody"], "recHHp WOrCyxo...", 24, {
      status: "Demo hub",
      region: "China",
    }),
    node("company-1", ["Company"], "深圳奥雅设计股份有限...", 14),
    node("company-2", ["Company"], "海南大东海旅游中心股...", 14),
    node("company-3", ["Company"], "Vicon Holdings Ltd.", 14),
    node("company-4", ["Company"], "龙元建设集团股份有限...", 14),
    node("company-5", ["Company"], "北京弘高创意建筑设计...", 14),
    node("company-6", ["Company"], "普汇中金国际控股有限...", 14),
    node("company-7", ["Company"], "德益控股有限公司", 14),
    node("person-1", ["Person"], "赖朝辉", 12, { role: "Director" }),
    node("gics-1", ["GICS"], "Construction", 6),
    node("region-1", ["Region"], "Greater China", 5),
    node("pilot-1", ["Pilot"], "Pilot dataset", 9),
    node("bank-1", ["Bank"], "Demo Bank", 2),
    node("esg-1", ["ESG"], "ESG Risk", 5),
    node("media-1", ["Media"], "Market report", 1),
  ],
  relationships: [
    rel("rel-1", "company-1", "state-body-1", "IN_INDUSTRY"),
    rel("rel-2", "company-2", "state-body-1", "IN_INDUSTRY"),
    rel("rel-3", "company-3", "state-body-1", "IN_INDUSTRY"),
    rel("rel-4", "company-4", "state-body-1", "IN_INDUSTRY"),
    rel("rel-5", "company-5", "state-body-1", "IN_INDUSTRY"),
    rel("rel-6", "company-6", "state-body-1", "IN_INDUSTRY"),
    rel("rel-7", "company-7", "state-body-1", "IN_INDUSTRY"),
    rel("rel-8", "company-4", "person-1", "CHAIR"),
    rel("rel-9", "company-4", "person-1", "LEGAL"),
    rel("rel-10", "state-body-1", "gics-1", "HAS_GICS"),
    rel("rel-11", "state-body-1", "region-1", "IN_REGION"),
    rel("rel-12", "region-1", "pilot-1", "CONTAINS"),
    rel("rel-13", "bank-1", "company-6", "LENDS_TO"),
    rel("rel-14", "company-5", "esg-1", "HAS_SIGNAL"),
    rel("rel-15", "media-1", "company-3", "MENTIONS"),
  ],
}

export const sampleSchema: SchemaPayload = {
  labels: Object.entries({
    Bank: 2,
    Company: 14,
    ESG: 5,
    GICS: 6,
    Media: 1,
    Person: 12,
    Pilot: 9,
    Region: 5,
    StateBody: 24,
  }).map(([name, count]) => ({
    name,
    count,
    color: categoryColors[name] ?? "#8acfd2",
  })),
  relationshipTypes: [
    { name: "IN_INDUSTRY", count: 7 },
    { name: "CHAIR", count: 1 },
    { name: "LEGAL", count: 1 },
    { name: "HAS_GICS", count: 1 },
    { name: "IN_REGION", count: 1 },
    { name: "CONTAINS", count: 1 },
    { name: "LENDS_TO", count: 1 },
    { name: "HAS_SIGNAL", count: 1 },
    { name: "MENTIONS", count: 1 },
  ],
  propertyKeys: ["name", "status", "region", "role", "source", "updatedAt"],
}

export function getCategoryColor(label: string) {
  return categoryColors[label] ?? "#8acfd2"
}

export function searchSampleGraph(search: string): GraphPayload {
  const trimmedSearch = search.trim().toLowerCase()

  if (!trimmedSearch) {
    return sampleGraph
  }

  const nodes = sampleGraph.nodes.filter((graphNode) =>
    nodeMatchesSearch(graphNode, trimmedSearch)
  )
  const nodeIds = new Set(nodes.map((graphNode) => graphNode.id))

  return {
    nodes,
    relationships: sampleGraph.relationships.filter(
      (relationship) =>
        nodeIds.has(relationship.source) && nodeIds.has(relationship.target)
    ),
  }
}

export function suggestSampleGraph(
  search: string,
  limit = 8
): GraphSearchSuggestion[] {
  const trimmedSearch = search.trim().toLowerCase()

  if (!trimmedSearch) {
    return []
  }

  return sampleGraph.nodes
    .filter((graphNode) => nodeMatchesSearch(graphNode, trimmedSearch))
    .map((graphNode) => ({
      id: graphNode.id,
      caption: graphNode.caption,
      labels: graphNode.labels,
      detail: graphNode.labels.join(", "),
      searchValue: graphNode.caption,
    }))
    .slice(0, limit)
}

function node(
  id: string,
  labels: string[],
  caption: string,
  size: number,
  properties: Record<string, unknown> = {}
) {
  const primaryLabel = labels[0] ?? "Node"

  return {
    id,
    labels,
    caption,
    properties: {
      name: caption,
      ...properties,
    },
    size,
    color: getCategoryColor(primaryLabel),
  }
}

function nodeMatchesSearch(
  graphNode: GraphPayload["nodes"][number],
  search: string
) {
  const searchableValues = [
    graphNode.caption,
    ...graphNode.labels,
    ...Object.values(graphNode.properties).map((value) => String(value)),
  ]

  return searchableValues.some((value) => value.toLowerCase().includes(search))
}

function rel(
  id: string,
  source: string,
  target: string,
  type: string
): GraphRelationshipRecord {
  return {
    id,
    source,
    target,
    type,
    properties: {
      source: "sample",
    },
  }
}
