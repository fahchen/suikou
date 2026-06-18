import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { parseArgs, type ParseArgsConfig } from "node:util"
import { file, spawn, write } from "bun"

// The `suikou` mix release (ERTS + app), packed at build time by erl_tar. Bun
// embeds the bytes into the compiled binary and rewrites this import to a
// `$bunfs/...` path whose basename carries a content hash — we reuse that hash
// as the cache key.
import serverTarball from "./embed/server.tar.gz" with { type: "file" }

const APP_NAME = "Suikou"
// Fixed high base port (registered range, away from common dev ports and the
// OS ephemeral range). If it is occupied, the launcher errors at startup
// rather than drifting to a different, unpredictable port.
const BASE_PORT = 47100

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

// Dispatch runs at the END of this module (see the final line): the command
// registry is a `const`, so calling dispatch before its declaration would hit the
// temporal dead zone. Hoisted `function` declarations below are all reachable.
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
      return process.exit(await start(process.argv.includes("--force") || process.argv.includes("-f")))
    case "stop":
      return process.exit(await stop())
    case "status":
      return process.exit(await status())
    case "help":
    case "--help":
    case "-h":
      // `help [group [verb]]`: usage is generated from the registry, never a
      // hand-maintained second copy.
      console.log(usage(process.argv[3], process.argv[4]))
      return process.exit(0)
    case "poll":
      // Thin alias for `review poll`: the id sits at argv[3] (one slot earlier
      // than the `<group> <verb> <id>` form), so route directly to the spec with
      // the argv after the alias token.
      return process.exit(await runGroupVerb("review", "poll", process.argv.slice(3)))
    case "project":
    case "review":
    case "comment":
      return process.exit(await runGroupVerb(command, process.argv[3], process.argv.slice(4)))
    default:
      console.error(usage())
      return process.exit(1)
  }
}

// ── Agent CLI command layer ────────────────────────────────────────────────
//
// Every project/review/comment verb shells into `bin/suikou rpc "<static expr>"`
// with a JSON payload piped on stdin (the expr carries NO user content — all
// parameters travel in the payload). Each command is one declarative spec in the
// registry below; `runCommand` is the single generic executor.

type ParseOptions = NonNullable<ParseArgsConfig["options"]>
type Values = Record<string, string | boolean | undefined>

type CommandSpec = {
  // The static zero-arg expr evaluated by `bin/suikou rpc`.
  expr: string
  // parseArgs option schema for this verb's flags.
  options: ParseOptions
  // Whether a positional id (positionals[0]) is required as the subject.
  id?: { name: string; required: boolean }
  // Required flag names; missing ones produce a friendly error.
  required?: string[]
  // Builds the JSON payload sent on stdin from the parsed id + flag values.
  payload: (ctx: { id?: string; values: Values }) => Record<string, unknown>
  // One-line usage summary for `help`.
  summary: string
  // poll loops instead of a single round-trip.
  poll?: boolean
}

// `--files a,b,c` → ["a","b","c"], trimming empties. ponytail: plain split, no
// quoting/escaping — paths with commas aren't a real use case here.
function splitFiles(values: Values): string[] {
  const raw = values.files
  if (typeof raw !== "string") return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// The `rounds` payload value the backend `scope/1` reads: omit (→ :latest) when
// neither flag is given; "all" for --all; [n,n] / [from,to] of numbers for
// --rounds. --all and --rounds are mutually exclusive.
function roundsPayload(values: Values): { rounds?: unknown } {
  const all = values.all === true
  const rounds = typeof values.rounds === "string" ? values.rounds : undefined
  if (all && rounds !== undefined) throw new UsageError("--all and --rounds are mutually exclusive")
  if (all) return { rounds: "all" }
  if (rounds === undefined) return {}

  const match = rounds.match(/^(\d+)(?:-(\d+))?$/)
  if (!match) throw new UsageError(`invalid --rounds ${rounds}; expected N or N-M`)
  const from = Number(match[1])
  const to = match[2] === undefined ? from : Number(match[2])
  if (to < from) throw new UsageError(`invalid --rounds ${rounds}; expected from <= to`)
  return { rounds: [from, to] }
}

const roundsOptions: ParseOptions = {
  rounds: { type: "string" },
  all: { type: "boolean" }
}

const registry: Record<string, Record<string, CommandSpec>> = {
  project: {
    list: {
      expr: "SuikouWeb.AgentCLI.Projects.list()",
      options: {},
      payload: () => ({}),
      summary: "list all projects"
    },
    create: {
      expr: "SuikouWeb.AgentCLI.Projects.create()",
      options: { name: { type: "string" }, path: { type: "string" } },
      required: ["name", "path"],
      payload: ({ values }) => ({ name: values.name, path: values.path }),
      summary: "register a project (--name --path)"
    }
  },
  review: {
    list: {
      expr: "SuikouWeb.AgentCLI.Reviews.list()",
      options: { project: { type: "string" } },
      required: ["project"],
      payload: ({ values }) => ({ project_id: values.project }),
      summary: "list a project's reviews (--project)"
    },
    create: {
      expr: "SuikouWeb.AgentCLI.Reviews.create()",
      options: { project: { type: "string" }, name: { type: "string" }, files: { type: "string" } },
      required: ["project", "name"],
      // --files maps to the `selections` payload key (file-selection review).
      payload: ({ values }) => ({
        project_id: values.project,
        name: values.name,
        selections: splitFiles(values)
      }),
      summary: "create a file-selection review (--project --name --files a,b,c)"
    },
    "create-diff": {
      expr: "SuikouWeb.AgentCLI.Reviews.create_diff()",
      options: {
        project: { type: "string" },
        name: { type: "string" },
        base: { type: "string" },
        head: { type: "string" }
      },
      required: ["project", "name", "base", "head"],
      payload: ({ values }) => ({
        project_id: values.project,
        name: values.name,
        base_ref: values.base,
        head_ref: values.head
      }),
      summary: "create a git-diff review (--project --name --base --head)"
    },
    show: {
      expr: "SuikouWeb.AgentCLI.Reviews.show()",
      options: {},
      id: { name: "review-id", required: true },
      payload: ({ id }) => ({ review_id: id }),
      summary: "show a review's metadata and files (<review-id>)"
    },
    files: {
      expr: "SuikouWeb.AgentCLI.Reviews.files()",
      options: {},
      id: { name: "review-id", required: true },
      payload: ({ id }) => ({ review_id: id }),
      summary: "list a review's files (<review-id>)"
    },
    rename: {
      expr: "SuikouWeb.AgentCLI.Reviews.rename()",
      options: { name: { type: "string" } },
      id: { name: "review-id", required: true },
      required: ["name"],
      payload: ({ id, values }) => ({ review_id: id, name: values.name }),
      summary: "rename a review (<review-id> --name)"
    },
    "set-files": {
      expr: "SuikouWeb.AgentCLI.Reviews.set_files()",
      options: { files: { type: "string" } },
      id: { name: "review-id", required: true },
      // Here --files maps to the `files` payload key (NOT `selections`).
      payload: ({ id, values }) => ({ review_id: id, files: splitFiles(values) }),
      summary: "replace a review's file selection (<review-id> --files a,b,c)"
    },
    delete: {
      expr: "SuikouWeb.AgentCLI.Reviews.delete()",
      options: {},
      id: { name: "review-id", required: true },
      payload: ({ id }) => ({ review_id: id }),
      summary: "delete a review (<review-id>)"
    },
    export: {
      expr: "SuikouWeb.AgentCLI.Reviews.export()",
      options: roundsOptions,
      id: { name: "review-id", required: true },
      payload: ({ id, values }) => ({ review_id: id, ...roundsPayload(values) }),
      summary: "export a critique snapshot (<review-id> [--rounds a-b] [--all])"
    },
    poll: {
      expr: "SuikouWeb.AgentCLI.Reviews.poll()",
      options: { ...roundsOptions, timeout: { type: "string" } },
      id: { name: "review-id", required: true },
      payload: ({ id, values }) => ({ review_id: id, ...roundsPayload(values) }),
      poll: true,
      summary: "wait for the next submission (<review-id> [--rounds a-b] [--all] [--timeout secs])"
    }
  },
  comment: {
    reply: {
      expr: "SuikouWeb.AgentCLI.Comments.reply()",
      options: { body: { type: "string" }, "body-file": { type: "string" } },
      id: { name: "comment-id", required: true },
      payload: ({ id }) => ({ comment_id: id }), // body resolved asynchronously in runGroupVerb
      summary: "reply to a comment (<comment-id> --body | --body-file | stdin)"
    }
  }
}

// A bad invocation (unknown verb, missing flag/id, malformed --rounds). Carries a
// friendly message; the dispatcher prints it to stderr and exits non-zero.
class UsageError extends Error {}

// Route a `<group> <verb>` to its spec: parse the verb's argv, validate id/flags,
// build the payload, then run (single round-trip, or poll loop). Returns the exit
// code. UsageErrors print to stderr with a hint and exit 1.
async function runGroupVerb(group: string, verb: string | undefined, argv: string[]): Promise<number> {
  const verbs = registry[group]
  if (!verbs) {
    console.error(usage())
    return 1
  }
  if (verb === undefined || !(verb in verbs)) {
    console.error(`unknown command: ${group} ${verb ?? ""}`.trim() + "\n\n" + usage(group))
    return 1
  }

  const spec = verbs[verb]
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage(group, verb))
    return 0
  }

  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: spec.options,
      allowPositionals: true,
      strict: true
    })

    let id: string | undefined
    if (spec.id) {
      id = positionals[0]
      if (spec.id.required && !id) {
        throw new UsageError(`missing required <${spec.id.name}>`)
      }
    }

    for (const flag of spec.required ?? []) {
      if (values[flag] === undefined) throw new UsageError(`missing required --${flag}`)
    }

    const payload = spec.payload({ id, values })
    if (group === "comment" && verb === "reply") {
      payload.body = await resolveBody(values)
    }

    if (spec.poll) return await runPoll(spec, payload, values)
    return await runCommand(spec, payload)
  } catch (err) {
    // parseArgs throws TypeError on unknown/misused flags; surface its message.
    if (err instanceof UsageError || err instanceof TypeError) {
      console.error(`${err.message}\n\n${usage(group, verb)}`)
      return 1
    }
    throw err
  }
}

// Resolve a `comment reply` body, in priority order: --body, then --body-file,
// then the launcher's own stdin read to EOF.
async function resolveBody(values: Values): Promise<string> {
  if (typeof values.body === "string") return values.body
  if (typeof values["body-file"] === "string") {
    return await readFile(values["body-file"] as string, "utf8")
  }
  return await new Response(Bun.stdin.stream()).text()
}

// Spawn `bin/suikou rpc <expr>`, piping the JSON payload on stdin (EOF on close —
// exactly what the remote `IO.read(:stdio, :eof)` waits for) and capturing both
// streams plus the exit code.
async function rpcInvoke(bin: string, env: Record<string, string>, expr: string, json: string) {
  // The rpc transport reads stdin in latin1; escape non-ASCII to \uXXXX so the
  // payload survives as valid JSON (mirrors the backend's escape: :unicode_safe).
  const ascii = json.replace(/[^\x00-\x7F]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
  const proc = spawn([bin, "rpc", expr], {
    env,
    stdin: new TextEncoder().encode(ascii),
    stdout: "pipe",
    stderr: "pipe"
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  return { stdout, stderr, exitCode: await proc.exited }
}

// Returns the exit code to propagate on failure, or null when the call succeeded.
function rpcFailure(stderr: string, exitCode: number): number | null {
  if (exitCode === 0) return null
  if (notRunning(stderr)) {
    console.error("Suikou is not running — start it first with `suikou`.")
    return 1
  }
  console.error(stderr.trim() || `rpc failed (exit ${exitCode})`)
  return exitCode
}

// The single generic executor: extract the release, pipe the JSON payload on the
// child's stdin (EOF on close), capture its one JSON line, pass it straight
// through on success. A downed node prints the friendly "not running" line.
async function runCommand(spec: CommandSpec, payload: Record<string, unknown>): Promise<number> {
  const releaseRoot = await ensureExtracted()
  const bin = join(releaseRoot, "suikou", "bin", "suikou")

  const { stdout, stderr, exitCode } = await rpcInvoke(
    bin,
    await releaseEnv(),
    spec.expr,
    JSON.stringify(payload)
  )
  const fail = rpcFailure(stderr, exitCode)
  if (fail !== null) return fail

  process.stdout.write(stdout)
  return 0
}

// poll re-issues the rpc until the backend returns a non-timeout snapshot. The
// backend blocks up to ~25 s per call then emits {"status":"timeout","version":N};
// we loop on that. --timeout caps total wall-clock: each call passes the remaining
// budget as timeout_ms so the backend bounds its block to it, and when it elapses
// we print the last timeout line and exit 0. ponytail: without --timeout we loop
// forever — the caller is an agent waiting on a human, so no submission just means
// "keep waiting".
async function runPoll(
  spec: CommandSpec,
  payload: Record<string, unknown>,
  values: Values
): Promise<number> {
  const releaseRoot = await ensureExtracted()
  const bin = join(releaseRoot, "suikou", "bin", "suikou")
  const env = await releaseEnv()
  const json = JSON.stringify(payload)

  const timeoutSecs = typeof values.timeout === "string" ? Number(values.timeout) : undefined
  if (timeoutSecs !== undefined && (!Number.isFinite(timeoutSecs) || timeoutSecs < 0)) {
    throw new UsageError(`invalid --timeout ${values.timeout}; expected seconds`)
  }
  const deadline = timeoutSecs === undefined ? Infinity : Date.now() + timeoutSecs * 1000

  let lastTimeout = ""
  for (;;) {
    const remainingMs = deadline === Infinity ? undefined : Math.max(deadline - Date.now(), 0)
    const callJson = remainingMs === undefined ? json : JSON.stringify({ ...payload, timeout_ms: remainingMs })
    const { stdout, stderr, exitCode } = await rpcInvoke(bin, env, spec.expr, callJson)
    const fail = rpcFailure(stderr, exitCode)
    if (fail !== null) return fail

    if (!isTimeout(stdout)) {
      process.stdout.write(stdout)
      return 0
    }
    lastTimeout = stdout

    if (Date.now() >= deadline) {
      process.stdout.write(lastTimeout)
      return 0
    }
  }
}

// A poll round-trip is a timeout when the JSON line says so.
function isTimeout(line: string): boolean {
  try {
    return (JSON.parse(line) as { status?: string }).status === "timeout"
  } catch {
    return false
  }
}

// Generate usage text from the registry so there's a single source of truth.
// `usage()` lists everything; `usage(group)` a group; `usage(group, verb)` one verb.
function usage(group?: string, verb?: string): string {
  if (group && verb && registry[group]?.[verb]) {
    return `usage: suikou ${group} ${verb}\n  ${registry[group][verb].summary}`
  }
  if (group && registry[group]) {
    const lines = Object.entries(registry[group]).map(
      ([v, spec]) => `  ${group} ${v.padEnd(12)} ${spec.summary}`
    )
    return `usage: suikou ${group} <verb>\n${lines.join("\n")}`
  }

  const lifecycle = "  (bare)        start the foreground server and open the browser\n" +
    "  start [--force]     start the background daemon (--force relaunches a running one)\n" +
    "  stop|status         background daemon control\n" +
    "  poll <review-id>    alias for `review poll`"
  const groups = Object.entries(registry)
    .map(([g, verbs]) =>
      Object.entries(verbs)
        .map(([v, spec]) => `  ${`${g} ${v}`.padEnd(20)} ${spec.summary}`)
        .join("\n")
    )
    .join("\n")
  return `usage: suikou <command>\n\nlifecycle:\n${lifecycle}\n\ncommands:\n${groups}`
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

// `suikou start [--force]`: start the release as an OTP daemon (run_erl), then
// open the browser once it is serving. Returns promptly — `daemon` backgrounds
// itself. `--force` stops an already-running daemon first and relaunches it,
// instead of reattaching to the existing one.
async function start(force = false): Promise<number> {
  const releaseRoot = await ensureExtracted()
  const bin = join(releaseRoot, "suikou", "bin", "suikou")
  await mkdir(releaseTmp, { recursive: true })
  const env = await releaseEnv()

  // Serialize the launch decision so racing `start`s can't both observe
  // "not running", spawn the same daemon, and have the loser's failure-cleanup
  // delete the winner's daemon.json. Distinct from the per-version extraction
  // lock — this guards the daemon-launch decision, not the extraction.
  const startLock = join(base, "start.lock")
  await acquireLock(startLock)
  try {
    // Re-check liveness under the lock: a peer may have started the daemon
    // between our pre-lock check and acquiring the lock.
    const runningPid = await daemonPid(bin, env)
    if (runningPid !== null && force) {
      // Relaunch from scratch: stop our own daemon and wait for it to vanish so
      // the port frees before we re-pick it. Only touches the suikou daemon — a
      // foreign process holding the port still makes pickPort fail loudly below.
      console.log(`force: stopping running daemon (pid ${runningPid})`)
      const stopCode = await stop()
      if (stopCode !== 0) return stopCode
    } else if (runningPid !== null) {
      const port = await loadDaemonPort()
      if (port === null) {
        // Running but we lost the port (missing/corrupt daemon.json); don't open
        // a guessed BASE_PORT that is likely a dead page.
        console.log(`already running (pid ${runningPid}) — port unknown`)
      } else {
        const url = urlForPort(port)
        if (await tcpUp(port)) {
          spawn(["open", url])
          console.log(`already running (pid ${runningPid}) at ${url}`)
        } else {
          // Node is up but the Phoenix endpoint may still be booting (migrations
          // run first); wait until the port is reachable before opening, like the
          // first-start path does, so we don't open a dead page.
          console.log(`already running (pid ${runningPid}) — starting at ${url}`)
          if (await waitForReady(port)) spawn(["open", url])
        }
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
  } finally {
    await rm(startLock, { recursive: true, force: true })
  }
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

// Honor an explicit PORT; otherwise use the configured port (config.toml `port`,
// defaulting to BASE_PORT) and fail loudly if it is occupied, rather than
// drifting to an unpredictable port.
async function pickPort(): Promise<number> {
  const explicit = process.env.PORT
  if (explicit) {
    const parsed = Number.parseInt(explicit, 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`invalid PORT ${explicit}; expected an integer in 1-65535`)
    }
    return parsed
  }

  const port = await configuredPort()
  if (await tcpUp(port)) {
    throw new Error(`port ${port} is in use; stop whatever is using it or set PORT to override`)
  }
  return port
}

// Read the `port` key from the same XDG config.toml runtime.exs reads. The
// launcher must resolve it itself (not via the release) because it owns the
// recorded daemon port, the browser URL, and the liveness probe — all of which
// would desync if the release picked a different port. A malformed file or an
// out-of-range value fails loudly; a missing file/key uses BASE_PORT.
async function configuredPort(): Promise<number> {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  const path = join(configHome, "suikou", "config.toml")
  const f = file(path)
  if (!(await f.exists())) return BASE_PORT

  let cfg: Record<string, unknown>
  try {
    cfg = Bun.TOML.parse(await f.text()) as Record<string, unknown>
  } catch (e) {
    throw new Error(`invalid Suikou config at ${path}: ${e instanceof Error ? e.message : String(e)}`)
  }

  const raw = cfg.port
  if (raw === undefined) return BASE_PORT
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 65535) {
    throw new Error(`invalid \`port\` at ${path}: ${JSON.stringify(raw)} (expected an integer in 1-65535)`)
  }
  return raw
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

// Entry point, last so every `const` (notably the command registry) is past its
// temporal dead zone before dispatch reads it. Bare invocation stays a foreground
// server; subcommands add daemon control and the agent CLI groups.
await dispatch(process.argv[2])
