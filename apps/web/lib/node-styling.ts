import type { GraphNodeRecord, GraphPayload } from "@/lib/graph-types"

export type NodeTextRow = {
  key: string
  showOnNode: boolean
  showOnHover: boolean
}

export type LabelStyle = {
  color?: string
  sizeMultiplier?: number
  textSize?: number
  text: NodeTextRow[]
  icon?: string
}

export type StyleRuleMode = "single" | "range" | "unique"

export type PropertyType =
  | "string"
  | "number"
  | "boolean"
  | "bigint"
  | "unknown"

export type StyleRangeStop = {
  value: number
  color: string
}

export type StyleRule = {
  id: string
  property: string
  propertyType: PropertyType
  mode: StyleRuleMode
  target: "color" | "size"
  enabled: boolean
  single?: {
    operator: "eq" | "gt" | "lt" | "gte" | "lte"
    value: string
    color: string
    size?: number
  }
  range?: {
    min: number
    mid?: number
    max: number
    minColor: string
    midColor?: string
    maxColor: string
    minSize?: number
    maxSize?: number
  }
  unique?: Array<{ value: string; color: string; size?: number }>
}

export type RelationshipStyle = {
  color?: string
  sizeMultiplier?: number
  textSize?: number
  textAlign?: "above" | "below"
  showLabel?: boolean
  showLabelOnHover?: boolean
}

export const DEFAULT_RELATIONSHIP_COLOR = "#8f97a3"

export type StylingState = {
  labelStyles: Record<string, LabelStyle>
  relationshipStyles: Record<string, RelationshipStyle>
  rules: StyleRule[]
}

export const emptyStyling: StylingState = {
  labelStyles: {},
  relationshipStyles: {},
  rules: [],
}

export function getRelationshipColor(
  type: string,
  styling: StylingState
): string {
  return styling.relationshipStyles[type]?.color ?? DEFAULT_RELATIONSHIP_COLOR
}

export type StyledNode = {
  id: string
  caption: string
  hoverText: string
  color: string
  size: number
  icon?: string
}

export function getLabelProperties(
  label: string,
  graph: GraphPayload
): string[] {
  const keys = new Set<string>()
  for (const node of graph.nodes) {
    if (node.labels.includes(label)) {
      for (const key of Object.keys(node.properties)) {
        keys.add(key)
      }
    }
  }
  return Array.from(keys).sort()
}

export function detectPropertyType(
  property: string,
  graph: GraphPayload
): PropertyType {
  for (const node of graph.nodes) {
    if (property in node.properties) {
      const value = node.properties[property]
      if (typeof value === "number") return "number"
      if (typeof value === "boolean") return "boolean"
      if (typeof value === "string") return "string"
      if (typeof value === "bigint") return "bigint"
    }
  }
  return "unknown"
}

export function getPropertyRange(
  property: string,
  graph: GraphPayload
): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let found = false
  for (const node of graph.nodes) {
    const raw = node.properties[property]
    const num =
      typeof raw === "number"
        ? raw
        : typeof raw === "bigint"
          ? Number(raw)
          : typeof raw === "string" &&
              raw.trim() !== "" &&
              !Number.isNaN(Number(raw))
            ? Number(raw)
            : null
    if (num === null) continue
    if (num < min) min = num
    if (num > max) max = num
    found = true
  }
  if (!found) return null
  return { min, max }
}

export function getUniqueValues(
  property: string,
  graph: GraphPayload,
  limit = 50
): string[] {
  const set = new Set<string>()
  for (const node of graph.nodes) {
    const raw = node.properties[property]
    if (raw === undefined || raw === null) continue
    set.add(String(raw))
    if (set.size >= limit) break
  }
  return Array.from(set)
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return value
  if (typeof value === "bigint") return Number(value)
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value)
  }
  return null
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "")
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number) {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`
}

export function mixColors(a: string, b: string, t: number) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex(lerp(ca.r, cb.r, t), lerp(ca.g, cb.g, t), lerp(ca.b, cb.b, t))
}

function rangeColor(rule: StyleRule, num: number): string | null {
  const range = rule.range
  if (!range) return null
  if (num <= range.min) return range.minColor
  if (num >= range.max) return range.maxColor
  if (range.mid !== undefined && range.midColor) {
    if (num <= range.mid) {
      const t = (num - range.min) / (range.mid - range.min || 1)
      return mixColors(range.minColor, range.midColor, t)
    }
    const t = (num - range.mid) / (range.max - range.mid || 1)
    return mixColors(range.midColor, range.maxColor, t)
  }
  const t = (num - range.min) / (range.max - range.min || 1)
  return mixColors(range.minColor, range.maxColor, t)
}

function rangeSize(rule: StyleRule, num: number): number | null {
  const range = rule.range
  if (!range || range.minSize === undefined || range.maxSize === undefined) {
    return null
  }
  if (num <= range.min) return range.minSize
  if (num >= range.max) return range.maxSize
  const t = (num - range.min) / (range.max - range.min || 1)
  return lerp(range.minSize, range.maxSize, t)
}

function matchesSingle(rule: StyleRule, value: unknown): boolean {
  const single = rule.single
  if (!single) return false
  const valueStr = String(value)
  const num = readNumber(value)
  const targetNum = readNumber(single.value)
  switch (single.operator) {
    case "eq":
      return valueStr === single.value
    case "gt":
      return num !== null && targetNum !== null && num > targetNum
    case "lt":
      return num !== null && targetNum !== null && num < targetNum
    case "gte":
      return num !== null && targetNum !== null && num >= targetNum
    case "lte":
      return num !== null && targetNum !== null && num <= targetNum
  }
}

function applyRule(
  rule: StyleRule,
  node: GraphNodeRecord,
  current: { color: string; size: number }
): { color: string; size: number } {
  if (!rule.enabled) return current
  const raw = node.properties[rule.property]
  if (raw === undefined) return current

  if (rule.mode === "single") {
    if (!matchesSingle(rule, raw)) return current
    if (rule.target === "color" && rule.single?.color) {
      return { ...current, color: rule.single.color }
    }
    if (rule.target === "size" && rule.single?.size) {
      return { ...current, size: rule.single.size }
    }
    return current
  }

  if (rule.mode === "range") {
    const num = readNumber(raw)
    if (num === null) return current
    if (rule.target === "color") {
      const next = rangeColor(rule, num)
      if (next) return { ...current, color: next }
    }
    if (rule.target === "size") {
      const next = rangeSize(rule, num)
      if (next !== null) return { ...current, size: next }
    }
    return current
  }

  if (rule.mode === "unique") {
    const valueStr = String(raw)
    const match = rule.unique?.find((entry) => entry.value === valueStr)
    if (!match) return current
    if (rule.target === "color") return { ...current, color: match.color }
    if (rule.target === "size" && match.size)
      return { ...current, size: match.size }
  }

  return current
}

function buildCaption(
  node: GraphNodeRecord,
  rows: NodeTextRow[],
  predicate: (row: NodeTextRow) => boolean
): string {
  const parts: string[] = []
  for (const row of rows) {
    if (!predicate(row)) continue
    const value = node.properties[row.key]
    if (value === undefined || value === null) continue
    parts.push(String(value))
  }
  return parts.join(" · ")
}

export function styleNode(
  node: GraphNodeRecord,
  styling: StylingState
): StyledNode {
  const primaryLabel = node.labels[0] ?? "Node"
  const labelStyle = styling.labelStyles[primaryLabel]
  const baseColor = labelStyle?.color ?? node.color
  const baseSize = node.size * (labelStyle?.sizeMultiplier ?? 1)

  let merged = { color: baseColor, size: baseSize }
  for (const rule of styling.rules) {
    merged = applyRule(rule, node, merged)
  }

  let caption = node.caption
  let hoverText = ""
  if (labelStyle?.text?.some((row) => row.showOnNode)) {
    caption =
      buildCaption(node, labelStyle.text, (row) => row.showOnNode) ||
      node.caption
  }
  if (labelStyle?.text) {
    hoverText = buildCaption(node, labelStyle.text, (row) => row.showOnHover)
  }

  return {
    id: node.id,
    caption,
    hoverText,
    color: merged.color,
    size: merged.size,
    icon: labelStyle?.icon,
  }
}

export function styleNodes(
  graph: GraphPayload,
  styling: StylingState
): Map<string, StyledNode> {
  const map = new Map<string, StyledNode>()
  for (const node of graph.nodes) {
    map.set(node.id, styleNode(node, styling))
  }
  return map
}
