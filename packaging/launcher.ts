import { spawn as spawnDetached } from "node:child_process"
import { openSync } from "node:fs"
import { chmod, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { file, spawn, write } from "bun"

// The `suikou` mix release (ERTS + app), packed at build time by erl_tar. Bun
// embeds the bytes into the compiled binary and rewrites this import to a
// `$bunfs/...` path whose basename carries a content hash — we reuse that hash
// as the cache key.
import serverTarball from "./embed/server.tar.gz" with { type: "file" }

const APP_NAME = "Suikou"
// Fixed high base port (registered range, away from common dev ports and the
// OS ephemeral range). Probe upward on collision so concurrent instances each
// land on a stable, predictable port.
const BASE_PORT = 47100
const PORT_PROBE_LIMIT = 16

const base = join(homedir(), "Library", "Application Support", APP_NAME)
// PID/log files live at the base dir (NOT the versioned runtime dir) so stop and
// status keep working across version upgrades, which swap the runtime hash.
const pidfilePath = join(base, "suikou.pid")
const logPath = join(base, "suikou.log")

type Daemon = { pid: number; port: number }

// Dispatch on the first positional arg. Bare invocation stays a foreground
// server (the original behavior); subcommands add background daemon control.
const command = process.argv[2]
switch (command) {
  case undefined:
    await runServer({ openBrowser: true })
    break
  case "run":
    // Internal: what `start` execs detached. The parent opens the browser, so
    // this child does not.
    await runServer({ openBrowser: false })
    break
  case "start":
    process.exit(await start())
  case "stop":
    process.exit(await stop())
  case "status":
    process.exit(await status())
  default:
    console.error("usage: suikou [start|stop|status|run]")
    process.exit(1)
}

// Foreground server body shared by bare invocation and the detached `run` child:
// extract the release, spawn it inheriting our stdio, forward signals for a
// graceful drain, and exit with the child's code. Never returns.
async function runServer({ openBrowser }: { openBrowser: boolean }): Promise<never> {
  const releaseRoot = await ensureExtracted()
  const bin = join(releaseRoot, "suikou", "bin", "suikou")
  const port = await pickPort()

  const proc = spawn([bin, "start"], {
    // Inherit our stdio. Bare invocation inherits the terminal; the detached
    // `run` child inherits the logfile fds the parent `start` handed it.
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      PHX_SERVER: "true",
      // Pass through PHX_HOST so a Tailscale MagicDNS name / tailnet IP can be set
      // at launch (PHX_HOST=mybox.tailnet.ts.net suikou). It drives URL generation
      // and is allow-listed for websocket origin checks in config/runtime.exs.
      // Defaults to localhost. The server itself already binds all interfaces.
      PHX_HOST: process.env.PHX_HOST || "localhost",
      PORT: String(port),
      DATABASE_PATH: join(base, "suikou.db"),
      SECRET_KEY_BASE: await ensureSecret()
    }
  })

  // SIGTERM lets the release drain gracefully (it traps it). Forward both signals,
  // then exit once the child does.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => proc.kill(signal))
  }

  if (openBrowser) {
    const url = urlForPort(port)
    waitForReady(port).then((ready) => {
      if (ready) spawn(["open", url])
      else console.error(`server did not become ready at ${url}`)
    })
  }

  process.exit(await proc.exited)
}

// `suikou start`: launch a detached background daemon and return promptly.
async function start(): Promise<number> {
  const existing = await loadPidfile()
  if (existing && alive(existing.pid)) {
    console.log(`already running (pid ${existing.pid}) at ${urlForPort(existing.port)}`)
    return 0
  }

  // The parent picks the port so it can record it and open the right URL, then
  // hands it to the detached child via PORT so they agree on the binding.
  const port = await pickPort()
  await mkdir(base, { recursive: true })
  const logFd = openSync(logPath, "a")

  // node:child_process `detached: true` is Bun-native (setsid/new session), so the
  // daemon survives both this parent exiting and the terminal closing. unref drops
  // it from the parent's event loop so we can exit.
  const child = spawnDetached(process.execPath, ["run"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, PORT: String(port) }
  })
  child.unref()

  if (child.pid === undefined) {
    console.error(`failed to spawn daemon; see ${logPath}`)
    return 1
  }

  await write(pidfilePath, JSON.stringify({ pid: child.pid, port }))

  const url = urlForPort(port)
  if (await waitForReady(port)) {
    spawn(["open", url])
    console.log(`started (pid ${child.pid}) at ${url}`)
  } else {
    console.error(`started (pid ${child.pid}) but not ready yet at ${url}; see ${logPath}`)
  }
  return 0
}

// `suikou stop`: SIGTERM the daemon for a graceful drain, escalate to SIGKILL if
// it overstays, then clear the pidfile.
async function stop(): Promise<number> {
  if (!(await file(pidfilePath).exists())) {
    console.log("not running")
    return 0
  }

  const info = await loadPidfile()
  if (!info || !alive(info.pid)) {
    await rm(pidfilePath, { force: true })
    console.log("not running (removed stale pidfile)")
    return 0
  }

  process.kill(info.pid, "SIGTERM")

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline && alive(info.pid)) {
    await Bun.sleep(150)
  }

  let forced = ""
  if (alive(info.pid)) {
    process.kill(info.pid, "SIGKILL")
    forced = " (forced)"
  }

  await rm(pidfilePath, { force: true })
  console.log(`stopped${forced}`)
  return 0
}

// `suikou status`: report liveness, pruning a stale pidfile if its holder is gone.
async function status(): Promise<number> {
  const info = await loadPidfile()
  if (info && alive(info.pid)) {
    console.log(`running (pid ${info.pid}) at ${urlForPort(info.port)}  logs: ${logPath}`)
    return 0
  }

  if (await file(pidfilePath).exists()) await rm(pidfilePath, { force: true })
  console.log("not running")
  return 0
}

// Read and validate the daemon pidfile. Returns null when absent or corrupt.
async function loadPidfile(): Promise<Daemon | null> {
  const f = file(pidfilePath)
  if (!(await f.exists())) return null
  try {
    const data = JSON.parse(await f.text())
    if (typeof data?.pid === "number" && typeof data?.port === "number") {
      return { pid: data.pid, port: data.port }
    }
  } catch {
    // fall through to null for a truncated/corrupt pidfile
  }
  return null
}

// Probe liveness without delivering a signal. ESRCH means the process is gone;
// EPERM (alive but not ours) still counts as alive.
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as { code?: string }).code !== "ESRCH"
  }
}

function urlForPort(p: number): string {
  return `http://localhost:${p}`
}

// Extract the release into ~/Library/Application Support/Suikou/runtime/<hash>/
// exactly once. The hash in the embedded filename changes every build, so a new
// binary extracts fresh while the persisted DB and secret (kept at the base dir)
// survive across versions.
async function ensureExtracted(): Promise<string> {
  // bun inserts a content hash before the final extension (server.tar-<hash>.gz),
  // so the whole basename is build-unique; sanitize it into a tidy dir name.
  const key = basename(serverTarball).replace(/[^a-zA-Z0-9]+/g, "-")
  const runtime = join(base, "runtime")
  const dest = join(runtime, key)
  const binPath = join(dest, "suikou", "bin", "suikou")

  if (await file(binPath).exists()) return dest

  await mkdir(runtime, { recursive: true })

  // Serialize concurrent first-runs of the same version. mkdir is atomic, so only
  // one instance wins the lock and extracts; peers wait, then find the binary
  // already promoted. Without this, a second instance's pre-rename `rm(dest/suikou)`
  // could delete the files a first instance is already running.
  const lock = `${dest}.lock`
  await acquireLock(lock)
  try {
    if (await file(binPath).exists()) return dest

    await mkdir(dest, { recursive: true })
    const tmp = await mkdtemp(join(runtime, ".extract-"))
    try {
      // The erl_tar archive holds the release contents (bin/, lib/, releases/,
      // erts-*/) at its root, so extract into a `suikou` subdir to reconstruct
      // the `suikou/bin/suikou` layout the promotion below expects. Bun.Archive
      // (libarchive) restores exec bits and symlinks with no external `tar`.
      const bytes = new Uint8Array(await file(serverTarball).arrayBuffer())
      await new Bun.Archive(bytes).extract(join(tmp, "suikou"))
      // Promote the extracted release into the versioned cache dir. Clear any
      // stale partial promotion first so rename lands on a clean target.
      await rm(join(dest, "suikou"), { recursive: true, force: true })
      await rename(join(tmp, "suikou"), join(dest, "suikou"))
      return dest
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

// Acquire an exclusive lock by atomically creating a directory, recording our PID
// inside so peers can tell a live holder from a dead one. mkdir without `recursive`
// fails with EEXIST if the dir exists — the atomic test-and-set we need. On EEXIST,
// reclaim the lock if its holder has died (crash/SIGKILL) so one interrupted run
// can't brick every future launch; otherwise wait for the live holder to finish.
async function acquireLock(lock: string, timeoutMs = 30_000): Promise<void> {
  const owner = join(lock, "owner")
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await mkdir(lock)
      await write(owner, String(process.pid))
      return
    } catch (err) {
      if ((err as { code?: string }).code !== "EEXIST") throw err
      if (await lockIsStale(lock, owner)) {
        // Best-effort reclaim; a racing peer may win the next mkdir, which is fine.
        await rm(lock, { recursive: true, force: true })
        continue
      }
      if (Date.now() >= deadline) throw new Error(`timed out waiting for extraction lock ${lock}`)
      await Bun.sleep(100)
    }
  }
}

// A lock is stale when its recorded PID is no longer running. If the owner file is
// missing the holder either hasn't written it yet or died in the gap right after
// mkdir; fall back to the lock dir's age so that rare crash window self-heals too.
// A peer releasing the lock concurrently can make the dir/file vanish mid-check
// (ENOENT) — treat that as stale so the caller just retries the mkdir.
const STALE_OWNER_GRACE_MS = 30_000
async function lockIsStale(lock: string, owner: string): Promise<boolean> {
  try {
    const f = file(owner)
    if (!(await f.exists())) {
      const { mtimeMs } = await stat(lock)
      return Date.now() - mtimeMs > STALE_OWNER_GRACE_MS
    }

    const pid = Number.parseInt((await f.text()).trim(), 10)
    if (!Number.isInteger(pid)) return true
    try {
      // Signal 0 probes liveness without delivering anything; ESRCH means gone.
      process.kill(pid, 0)
      return false
    } catch (err) {
      return (err as { code?: string }).code === "ESRCH"
    }
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return true
    throw err
  }
}

// Read the persisted secret_key_base, generating one on first run. Phoenix
// requires at least 64 bytes; 64 random bytes hex-encoded is 128 chars.
async function ensureSecret(): Promise<string> {
  const path = join(base, "secret_key_base")
  const f = file(path)
  if (await f.exists()) {
    const existing = (await f.text()).trim()
    // Phoenix demands >= 64 bytes; a truncated/corrupt file would crash the boot,
    // so regenerate rather than hand back something too short. Measure bytes, not
    // characters, to match what Phoenix actually checks.
    if (new TextEncoder().encode(existing).length >= 64) return existing
  }

  const bytes = crypto.getRandomValues(new Uint8Array(64))
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  await write(path, secret)
  await chmod(path, 0o600)
  return secret
}

// Honor an explicit PORT; otherwise probe BASE_PORT upward until one is free,
// failing loudly rather than drifting to an unpredictable port.
async function pickPort(): Promise<number> {
  const explicit = process.env.PORT
  if (explicit) {
    const parsed = Number.parseInt(explicit, 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`invalid PORT ${explicit}; expected an integer in 1-65535`)
    }
    return parsed
  }

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

// Probe liveness by opening a TCP socket. A successful connect means "up"; a
// refused connection surfaces either as the `error` handler firing or the
// `Bun.connect` promise rejecting, so guard against both and settle once.
function tcpUp(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (up: boolean, socket?: { end(): void }) => {
      if (settled) return
      settled = true
      socket?.end()
      resolve(up)
    }
    Bun.connect({
      hostname: host,
      port,
      socket: {
        open: (socket) => settle(true, socket),
        error: () => settle(false),
        data: () => {}
      }
    }).catch(() => settle(false))
  })
}
