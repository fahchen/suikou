import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import { connect as netConnect } from "node:net"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { file, spawn, write } from "bun"

// The `suikou` mix release (ERTS + app), tar.gz'd at package time. Bun embeds the
// bytes into the compiled binary and rewrites this import to a `$bunfs/...` path
// whose basename carries a content hash — we reuse that hash as the cache key.
import serverTarball from "./embed/server.tar.gz" with { type: "file" }

const APP_NAME = "Suikou"
// Fixed high base port (registered range, away from common dev ports and the
// OS ephemeral range). Probe upward on collision so concurrent instances each
// land on a stable, predictable port.
const BASE_PORT = 47100
const PORT_PROBE_LIMIT = 16

const base = join(homedir(), "Library", "Application Support", APP_NAME)

const releaseRoot = await ensureExtracted()
const bin = join(releaseRoot, "suikou", "bin", "suikou")
const port = await pickPort()

const proc = spawn([bin, "start"], {
  // Inherit the terminal: this process *is* the server, so its logs go straight
  // to the user's console.
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    PHX_SERVER: "true",
    PHX_HOST: "localhost",
    PORT: String(port),
    DATABASE_PATH: join(base, "suikou.db"),
    SECRET_KEY_BASE: await ensureSecret()
  }
})

// SIGTERM lets the release drain gracefully (it traps it). Forward both signals,
// then exit once the child does.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => proc.kill())
}

const url = `http://localhost:${port}`
waitForReady(port).then((ready) => {
  if (ready) spawn(["open", url])
  else console.error(`server did not become ready at ${url}`)
})

process.exit(await proc.exited)

// Extract the release into ~/Library/Application Support/Suikou/runtime/<hash>/
// exactly once. The hash in the embedded filename changes every build, so a new
// binary extracts fresh while the persisted DB and secret (kept at the base dir)
// survive across versions.
async function ensureExtracted(): Promise<string> {
  // bun inserts a content hash before the final extension (server.tar-<hash>.gz),
  // so the whole basename is build-unique; sanitize it into a tidy dir name.
  const key = basename(serverTarball).replace(/[^a-zA-Z0-9]+/g, "-")
  const dest = join(base, "runtime", key)

  if (await file(join(dest, "suikou", "bin", "suikou")).exists()) return dest

  await mkdir(dest, { recursive: true })
  const tmp = await mkdtemp(join(base, "runtime", ".extract-"))
  try {
    const tarPath = join(tmp, "server.tar.gz")
    await write(tarPath, file(serverTarball))
    const tar = spawn(["tar", "-xzf", tarPath, "-C", tmp])
    if ((await tar.exited) !== 0) throw new Error("failed to extract embedded release")
    // tar archive root is `suikou/`; promote it into the versioned cache dir.
    await rename(join(tmp, "suikou"), join(dest, "suikou"))
    return dest
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

// Read the persisted secret_key_base, generating one on first run. Phoenix
// requires at least 64 bytes; 64 random bytes hex-encoded is 128 chars.
async function ensureSecret(): Promise<string> {
  const path = join(base, "secret_key_base")
  const f = file(path)
  if (await f.exists()) return (await f.text()).trim()

  const secret = randomBytes(64).toString("hex")
  await write(path, secret)
  return secret
}

// Honor an explicit PORT; otherwise probe BASE_PORT upward until one is free,
// failing loudly rather than drifting to an unpredictable port.
async function pickPort(): Promise<number> {
  const explicit = process.env.PORT
  if (explicit) return Number.parseInt(explicit, 10)

  for (let p = BASE_PORT; p < BASE_PORT + PORT_PROBE_LIMIT; p++) {
    if (!(await tcpUp(p))) return p
  }

  const last = BASE_PORT + PORT_PROBE_LIMIT - 1
  throw new Error(`no free port in ${BASE_PORT}-${last}; set PORT to override`)
}

async function waitForReady(p: number, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await tcpUp(p)) return true
    await Bun.sleep(150)
  }
  return false
}

function tcpUp(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = netConnect({ port, host })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}
