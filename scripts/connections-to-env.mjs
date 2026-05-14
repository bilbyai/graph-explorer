import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const ENV_KEY = "CONNECTIONS_JSON_BASE64"
const root = process.cwd()
const connectionsPath = resolve(root, "connections.json")
const envPath = resolve(root, ".env")

const rawConnections = await readFile(connectionsPath, "utf8")
const connections = JSON.parse(rawConnections)
const envSafeValue = Buffer.from(JSON.stringify(connections), "utf8").toString(
  "base64"
)

let env = ""

try {
  env = await readFile(envPath, "utf8")
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error
  }
}

const nextLine = `${ENV_KEY}=${envSafeValue}`
const existingLine = new RegExp(`^${ENV_KEY}=.*$`, "m")
const nextEnv = existingLine.test(env)
  ? env.replace(existingLine, nextLine)
  : `${env}${env && !env.endsWith("\n") ? "\n" : ""}${nextLine}\n`

await writeFile(envPath, nextEnv)

console.log(`Wrote ${ENV_KEY} to .env`)
