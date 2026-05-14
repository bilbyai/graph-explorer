"use client"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { Switch } from "@workspace/ui/components/switch"
import {
  ChevronDown,
  ChevronRight,
  Info,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import * as React from "react"

import { ColorPicker } from "@/components/color-picker"
import type { GraphPayload, SchemaPayload } from "@/lib/graph-types"
import {
  detectPropertyType,
  emptyStyling,
  getLabelProperties,
  getPropertyRange,
  getUniqueValues,
  type LabelStyle,
  mixColors,
  type NodeTextRow,
  type StyleRule,
  type StylingState,
} from "@/lib/node-styling"
import { iconSvgString, STYLE_ICON_OPTIONS } from "@/lib/style-icons"

const SIZE_PRESETS = [
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
]

type StylingPanelProps = {
  styling: StylingState
  schema: SchemaPayload
  graph: GraphPayload
  onChange: (next: StylingState) => void
}

export function StylingPanel({
  styling,
  schema,
  graph,
  onChange,
}: StylingPanelProps) {
  const [mode, setMode] = React.useState<"default" | "rule">("default")
  const labels = schema.labels.map((l) => l.name)
  const [selectedLabel, setSelectedLabel] = React.useState<string>(
    labels[0] ?? ""
  )

  React.useEffect(() => {
    if (!selectedLabel && labels.length > 0) {
      setSelectedLabel(labels[0] ?? "")
    }
  }, [labels, selectedLabel])

  const labelStyle: LabelStyle = styling.labelStyles[selectedLabel] ?? {
    text: [],
  }
  const baseColor =
    schema.labels.find((l) => l.name === selectedLabel)?.color ?? "#8acfd2"

  const updateLabelStyle = (next: Partial<LabelStyle>) => {
    onChange({
      ...styling,
      labelStyles: {
        ...styling.labelStyles,
        [selectedLabel]: { ...labelStyle, ...next },
      },
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-4 border-b border-border pb-2">
        <ModeTab
          active={mode === "default"}
          onClick={() => setMode("default")}
          label="Default"
        />
        <ModeTab
          active={mode === "rule"}
          onClick={() => setMode("rule")}
          label="Rule-based"
          icon={<Info className="size-3" />}
        />
      </div>

      {mode === "default" ? (
        <DefaultMode
          labels={labels}
          selectedLabel={selectedLabel}
          onSelectLabel={setSelectedLabel}
          labelStyle={labelStyle}
          baseColor={baseColor}
          graph={graph}
          onChange={updateLabelStyle}
        />
      ) : (
        <RuleMode
          rules={styling.rules}
          graph={graph}
          onChange={(rules) => onChange({ ...styling, rules })}
        />
      )}

      {(Object.keys(styling.labelStyles).length > 0 ||
        styling.rules.length > 0) && (
        <Button
          className="h-7 w-full rounded-md border border-border text-xs text-muted-foreground hover:bg-accent"
          onClick={() => onChange(emptyStyling)}
          type="button"
          variant="outline"
        >
          Reset all styling
        </Button>
      )}
    </div>
  )
}

export function LabelStylingEditor({
  label,
  labelStyle,
  baseColor,
  graph,
  onChange,
}: {
  label: string
  labelStyle: LabelStyle
  baseColor: string
  graph: GraphPayload
  onChange: (next: Partial<LabelStyle>) => void
}) {
  const [subTab, setSubTab] = React.useState<
    "color" | "size" | "text" | "icon"
  >("color")

  return (
    <div className="space-y-3">
      <div className="flex gap-3 border-b border-border">
        {(["color", "size", "text", "icon"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSubTab(tab)}
            className={`pb-1.5 text-sm capitalize transition-colors ${
              subTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {subTab === "color" && (
        <ColorPicker
          value={labelStyle.color ?? baseColor}
          onChange={(hex) => onChange({ color: hex })}
        />
      )}

      {subTab === "size" && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Size</div>
          <NativeSelect
            value={String(labelStyle.sizeMultiplier ?? 1)}
            onChange={(event) =>
              onChange({ sizeMultiplier: Number(event.target.value) })
            }
          >
            {SIZE_PRESETS.map((preset) => (
              <NativeSelectOption
                key={preset.value}
                value={String(preset.value)}
              >
                {preset.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}

      {subTab === "text" && (
        <TextEditor
          label={label}
          labelStyle={labelStyle}
          graph={graph}
          onChange={onChange}
        />
      )}

      {subTab === "icon" && (
        <IconPicker
          value={labelStyle.icon}
          onChange={(icon) => onChange({ icon })}
        />
      )}
    </div>
  )
}

export function RuleStylingPanel({
  styling,
  graph,
  onChange,
  framed = true,
}: {
  styling: StylingState
  graph: GraphPayload
  onChange: (next: StylingState) => void
  framed?: boolean
}) {
  const content = (
    <>
      <RuleMode
        rules={styling.rules}
        graph={graph}
        onChange={(rules) => onChange({ ...styling, rules })}
      />
      {styling.rules.length > 0 && (
        <Button
          className="h-7 w-full rounded-md border border-border text-xs text-muted-foreground hover:bg-accent"
          onClick={() => onChange({ ...styling, rules: [] })}
          type="button"
          variant="outline"
        >
          Reset rule styling
        </Button>
      )}
    </>
  )

  if (!framed) {
    return <div className="space-y-3">{content}</div>
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      {content}
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 border-b-2 pb-1 text-sm transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {icon}
    </button>
  )
}

function DefaultMode({
  labels,
  selectedLabel,
  onSelectLabel,
  labelStyle,
  baseColor,
  graph,
  onChange,
}: {
  labels: string[]
  selectedLabel: string
  onSelectLabel: (label: string) => void
  labelStyle: LabelStyle
  baseColor: string
  graph: GraphPayload
  onChange: (next: Partial<LabelStyle>) => void
}) {
  if (labels.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        No node categories available yet.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Editing category</div>
        <NativeSelect
          value={selectedLabel}
          onChange={(event) => onSelectLabel(event.target.value)}
        >
          {labels.map((label) => (
            <NativeSelectOption key={label} value={label}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <LabelStylingEditor
        label={selectedLabel}
        labelStyle={labelStyle}
        baseColor={baseColor}
        graph={graph}
        onChange={onChange}
      />
    </div>
  )
}

function TextEditor({
  label,
  labelStyle,
  graph,
  onChange,
}: {
  label: string
  labelStyle: LabelStyle
  graph: GraphPayload
  onChange: (next: Partial<LabelStyle>) => void
}) {
  const properties = React.useMemo(
    () => getLabelProperties(label, graph),
    [label, graph]
  )

  const rows = React.useMemo<NodeTextRow[]>(() => {
    const existing = new Map(labelStyle.text.map((row) => [row.key, row]))
    return properties.map(
      (key) =>
        existing.get(key) ?? {
          key,
          showOnNode: false,
          showOnHover: false,
        }
    )
  }, [properties, labelStyle.text])

  const updateRow = (key: string, update: Partial<NodeTextRow>) => {
    const next = rows.map((row) =>
      row.key === key ? { ...row, ...update } : row
    )
    onChange({ text: next })
  }

  if (properties.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        No properties found for nodes in this category yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Toggle which properties appear on the node or on hover. When none are
        selected the node caption is used.
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="space-y-2 rounded-md border border-border bg-card p-3"
          >
            <div className="inline-flex items-center gap-2 rounded-md bg-muted px-2 py-1 font-mono text-xs">
              {row.key}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                aria-label={`Show ${row.key} on node`}
                checked={row.showOnNode}
                onCheckedChange={(checked) =>
                  updateRow(row.key, { showOnNode: checked === true })
                }
              />
              <span>Show on node</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                aria-label={`Show ${row.key} on hover`}
                checked={row.showOnHover}
                onCheckedChange={(checked) =>
                  updateRow(row.key, { showOnHover: checked === true })
                }
              />
              <span>Show on hover</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IconPicker({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (icon: string | undefined) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Pick a symbol drawn on top of nodes in this category.
      </div>
      <div className="grid grid-cols-5 gap-2">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`flex h-10 items-center justify-center rounded-md border text-[10px] uppercase tracking-wide ${
            value === undefined
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          None
        </button>
        {STYLE_ICON_OPTIONS.map((name) => {
          const svg = iconSvgString(name, "currentColor")
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              title={name}
              className={`flex h-10 items-center justify-center rounded-md border ${
                value === name
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: inline lucide SVGs from a controlled allow-list
              dangerouslySetInnerHTML={{
                __html: svg
                  ? svg.replace("<svg ", '<svg style="width:18px;height:18px" ')
                  : "",
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function RuleMode({
  rules,
  graph,
  onChange,
}: {
  rules: StyleRule[]
  graph: GraphPayload
  onChange: (rules: StyleRule[]) => void
}) {
  const allProperties = React.useMemo(() => {
    const set = new Set<string>()
    for (const node of graph.nodes) {
      for (const key of Object.keys(node.properties)) set.add(key)
    }
    return Array.from(set).sort()
  }, [graph])

  const addRule = () => {
    const property = allProperties[0] ?? ""
    const type = property ? detectPropertyType(property, graph) : "unknown"
    const id = `rule-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`
    onChange([
      ...rules,
      {
        id,
        property,
        propertyType: type,
        mode: type === "number" || type === "bigint" ? "range" : "unique",
        target: "color",
        enabled: true,
      },
    ])
  }

  return (
    <div className="space-y-3">
      <Button
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 py-2 text-sm text-primary hover:bg-primary/10"
        onClick={addRule}
        type="button"
        variant="outline"
      >
        <Plus className="size-3.5" />
        Add rule-based styling
      </Button>

      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          Rules use property values to override the default color or size on a
          per-node basis.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              properties={allProperties}
              graph={graph}
              onChange={(next) =>
                onChange(rules.map((r) => (r.id === rule.id ? next : r)))
              }
              onDelete={() => onChange(rules.filter((r) => r.id !== rule.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RuleCard({
  rule,
  properties,
  graph,
  onChange,
  onDelete,
}: {
  rule: StyleRule
  properties: string[]
  graph: GraphPayload
  onChange: (next: StyleRule) => void
  onDelete: () => void
}) {
  const [open, setOpen] = React.useState(true)

  const setProperty = (property: string) => {
    const propertyType = detectPropertyType(property, graph)
    const next: StyleRule = {
      ...rule,
      property,
      propertyType,
    }
    if (
      next.mode === "range" &&
      propertyType !== "number" &&
      propertyType !== "bigint"
    ) {
      next.mode = "unique"
    }
    onChange(next)
  }

  const refreshRange = () => {
    const range = getPropertyRange(rule.property, graph)
    if (!range) return
    onChange({
      ...rule,
      range: {
        min: range.min,
        max: range.max,
        mid: rule.range?.mid,
        minColor: rule.range?.minColor ?? "#e8f7fb",
        midColor: rule.range?.midColor,
        maxColor: rule.range?.maxColor ?? "#3f7872",
        minSize: rule.range?.minSize,
        maxSize: rule.range?.maxSize,
      },
    })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialize range only on mode change
  React.useEffect(() => {
    if (rule.mode === "range" && !rule.range) {
      refreshRange()
    }
  }, [rule.mode])

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          {rule.property || "Untitled rule"}
        </button>
        <Button
          className="inline-flex size-7 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          type="button"
          variant="outline"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Property</span>
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
                {rule.propertyType}
              </span>
              <NativeSelect
                aria-label="Rule property"
                className="flex-1"
                value={rule.property}
                onChange={(event) => setProperty(event.target.value)}
              >
                {properties.map((key) => (
                  <NativeSelectOption key={key} value={key}>
                    {key}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>

          <RadioGroup
            className="flex gap-4"
            value={rule.mode}
            onValueChange={(value) =>
              onChange({ ...rule, mode: value as StyleRule["mode"] })
            }
          >
            <div className="flex items-center gap-2 text-sm">
              <RadioGroupItem aria-label="Single" value="single" />
              <span>Single</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <RadioGroupItem aria-label="Range" value="range" />
              <span>Range</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <RadioGroupItem aria-label="Unique values" value="unique" />
              <span>Unique values</span>
            </div>
          </RadioGroup>

          <div className="flex gap-3 border-b border-border">
            {(["color", "size"] as const).map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => onChange({ ...rule, target })}
                className={`pb-1.5 text-sm capitalize transition-colors ${
                  rule.target === target
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {target}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Switch
                aria-label={`Apply ${rule.target}`}
                checked={rule.enabled}
                onCheckedChange={(checked) =>
                  onChange({ ...rule, enabled: checked === true })
                }
              />
              <span>Apply {rule.target}</span>
            </div>
            {rule.mode === "range" && (
              <Button
                className="inline-flex h-7 items-center gap-2 rounded-md border border-border px-2 text-xs hover:bg-accent"
                onClick={refreshRange}
                type="button"
                variant="outline"
              >
                <RefreshCw className="size-3" />
                Refresh range
              </Button>
            )}
          </div>

          {rule.mode === "range" && rule.range && (
            <RangeEditor rule={rule} onChange={onChange} />
          )}

          {rule.mode === "single" && (
            <SingleEditor rule={rule} onChange={onChange} />
          )}

          {rule.mode === "unique" && (
            <UniqueEditor rule={rule} graph={graph} onChange={onChange} />
          )}
        </div>
      )}
    </div>
  )
}

function RangeEditor({
  rule,
  onChange,
}: {
  rule: StyleRule
  onChange: (next: StyleRule) => void
}) {
  const [editing, setEditing] = React.useState<"min" | "mid" | "max" | null>(
    null
  )
  const range = rule.range
  if (!range) return null

  const updateRange = (update: Partial<NonNullable<StyleRule["range"]>>) => {
    onChange({ ...rule, range: { ...range, ...update } })
  }

  const enableMid = range.mid !== undefined

  if (rule.target === "size") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Min value"
            value={range.min}
            onChange={(value) => updateRange({ min: value })}
          />
          <NumberField
            label="Max value"
            value={range.max}
            onChange={(value) => updateRange({ max: value })}
          />
          <NumberField
            label="Min size"
            value={range.minSize ?? 6}
            onChange={(value) => updateRange({ minSize: value })}
          />
          <NumberField
            label="Max size"
            value={range.maxSize ?? 24}
            onChange={(value) => updateRange({ maxSize: value })}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Minpoint</div>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 flex-1"
                type="number"
                value={range.min}
                onChange={(event) =>
                  updateRange({ min: Number(event.target.value) })
                }
              />
              <button
                type="button"
                aria-label="Edit min color"
                onClick={() => setEditing(editing === "min" ? null : "min")}
                className="size-9 rounded border border-border"
                style={{ backgroundColor: range.minColor }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Midpoint</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Checkbox
                  aria-label="Enable midpoint"
                  checked={enableMid}
                  onCheckedChange={(checked) =>
                    updateRange(
                      checked
                        ? {
                            mid: (range.min + range.max) / 2,
                            midColor:
                              range.midColor ??
                              mixColors(range.minColor, range.maxColor, 0.5),
                          }
                        : { mid: undefined, midColor: undefined }
                    )
                  }
                />
                <span>Enable</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 flex-1"
                type="number"
                disabled={!enableMid}
                value={range.mid ?? ""}
                onChange={(event) =>
                  updateRange({ mid: Number(event.target.value) })
                }
              />
              <button
                type="button"
                aria-label="Edit mid color"
                onClick={() => setEditing(editing === "mid" ? null : "mid")}
                disabled={!enableMid}
                className="size-9 rounded border border-border disabled:opacity-40"
                style={{ backgroundColor: range.midColor ?? "transparent" }}
              />
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Maxpoint</div>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 flex-1"
                type="number"
                value={range.max}
                onChange={(event) =>
                  updateRange({ max: Number(event.target.value) })
                }
              />
              <button
                type="button"
                aria-label="Edit max color"
                onClick={() => setEditing(editing === "max" ? null : "max")}
                className="size-9 rounded border border-border"
                style={{ backgroundColor: range.maxColor }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Preview</div>
          <div
            className="h-full min-h-32 w-16 rounded-md border border-border"
            style={{
              background: range.midColor
                ? `linear-gradient(to bottom, ${range.maxColor}, ${range.midColor}, ${range.minColor})`
                : `linear-gradient(to bottom, ${range.maxColor}, ${range.minColor})`,
            }}
          />
        </div>
      </div>

      {editing && (
        <div className="rounded-md border border-border bg-background p-3">
          <ColorPicker
            value={
              editing === "min"
                ? range.minColor
                : editing === "mid"
                  ? (range.midColor ?? "#888")
                  : range.maxColor
            }
            onChange={(hex) =>
              updateRange(
                editing === "min"
                  ? { minColor: hex }
                  : editing === "mid"
                    ? { midColor: hex }
                    : { maxColor: hex }
              )
            }
          />
        </div>
      )}
    </div>
  )
}

function SingleEditor({
  rule,
  onChange,
}: {
  rule: StyleRule
  onChange: (next: StyleRule) => void
}) {
  const single = rule.single ?? {
    operator: "eq" as const,
    value: "",
    color: "#3f7872",
    size: 18,
  }
  const update = (next: Partial<NonNullable<StyleRule["single"]>>) => {
    onChange({ ...rule, single: { ...single, ...next } })
  }
  const [editingColor, setEditingColor] = React.useState(false)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <NativeSelect
          value={single.operator}
          onChange={(event) =>
            update({ operator: event.target.value as typeof single.operator })
          }
        >
          <NativeSelectOption value="eq">equals</NativeSelectOption>
          <NativeSelectOption value="gt">greater than</NativeSelectOption>
          <NativeSelectOption value="lt">less than</NativeSelectOption>
          <NativeSelectOption value="gte">≥</NativeSelectOption>
          <NativeSelectOption value="lte">≤</NativeSelectOption>
        </NativeSelect>
        <Input
          className="h-9"
          value={single.value}
          onChange={(event) => update({ value: event.target.value })}
          placeholder="Match value"
        />
      </div>

      {rule.target === "color" ? (
        <div>
          <div className="text-xs text-muted-foreground">Color</div>
          <button
            type="button"
            onClick={() => setEditingColor((value) => !value)}
            className="h-9 w-full rounded-md border border-border"
            style={{ backgroundColor: single.color }}
          />
          {editingColor && (
            <div className="mt-2 rounded-md border border-border bg-background p-3">
              <ColorPicker
                value={single.color}
                onChange={(hex) => update({ color: hex })}
              />
            </div>
          )}
        </div>
      ) : (
        <NumberField
          label="Size"
          value={single.size ?? 18}
          onChange={(value) => update({ size: value })}
        />
      )}
    </div>
  )
}

function UniqueEditor({
  rule,
  graph,
  onChange,
}: {
  rule: StyleRule
  graph: GraphPayload
  onChange: (next: StyleRule) => void
}) {
  const values = React.useMemo(
    () => getUniqueValues(rule.property, graph, 25),
    [rule.property, graph]
  )
  const map = new Map(rule.unique?.map((entry) => [entry.value, entry]))
  const palette = React.useMemo(
    () => [
      "#8acfd2",
      "#ffb8b0",
      "#ffec8a",
      "#d6af00",
      "#d866d8",
      "#b7b790",
      "#62d85a",
      "#7fb276",
      "#a9c4f5",
    ],
    []
  )

  const colorFor = React.useCallback(
    (index: number) => palette[index % palette.length] ?? "#8acfd2",
    [palette]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: seed unique entries only when value list changes
  React.useEffect(() => {
    if (!rule.unique || rule.unique.length === 0) {
      onChange({
        ...rule,
        unique: values.map((value, index) => ({
          value,
          color: colorFor(index),
        })),
      })
    }
  }, [values.length])

  const [editingValue, setEditingValue] = React.useState<string | null>(null)

  const updateEntry = (
    value: string,
    update: Partial<{ color: string; size: number }>
  ) => {
    const next = (rule.unique ?? []).map((entry) =>
      entry.value === value ? { ...entry, ...update } : entry
    )
    onChange({ ...rule, unique: next })
  }

  if (values.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        No values found for this property in the current scene.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {values.map((value, index) => {
        const entry = map.get(value) ?? {
          value,
          color: colorFor(index),
          size: undefined as number | undefined,
        }
        return (
          <div
            key={value}
            className="space-y-2 rounded-md border border-border p-2"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Edit color for ${value}`}
                onClick={() =>
                  setEditingValue(editingValue === value ? null : value)
                }
                className="size-7 rounded border border-border"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate text-xs">{value}</span>
            </div>
            {editingValue === value && rule.target === "color" && (
              <ColorPicker
                value={entry.color}
                onChange={(hex) => updateEntry(value, { color: hex })}
              />
            )}
            {rule.target === "size" && (
              <NumberField
                label="Size"
                value={entry.size ?? 12}
                onChange={(size) => updateEntry(value, { size })}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        aria-label={label}
        type="number"
        className="h-9 w-full"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
