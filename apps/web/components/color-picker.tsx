"use client"

import * as React from "react"

const PRESET_COLORS = [
  "#ffec8a",
  "#d866d8",
  "#ff9966",
  "#3a8fd1",
  "#e76b6b",
  "#b7b790",
  "#7fb276",
  "#f4b0d1",
  "#5d8df0",
  "#d6af00",
  "#c1577a",
  "#3f7872",
  "#9aa1ab",
  "#dfe2e8",
]

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const cleaned = hex.replace("#", "")
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned.padEnd(6, "0")
  const r = Number.parseInt(full.slice(0, 2), 16) / 255
  const g = Number.parseInt(full.slice(2, 4), 16) / 255
  const b = Number.parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  const v = max
  return { h, s, v }
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const hh = h / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0]
  else if (hh < 2) [r, g, b] = [x, c, 0]
  else if (hh < 3) [r, g, b] = [0, c, x]
  else if (hh < 4) [r, g, b] = [0, x, c]
  else if (hh < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = v - c
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${to(r)}${to(g)}${to(b)}`
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (hex: string) => void
}) {
  const hsv = React.useMemo(() => hexToHsv(value), [value])
  const svRef = React.useRef<HTMLDivElement>(null)
  const hueRef = React.useRef<HTMLDivElement>(null)

  const handleSvPointer = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
      const node = svRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const clientX = "clientX" in event ? event.clientX : 0
      const clientY = "clientY" in event ? event.clientY : 0
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
      onChange(hsvToHex(hsv.h, s, v))
    },
    [hsv.h, onChange]
  )

  const handleHuePointer = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
      const node = hueRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const clientX = "clientX" in event ? event.clientX : 0
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onChange(hsvToHex(t * 360, hsv.s, Math.max(hsv.v, 0.01)))
    },
    [hsv.s, hsv.v, onChange]
  )

  const startDrag =
    (moveHandler: (event: PointerEvent) => void) =>
    (event: React.PointerEvent<HTMLDivElement>) => {
      moveHandler(event.nativeEvent)
      const onMove = (e: PointerEvent) => moveHandler(e)
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    }

  const hueColor = hsvToHex(hsv.h, 1, 1)

  return (
    <div className="space-y-3">
      <div
        ref={svRef}
        className="relative h-44 w-full cursor-crosshair rounded-md"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
        }}
        onPointerDown={startDrag(handleSvPointer)}
      >
        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="size-6 rounded-full border border-border"
            style={{ backgroundColor: preset }}
            onClick={() => onChange(preset)}
            aria-label={`Use ${preset}`}
          />
        ))}
      </div>

      <div
        ref={hueRef}
        className="relative h-3 w-full cursor-pointer rounded-full"
        style={{
          background:
            "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
        onPointerDown={startDrag(handleHuePointer)}
      >
        <div
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          Hex
        </div>
        <input
          type="text"
          className="h-8 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm uppercase outline-none focus:border-primary"
          value={value.replace("#", "#")}
          onChange={(event) => {
            const next = event.target.value.trim()
            if (/^#?[0-9a-fA-F]{0,6}$/.test(next)) {
              const withHash = next.startsWith("#") ? next : `#${next}`
              if (withHash.length === 7) onChange(withHash.toLowerCase())
            }
          }}
        />
      </div>
    </div>
  )
}
