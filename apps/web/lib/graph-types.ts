export type GraphNodeRecord = {
  id: string
  labels: string[]
  caption: string
  properties: Record<string, unknown>
  size: number
  color: string
}

export type GraphRelationshipRecord = {
  id: string
  type: string
  source: string
  target: string
  properties: Record<string, unknown>
}

export type GraphPayload = {
  nodes: GraphNodeRecord[]
  relationships: GraphRelationshipRecord[]
}

export type GraphSearchSuggestion = {
  id: string
  caption: string
  labels: string[]
  detail: string
  searchValue: string
}

export type QueryResultPayload = {
  columns: string[]
  rows: Record<string, unknown>[]
  graph: GraphPayload
  summary: {
    resultAvailableAfter?: number
    resultConsumedAfter?: number
    records: number
  }
}

export type SchemaPayload = {
  labels: Array<{
    name: string
    count: number
    color: string
  }>
  relationshipTypes: Array<{
    name: string
    count: number
  }>
  propertyKeys: string[]
}
