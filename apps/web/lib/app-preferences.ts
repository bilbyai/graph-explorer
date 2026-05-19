"use client"

type AppPreferences = {
  selectedConnectionId: string | null
}

const storageKey = "graph-explorer:preferences:v1"

const defaultPreferences: AppPreferences = {
  selectedConnectionId: null,
}

function isAppPreferences(value: unknown): value is AppPreferences {
  return (
    typeof value === "object" &&
    value !== null &&
    (typeof (value as AppPreferences).selectedConnectionId === "string" ||
      (value as AppPreferences).selectedConnectionId === null)
  )
}

export function readAppPreferences(): AppPreferences {
  try {
    const storedValue = localStorage.getItem(storageKey)

    if (!storedValue) {
      return defaultPreferences
    }

    const parsedValue = JSON.parse(storedValue)

    return isAppPreferences(parsedValue) ? parsedValue : defaultPreferences
  } catch {
    return defaultPreferences
  }
}

export function updateAppPreferences(
  updater: (preferences: AppPreferences) => AppPreferences
) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(updater(readAppPreferences()))
    )
  } catch {
    return
  }
}
