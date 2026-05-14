"use client"

import type { QueryResultPayload } from "@/lib/graph-types"

export type QueryHistoryEntry = {
  id: string
  connectionName: string
  query: string
  params: Record<string, unknown>
  createdAt: number
  snapshotStatus: "stored" | "omitted"
  snapshot?: QueryResultPayload
}

const dbName = "graph-explorer-query-history"
const dbVersion = 1
const storeName = "entries"
const maxEntries = 100
const maxSnapshotBytes = 1024 * 1024
const maxTotalSnapshotBytes = 25 * 1024 * 1024

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" })
      }
    }

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transact<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = action(store)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function getByteSize(value: unknown) {
  return new Blob([JSON.stringify(value)]).size
}

export async function listQueryHistory() {
  const db = await openDb()
  const entries = await transact<QueryHistoryEntry[]>(db, "readonly", (store) =>
    store.getAll()
  )

  return entries.sort((a, b) => b.createdAt - a.createdAt)
}

export async function addQueryHistoryEntry(
  entry: Omit<QueryHistoryEntry, "id" | "createdAt" | "snapshotStatus">
) {
  const db = await openDb()
  const snapshotSize = getByteSize(entry.snapshot)
  const nextEntry: QueryHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    snapshotStatus: snapshotSize <= maxSnapshotBytes ? "stored" : "omitted",
    snapshot: snapshotSize <= maxSnapshotBytes ? entry.snapshot : undefined,
  }

  await transact<IDBValidKey>(db, "readwrite", (store) => store.put(nextEntry))
  await trimHistory()

  return nextEntry
}

async function trimHistory() {
  const db = await openDb()
  const entries = await listQueryHistory()
  let totalSnapshotBytes = 0

  for (const [index, entry] of entries.entries()) {
    const snapshotSize = entry.snapshot ? getByteSize(entry.snapshot) : 0
    totalSnapshotBytes += snapshotSize

    if (index >= maxEntries || totalSnapshotBytes > maxTotalSnapshotBytes) {
      await transact<undefined>(db, "readwrite", (store) =>
        store.delete(entry.id)
      )
    }
  }
}
