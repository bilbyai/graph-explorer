import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const connectionsPath = resolve(
  process.cwd(),
  process.argv[2] ?? "connections.json"
)
const rawConnections = await readFile(connectionsPath, "utf8")
const connections = JSON.parse(rawConnections)

process.stdout.write(
  Buffer.from(JSON.stringify(connections), "utf8").toString("base64")
)
