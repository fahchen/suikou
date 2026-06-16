import { chmod, mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises"
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
// Background lifecycle is delegated to the release's own OTP-native commands
// (`bin/suikou daemon`/`stop`/`pid`). We pin the release's runtime identity to
// STABLE locations in the base dir — not the per-build runtime/<hash> dir — so a
// `stop`/`pid` from a newer binary can still reach a daemon an older one started:
//   * RELEASE_TMP holds run_erl's pipes (reach the node) and logs.
//   * RELEASE_COOKIE + RELEASE_NODE + RELEASE_DISTRIBUTION fix the distributed
//     identity the `stop`/`pid` rpc connects to.
const releaseTmp = join(base, "tmp")
const logDir = join(releaseTmp, "log")
// run_erl writes its piped output here.
const daemonFile = join(base, "daemon.json")
const RELEASE_NODE = "suikou@127.0.0.1"

// Dispatch on the first positional arg. Bare invocation stays a foreground
// server (the original behavior); subcommands add background daemon control.
await dispatch(process.argv[2])

async function dispatch(command: string | undefined): Promise<void> {
  switch (command) {
    case undefined:
      // Bare invocation: foreground server that opens the browser. Never returns.
      return runServer({ openBrowser: true })
    case "run":
      // Internal alias for the foreground server, without opening the browser.
      // Never returns.
      return runServer({ openBrowser: false })
    case "start":
      return process.exit(await start())
    case "stop":
      return process.exit(await stop())
    case "status":
      return process.exit(await status())
    default:
      console.error("usage: suikou [start|stop|status|run]")
      return process.exit(1)
  }
}

// Foreground server body shared by bare invocation and `run`: extract the release,
// spawn it inheriting our stdio, forward signals for a graceful drain, and exit
// with the child's code. Never returns.
async function runServer({ openBrowser }: { openBrowser: boolean }): Promise<never> {
  const releaseRoot = await ensureExtracted()
  const bin = join(releaseRoot, "suikou", "bin", "suikou")
  await mkdir(releaseTmp, { recursive: true })
  const port = await pickPort()

  const proc = spawn([bin, "start"], {
    // Inherit the terminal: this process *is* the server, so its logs go straight
    // to the user's console.
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: await releaseEnv({ PORT: String(port) })
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

// `suikou start`: start the release as an OTP daemon (run_erl), then open the
// browser once it is serving. Returns promptly — `daemon` backgrounds itself.
async function start(): Promise<number> {
  const releaseRoot = await ensureExtracted()
  const bin = join(releaseRoot, "suikou", "bin", "suikou")
  await mkdir(releaseTmp, { recursive: true })
  const env = await releaseEnv()

  const runningPid = await daemonPid(bin, env)
  if (runningPid !== null) {
    const port = await loadDaemonPort()
    if (port === null) {
      // Running but we lost the port (missing/corrupt daemon.json); don't open
      // a guessed BASE_PORT that is likely a dead page.
      console.log(`already running (pid ${runningPid}) — port unknown`)
    } else {
      const url = urlForPort(port)
      spawn(["open", url])
      console.log(`already running (pid ${runningPid}) at ${url}`)
    }
    return 0
  }

  const port = await pickPort()
  await write(daemonFile, JSON.stringify({ port }))

  // Do NOT pipe the daemon's stdio: run_erl backgrounds itself but inherits these
  // fds, so a piped stdout would stay open and a read would hang forever. run_erl
  // writes the real output to logDir; we only care about the exit code.
  const daemon = spawn([bin, "daemon"], {
    env: { ...env, PORT: String(port) },
    stdout: "ignore",
    stderr: "ignore"
  })
  const exitCode = await daemon.exited
  if (exitCode !== 0) {
    // The daemon never came up; drop the port file we just wrote so a later
    // status doesn't report a phantom port that nothing is listening on.
    await rm(daemonFile, { force: true })
    console.error(`failed to start daemon (exit ${exitCode}); see logs in ${logDir}`)
    return 1
  }

  const url = urlForPort(port)
  if (await waitForReady(port)) {
    spawn(["open", url])
    console.log(`started at ${url}`)
    return 0
  }

  // Daemon spawned but never became reachable; remove the stale port file so
  // persisted state stays consistent with reality.
  await rm(daemonFile, { force: true })
  console.error(`started but not ready yet at ${url}; see logs in ${logDir}`)
  return 1
}

// `suikou stop`: ask the running node to stop via the release rpc. A downed node
// reports `:noconnection`, which we surface as "not running".
async function stop(): Promise<number> {
  const releaseRoot = await ensureExtracted()
  const bin = join(releaseRoot, "suikou", "bin", "suikou")
  const env = await releaseEnv()

  const { exitCode, stderr } = await releaseCommand(bin, ["stop"], env)
  if (exitCode === 0) {
    // System.stop() is async: the rpc returns while the node is still draining and
    // briefly keeps answering. Wait for it to actually vanish so a follow-up
    // start/status sees a clean state.
    const waitSeconds = 10
    const deadline = Date.now() + waitSeconds * 1000
    while (Date.now() < deadline && (await daemonPid(bin, env)) !== null) {
      await Bun.sleep(150)
    }
    // The node may still be draining (or wedged) past the wait. Don't claim
    // success and discard the port file while it's alive — that would orphan a
    // running daemon that status/stop could no longer find.
    if ((await daemonPid(bin, env)) !== null) {
      console.error(`failed to stop: daemon still running after ${waitSeconds}s`)
      return 1
    }
    await rm(daemonFile, { force: true })
    console.log("stopped")
    return 0
  }

  if (notRunning(stderr)) {
    await rm(daemonFile, { force: true })
    console.log("not running")
    return 0
  }

  console.error(`stop failed (exit ${exitCode}): ${stderr.trim()}`)
  return 1
}

// `suikou status`: ask the release for the daemon's OS pid, then check the port.
// A live node whose port is not yet accepting reads as "starting".
async function status(): Promise<number> {
  const releaseRoot = await ensureExtracted()
  const bin = join(releaseRoot, "suikou", "bin", "suikou")
  const env = await releaseEnv()

  const pid = await daemonPid(bin, env)
  if (pid === null) {
    await rm(daemonFile, { force: true })
    console.log("not running")
    return 0
  }

  const port = await loadDaemonPort()
  if (port === null) {
    // Node is alive but we lost the port (missing/corrupt daemon.json); don't
    // guess BASE_PORT and probe/print a URL that may be wrong.
    console.log(`running (pid ${pid}) — port unknown (no daemon.json)  logs: ${logDir}`)
  } else if (await tcpUp(port)) {
    console.log(`running (pid ${pid}) at ${urlForPort(port)}  logs: ${logDir}`)
  } else {
    console.log(`starting (pid ${pid}), port ${port} not yet reachable  logs: ${logDir}`)
  }
  return 0
}

// Shared environment for every release invocation. Pins the runtime identity to
// stable base-dir locations so daemon/stop/pid are version-independent.
async function releaseEnv(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    ...(process.env as Record<string, string>),
    PHX_SERVER: "true",
    // Pass through PHX_HOST so a Tailscale MagicDNS name / tailnet IP can be set
    // at launch (PHX_HOST=mybox.tailnet.ts.net suikou). It drives URL generation
    // and is allow-listed for websocket origin checks in config/runtime.exs.
    // Defaults to localhost. The server itself already binds all interfaces.
    PHX_HOST: process.env.PHX_HOST || "localhost",
    DATABASE_PATH: join(base, "suikou.db"),
    SECRET_KEY_BASE: await ensureSecret(),
    RELEASE_TMP: releaseTmp,
    RELEASE_COOKIE: await ensureCookie(),
    RELEASE_NODE,
    RELEASE_DISTRIBUTION: "name",
    ...extra
  }
}

// Run a release subcommand to completion, capturing its output. Used for the
// quick rpc-style commands (daemon/stop/pid) — never the long-lived foreground.
async function releaseCommand(
  bin: string,
  args: string[],
  env: Record<string, string>
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = spawn([bin, ...args], { env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  return { exitCode: await proc.exited, stdout, stderr }
}

// Ask the running node for its OS pid via `bin/suikou pid`. Returns null when no
// node answers (the rpc exits non-zero with `:noconnection`).
async function daemonPid(bin: string, env: Record<string, string>): Promise<number | null> {
  const { exitCode, stdout } = await releaseCommand(bin, ["pid"], env)
  if (exitCode !== 0) return null
  const pid = Number.parseInt(stdout.trim(), 10)
  return Number.isInteger(pid) ? pid : null
}

// The release rpc reports an unreachable node as `:noconnection` (or `:nodedown`);
// for a single-user desktop daemon that just means nothing is running.
function notRunning(stderr: string): boolean {
  return /noconnection|nodedown/.test(stderr)
}

async function loadDaemonPort(): Promise<number | null> {
  const f = file(daemonFile)
  if (!(await f.exists())) return null
  try {
    const data = JSON.parse(await f.text())
    if (typeof data?.port === "number") return data.port
  } catch {
    // fall through to null for a truncated/corrupt file
  }
  return null
}

// User-facing URL reflects PHX_HOST (same value releaseEnv passes the release),
// so a non-default host like a Tailscale MagicDNS name is what we print and open.
// Liveness probing stays on 127.0.0.1 — only the displayed URL uses the host.
function urlForPort(p: number): string {
  const host = process.env.PHX_HOST || "localhost"
  return `http://${host}:${p}`
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
  // Create with 0600 so the secret is never exposed in a default-perms window.
  // The chmod is idempotent safety for a pre-existing, too-short file (the mode
  // option only applies when writeFile creates the file).
  await writeFile(path, secret, { mode: 0o600 })
  await chmod(path, 0o600)
  return secret
}

// Persist a stable Erlang distribution cookie on first run, reused across every
// version. A per-version cookie would leave a newer binary unable to authenticate
// against (and so stop) a daemon an older one started.
async function ensureCookie(): Promise<string> {
  const path = join(base, "cookie")
  const f = file(path)
  if (await f.exists()) {
    const existing = (await f.text()).trim()
    if (existing.length > 0) return existing
  }

  const bytes = crypto.getRandomValues(new Uint8Array(64))
  const cookie = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  // Create with 0600 so the cookie is never exposed in a default-perms window.
  // The chmod is idempotent safety for a pre-existing, looser file (the mode
  // option only applies when writeFile creates the file).
  await writeFile(path, cookie, { mode: 0o600 })
  await chmod(path, 0o600)
  return cookie
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
