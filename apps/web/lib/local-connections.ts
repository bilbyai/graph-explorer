"use client"

export type LocalConnection = {
  id: string
  source: "local"
  name: string
  connectionUrl: string
  username: string
  host: string
  scheme: string
  encryptedPassword: {
    iv: string
    ciphertext: string
  }
  createdAt: number
}

export type LocalConnectionInput = {
  name: string
  connectionUrl: string
  username: string
  password: string
}

const dbName = "graph-explorer"
const dbVersion = 1
const connectionStore = "connections"
const keyStore = "keys"
const keyId = "local-password-key"

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(connectionStore)) {
        db.createObjectStore(connectionStore, { keyPath: "id" })
      }

      if (!db.objectStoreNames.contains(keyStore)) {
        db.createObjectStore(keyStore, { keyPath: "id" })
      }
    }

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transact<T>(
  db: IDBDatabase,
  storeName: string,
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

async function getOrCreateKey(db: IDBDatabase) {
  const storedKey = await transact<CryptoKey | undefined>(
    db,
    keyStore,
    "readonly",
    (store) => store.get(keyId)
  )

  if (storedKey) {
    return storedKey
  }

  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  )

  await transact<IDBValidKey>(db, keyStore, "readwrite", (store) =>
    store.put({ id: keyId, key })
  )

  return key
}

async function encryptPassword(db: IDBDatabase, password: string) {
  const key = await getOrCreateKey(db)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    new TextEncoder().encode(password)
  )

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptLocalPassword(connection: LocalConnection) {
  const db = await openDb()
  const key = await getOrCreateKey(db)
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(connection.encryptedPassword.iv),
    },
    key,
    base64ToBytes(connection.encryptedPassword.ciphertext)
  )

  return new TextDecoder().decode(decrypted)
}

export async function listLocalConnections() {
  const db = await openDb()

  return transact<LocalConnection[]>(
    db,
    connectionStore,
    "readonly",
    (store) => store.getAll()
  )
}

export async function saveLocalConnection(input: LocalConnectionInput) {
  const db = await openDb()
  const url = new URL(input.connectionUrl)
  const connection: LocalConnection = {
    id: crypto.randomUUID(),
    source: "local",
    name: input.name,
    connectionUrl: input.connectionUrl,
    username: input.username,
    host: url.host,
    scheme: url.protocol.replace(":", ""),
    encryptedPassword: await encryptPassword(db, input.password),
    createdAt: Date.now(),
  }

  await transact<IDBValidKey>(db, connectionStore, "readwrite", (store) =>
    store.put(connection)
  )

  return connection
}

export async function deleteLocalConnection(id: string) {
  const db = await openDb()

  await transact<undefined>(db, connectionStore, "readwrite", (store) =>
    store.delete(id)
  )
}
