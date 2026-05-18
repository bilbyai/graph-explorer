export const NODE_CAPTION_KEYS = [
  "nameEn",
  "name",
  "Name",
  "nameZh",
  "nameAr",
  "Name (Arabic)",
  "title",
  "label",
  "_aid",
  "id",
] as const

export function resolveNodeCaption(
  properties: Record<string, unknown>,
  fallback: string
) {
  for (const key of NODE_CAPTION_KEYS) {
    const value = properties[key]

    if (typeof value === "string" && value.trim() !== "") {
      return value
    }

    if (typeof value === "number" || typeof value === "bigint") {
      return String(value)
    }
  }

  return fallback
}
