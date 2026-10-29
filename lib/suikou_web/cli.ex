defmodule SuikouWeb.CLI do
  @moduledoc """
  The `suikou` command-line interface, in the application itself.

  The executable boots the release with its arguments; `entry/1` splits a boot
  into the foreground server (bare or `run`) and a CLI run (`start`, `stop`,
  `status`, `open`, `version`, `skill`, `help`, and the `project`, `review`,
  `comment`, `reply` verb groups). Every verb maps to one route of the
  loopback CLI API (see `SuikouWeb.Router`): the parsed flags and positionals
  build the same JSON payload the bun launcher built, the route calls the same
  `SuikouWeb.AgentCLI` command, and the CLI prints the same JSON line with the
  same exit code.

  `run/1` returns the exit code; the release entry stops the node with it. In
  dev, `mise run cli` calls `run/1` directly against the dev server.
  """

  defmodule UsageError do
    @moduledoc """
    A bad invocation: an unknown verb, a missing flag or id, a malformed
    `--rounds`. The dispatcher prints the message to stderr with usage and the
    CLI exits 1.
    """

    defexception [:message]
  end

  alias SuikouWeb.CLI
  alias SuikouWeb.CLI.Access
  alias SuikouWeb.CLI.HTTP

  @transport_default {CLI.HTTP, :post}

  @rounds_options [rounds: :string, all: :boolean]
  @identity_options [as: :string, icon: :string]

  @critique_types ["fix_required", "needs_answer", "note"]

  # The variable `start` sets on the detached server it launches (see
  # `entry/2` and `run_daemon/2`).
  @daemon_env "SUIKOU_DAEMON"

  # One entry per verb, mirroring the routes one to one. `payload` names the
  # shape builder; the rest drive argument parsing (see `run_group_verb/3`).
  @registry %{
    "project" => %{
      "list" => %{options: [], payload: :empty, summary: "list all projects"},
      "create" => %{
        options: [name: :string],
        required: ["name"],
        payload: :project_create,
        summary: "register the current repository as a project (--name)"
      }
    },
    "review" => %{
      "list" => %{
        options: [project: :string, path: :string],
        payload: :review_list,
        summary: "list reviews (--project <id> | --path <dir>; defaults to the current directory)"
      },
      "create" => %{
        options: [project: :string, name: :string, diff: :string, stack: :string],
        required: ["name"],
        payload: :review_create,
        fail_on_error: :stack,
        summary: "create a review (--name; file1 file2 … | --diff base..head [--stack branch])"
      },
      "show" => %{
        options: [],
        id: "review-id",
        payload: :review_id,
        summary: "show a review's metadata and files (<review-id>)"
      },
      "list-files" => %{
        options: [],
        id: "review-id",
        payload: :review_id,
        summary: "list a review's files (<review-id>)"
      },
      "url" => %{
        options: [],
        id: "review-id",
        payload: :review_id,
        summary: "print a review's URL (<review-id>)"
      },
      "open" => %{
        options: [],
        id: "review-id",
        payload: :review_id,
        # No route of its own: it reads the URL of `review url` and opens it.
        route: "url",
        open: true,
        summary: "open a review in the browser (<review-id>)"
      },
      "rename" => %{
        options: [name: :string],
        id: "review-id",
        required: ["name"],
        payload: :review_rename,
        summary: "rename a review (<review-id> --name)"
      },
      "set-files" => %{
        options: [],
        id: "review-id",
        require_files: true,
        payload: :review_id_files,
        summary: "replace a review's file selection (<review-id> file1 file2 …)"
      },
      "set-stack" => %{
        options: [],
        id: "review-id",
        payload: :review_set_stack,
        fail_on_error: :always,
        summary: "attach a review stack to a git-diff review (<review-id> <branch>)"
      },
      "add-files" => %{
        options: [],
        id: "review-id",
        require_files: true,
        payload: :review_id_files,
        summary: "add files to a review's selection (<review-id> file1 file2 …)"
      },
      "remove-files" => %{
        options: [],
        id: "review-id",
        require_files: true,
        payload: :review_id_files,
        summary: "remove files from a review's selection (<review-id> file1 file2 …)"
      },
      "delete" => %{
        options: [],
        id: "review-id",
        payload: :review_id,
        summary: "delete a review (<review-id>)"
      },
      "export" => %{
        options: @rounds_options,
        id: "review-id",
        payload: :review_export,
        summary: "export a critique snapshot (<review-id> [--rounds a-b] [--all])"
      },
      "wait" => %{
        options: @rounds_options ++ [until_round: :string, timeout: :string],
        id: "review-id",
        payload: :review_wait,
        poll: true,
        summary:
          "wait for a submission round (<review-id> [--until-round N] [--rounds a-b] [--all] [--timeout secs])"
      },
      "notify" => %{
        options: [message: :string],
        id: "review-id",
        payload: :review_notify,
        summary: "push a review notification to subscribed browsers (<review-id> [--message …])"
      }
    },
    "comment" => %{
      "add" => %{
        options: [
          path: :string,
          body: :string,
          body_file: :string,
          type: :string,
          line: :string,
          hunk: :string,
          review_wide: :boolean
        ],
        id: "review-id",
        required: ["path"],
        identity: true,
        body: true,
        payload: :comment_add,
        summary:
          "author a comment (<review-id> --path <file> [--type note|fix_required|needs_answer] [--line N-M | --hunk new:N-M | --review-wide] --body | --body-file | stdin)"
      },
      "reply" => %{
        options: [body: :string, body_file: :string],
        id: "comment-id",
        identity: true,
        body: true,
        payload: :comment_id,
        summary: "reply to a comment (<comment-id> --body | --body-file | stdin)"
      },
      "resolve" => %{
        options: [],
        id: "comment-id",
        identity: true,
        payload: :comment_id,
        summary: "mark a comment resolved (<comment-id>)"
      },
      "reopen" => %{
        options: [],
        id: "comment-id",
        payload: :comment_id,
        summary: "reopen a resolved comment (<comment-id>)"
      },
      "react" => %{
        options: [],
        id: "comment-id",
        identity: true,
        payload: :comment_reaction,
        summary: "set your work-status reaction on a comment (<comment-id> <emoji>)"
      },
      "unreact" => %{
        options: [],
        id: "comment-id",
        identity: true,
        payload: :comment_id,
        summary: "clear your reaction on a comment (<comment-id>)"
      }
    },
    "reply" => %{
      "react" => %{
        options: [],
        id: "reply-id",
        identity: true,
        payload: :reply_reaction,
        summary: "set your work-status reaction on a reply (<reply-id> <emoji>)"
      },
      "unreact" => %{
        options: [],
        id: "reply-id",
        identity: true,
        payload: :reply_id,
        summary: "clear your reaction on a reply (<reply-id>)"
      }
    }
  }

  @groups Map.keys(@registry)
  @lifecycle_words ~w(help version open wait start stop status --help -h --version -v)

  @doc """
  Classifies a boot's arguments from the plain arguments of `:init`.

  The application starts before `Kernel.CLI` sets `System.argv/0`, so a
  release boot reads `:init.get_plain_arguments/0` instead. The executable's
  arguments are the ones after the first bare `--` (the one-file executable
  passes `-extra --no-halt -- <args>`); a boot without `--` (`bin/suikou
  start`) has none.

  No arguments boots the foreground server and opens the browser once it
  serves; `["run"]` boots it without the browser; any other first word is a
  CLI command, run instead of the server. The detached server that `start`
  launches never opens the browser — `start` itself opens it — so a boot with
  no arguments whose `env` has `#{@daemon_env}` set serves without the
  browser (a normal release boots that server through `bin/suikou start`,
  which passes no arguments). Only a release boot dispatches this way —
  `mix phx.server` and the test boot always serve.
  """
  @spec entry([charlist()], %{optional(String.t()) => String.t()}) ::
          {:server, boolean()} | {:cli, [String.t()]}
  def entry(plain_arguments, env) do
    plain_arguments
    |> Enum.drop_while(&(&1 != ~c"--"))
    |> Enum.drop(1)
    |> Enum.map(&List.to_string/1)
    |> classify(Map.has_key?(env, @daemon_env))
  end

  defp classify([], daemon?), do: {:server, not daemon?}
  defp classify(["run"], _daemon?), do: {:server, false}
  defp classify(argv, _daemon?), do: {:cli, argv}

  @doc """
  Runs one CLI invocation and returns its exit code.

  Prints each command's JSON result line to stdout, usage errors to stderr.
  """
  @spec run([String.t()]) :: non_neg_integer()
  def run([]) do
    print_error("suikou: the server boots as the bare executable; nothing to run")
    1
  end

  def run(["run"]) do
    print_error("suikou: the server boots as `suikou run`; nothing to run")
    1
  end

  def run(["skill" | rest]), do: emit_skill(rest)

  def run([word | rest]) do
    cond do
      word in @groups ->
        run_group_verb(word, first(rest), further(rest))

      word in @lifecycle_words ->
        run_lifecycle(word, rest)

      true ->
        print_error(usage())
        1
    end
  rescue
    e in UsageError ->
      print_error(e.message)
      1
  end

  # `IO.write` with an explicit newline rather than `IO.puts` (lint rule), as
  # the old rpc emit and launcher prints did.
  defp print(message), do: IO.write([message, ?\n])

  defp print_error(message), do: IO.write(:stderr, [message, ?\n])

  # The lifecycle words, split from `run/1` so each dispatch stays small.
  # `help [group [verb]]` prints usage/0 for everything, usage/1 for a group,
  # and usage/2 for one verb.
  defp run_lifecycle("help", rest), do: exit_ok(usage(Enum.at(rest, 0), Enum.at(rest, 1)))
  defp run_lifecycle("version", _rest), do: exit_ok(version())
  defp run_lifecycle(word, _rest) when word in ["--help", "-h"], do: exit_ok(usage())
  defp run_lifecycle(word, _rest) when word in ["--version", "-v"], do: exit_ok(version())
  defp run_lifecycle("open", _rest), do: open_root()
  defp run_lifecycle("wait", rest), do: run_group_verb("review", "wait", rest)
  defp run_lifecycle("start", rest), do: start_server(rest)
  defp run_lifecycle("stop", _rest), do: stop_server()
  defp run_lifecycle("status", _rest), do: status_server()

  defp exit_ok(text) do
    print(text)
    0
  end

  defp first([head | _further]), do: head
  defp first([]), do: nil

  defp further([_head | tail]), do: tail
  defp further([]), do: []

  @doc """
  The build identifier the `version` verb prints: the application's version.

  The bun launcher printed a tarball content hash; the pbeam executable has no
  embedded tarball, so the release version identifies the build.
  """
  @spec version() :: String.t()
  def version do
    to_string(Application.spec(:suikou, :vsn))
  end

  # ── Verb groups ───────────────────────────────────────────────────────────

  defp run_group_verb(group, verb, argv) do
    case Map.fetch(@registry, group) do
      {:ok, verbs} ->
        case verb && Map.fetch(verbs, verb) do
          {:ok, spec} ->
            run_verb(group, verb, spec, argv)

          _missing ->
            command = String.trim_trailing("#{group} #{verb || ""}")
            print_error("unknown command: #{command}\n\n" <> usage(group))
            1
        end

      :error ->
        print_error(usage())
        1
    end
  end

  defp run_verb(group, verb, spec, argv) do
    if "--help" in argv or "-h" in argv do
      print(usage(group, verb))
      0
    else
      spec = Map.merge(spec, %{group: group, verb: verb})

      spec
      |> parse(argv)
      |> command(spec)
    end
  end

  # Parses a verb's argv with OptionParser in strict mode — an unknown flag is
  # a usage error, as the launcher's parseArgs(strict: true) was. Values are
  # normalized to the string keys the payload builders read.
  defp parse(spec, argv) do
    options = if spec[:identity], do: spec.options ++ @identity_options, else: spec.options

    case OptionParser.parse(argv, strict: options) do
      {parsed, positionals, []} ->
        values = Map.new(parsed, fn {key, value} -> {Atom.to_string(key), value} end)
        %{values: values, positionals: positionals}

      {_parsed, _positionals, invalid} ->
        flags = Enum.map_join(invalid, ", ", fn {key, _value} -> flag(key) end)
        raise UsageError, message: "unknown option #{flags}\n\n" <> usage(spec.group, spec.verb)
    end
  end

  defp command(%{values: values, positionals: positionals}, spec) do
    id = id!(spec, positionals)
    required!(spec, values)
    files = file_args(if spec[:id], do: tl(positionals), else: positionals)

    if spec[:require_files] == true and files == [] do
      raise UsageError, message: "expected at least one file/path argument"
    end

    payload =
      spec.payload
      |> build_payload(id, values, files)
      |> merge_identity(spec, values)
      |> merge_body(spec, values)

    if spec[:poll], do: poll(spec, payload, values), else: round_trip(spec, payload)
  end

  defp id!(spec, positionals) do
    case {spec[:id], positionals} do
      {nil, _positionals} -> nil
      {name, []} -> raise UsageError, message: "missing required <#{name}>"
      {_name, [id | _rest]} -> id
    end
  end

  defp required!(spec, values) do
    Enum.each(spec[:required] || [], fn flag ->
      if values[flag] == nil do
        raise UsageError, message: "missing required --#{flag}"
      end
    end)
  end

  # File/path args arrive as positionals: one token is one path, trimmed of
  # empties. No comma-splitting: a comma is a legal filename character.
  defp file_args(files) do
    files |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
  end

  defp merge_identity(payload, spec, values) do
    if spec[:identity] do
      as = values["as"]

      if as == nil or String.trim(as) == "" do
        raise UsageError, message: "missing required --as <name>; name yourself"
      end

      Map.merge(payload, maybe_put(%{"as" => as}, "icon", values["icon"]))
    else
      payload
    end
  end

  defp merge_body(payload, spec, values) do
    if spec[:body] do
      Map.put(payload, "body", resolve_body(values))
    else
      payload
    end
  end

  # A comment or reply body, in priority order: --body, then --body-file, then
  # the CLI's own stdin read to EOF.
  defp resolve_body(values) do
    cond do
      is_binary(values["body"]) -> values["body"]
      is_binary(values["body_file"]) -> File.read!(values["body_file"])
      true -> IO.iodata_to_binary(IO.read(:stdio, :eof))
    end
  end

  # ── Payload shapes ────────────────────────────────────────────────────────

  defp build_payload(:empty, _id, _values, _files), do: %{}

  defp build_payload(:project_create, _id, values, _files) do
    %{"name" => values["name"], "path" => File.cwd!()}
  end

  # Either filter: --project for one board, --path for every review on the
  # repository that directory belongs to. Neither given defaults to the working
  # directory, the common case.
  defp build_payload(:review_list, _id, values, _files) do
    case values["project"] do
      project when is_binary(project) ->
        %{"project_id" => project}

      _no_project ->
        path = if p = values["path"], do: Path.expand(p), else: File.cwd!()
        %{"path" => path}
    end
  end

  # `review create` picks its source from what's supplied: `--diff base..head`
  # (git-diff) XOR positional files (file-selection). Exactly one; --stack
  # attaches a review stack and only goes with --diff. The checkout is always
  # where the agent is standing.
  defp build_payload(:review_create, _id, values, files), do: review_create_payload(values, files)

  defp build_payload(:review_id, id, _values, _files), do: %{"review_id" => id}

  defp build_payload(:review_id_files, id, _values, files),
    do: %{"review_id" => id, "files" => files}

  defp build_payload(:review_rename, id, values, _files),
    do: %{"review_id" => id, "name" => values["name"]}

  # `set-stack` takes the stack branch as the single positional after the id.
  defp build_payload(:review_set_stack, id, _values, files) do
    %{"review_id" => id, "stack_ref" => one_of(files, "expected exactly one stack branch")}
  end

  defp build_payload(:review_export, id, values, _files) do
    Map.merge(%{"review_id" => id}, rounds(values))
  end

  defp build_payload(:review_wait, id, values, _files) do
    %{"review_id" => id}
    |> Map.merge(rounds(values))
    |> Map.merge(until_round(values))
  end

  defp build_payload(:review_notify, id, values, _files),
    do: %{"review_id" => id, "message" => values["message"]}

  # The anchor for `comment add`, from --line N-M (a file's line range) or
  # --hunk side:N-M (a diff artifact's hunk). Absent means an unanchored
  # comment about the artifact as a whole.
  defp build_payload(:comment_add, id, values, _files) do
    anchor = anchor(values)

    maybe_put(
      %{
        "review_id" => id,
        "path" => values["path"],
        "scope" => comment_scope(values, anchor),
        "critique_type" => critique_type(values)
      },
      "anchor",
      anchor
    )
  end

  defp build_payload(:comment_id, id, _values, _files), do: %{"comment_id" => id}

  # `react` takes its emoji as the single positional after the id. The agent
  # may use any emoji glyph; 👀 🤔 ✅ are just conventions.
  defp build_payload(:comment_reaction, id, _values, files) do
    %{
      "comment_id" => id,
      "emoji" => one_of(files, "expected exactly one emoji (e.g. 👀 working / 🤔 unsure / ✅ done)")
    }
  end

  defp build_payload(:reply_id, id, _values, _files), do: %{"reply_id" => id}

  defp build_payload(:reply_reaction, id, _values, files) do
    %{
      "reply_id" => id,
      "emoji" => one_of(files, "expected exactly one emoji (e.g. 👀 working / 🤔 unsure / ✅ done)")
    }
  end

  # An unknown option arrives with its leading dashes already; a known name
  # with a bad value arrives as a bare atom.
  defp flag("--" <> _rest = name), do: name
  defp flag(name) when is_atom(name), do: "--#{name}"

  # `review create` picks its source from what's supplied: `--diff base..head`
  # (git-diff) XOR positional files (file-selection). Exactly one; --stack
  # attaches a review stack and only goes with --diff. The checkout is always
  # where the agent is standing.
  defp review_create_payload(values, files) do
    base =
      maybe_put(
        %{"name" => values["name"], "project_path" => File.cwd!()},
        "project_id",
        string_or_nil(values["project"])
      )

    case values["diff"] do
      diff when is_binary(diff) -> diff_source(base, diff, values["stack"], files)
      _no_diff -> selection_source(base, values["stack"], files)
    end
  end

  defp diff_source(base, diff, stack, files) do
    if files != [], do: raise(UsageError, message: "give either files or --diff, not both")

    case Regex.run(~r/^(.+?)\.\.(.+)$/, diff) do
      [_whole, base_ref, head_ref] ->
        base
        |> Map.merge(%{"base_ref" => base_ref, "head_ref" => head_ref})
        |> maybe_put("stack_ref", stack)

      nil ->
        raise UsageError, message: "invalid --diff #{diff}; expected base..head"
    end
  end

  defp selection_source(base, stack, files) do
    unless stack == nil, do: raise(UsageError, message: "--stack needs --diff base..head")
    if files == [], do: raise(UsageError, message: "expected file args or --diff base..head")
    Map.put(base, "selections", files)
  end

  defp string_or_nil(value) when is_binary(value), do: value
  defp string_or_nil(_other), do: nil

  defp one_of([one], _message), do: one
  defp one_of(_other, message), do: raise(UsageError, message: message)

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  # The `rounds` payload value the backend `scope/1` reads: omitted (→ latest)
  # when neither flag is given; "all" for --all; [n, n] / [from, to] numbers
  # for --rounds. --all and --rounds are mutually exclusive.
  defp rounds(values) do
    all = values["all"] == true
    range = values["rounds"]

    cond do
      all and range != nil ->
        raise UsageError, message: "--all and --rounds are mutually exclusive"

      all ->
        %{"rounds" => "all"}

      range == nil ->
        %{}

      true ->
        case Regex.run(~r/^(\d+)(?:-(\d+))?$/, range) do
          # The optional group is absent from the match when it did not participate.
          [_whole, from] -> %{"rounds" => rounds_pair(from, from, range)}
          [_whole, from, to] -> %{"rounds" => rounds_pair(from, to, range)}
          nil -> raise UsageError, message: "invalid --rounds #{range}; expected N or N-M"
        end
    end
  end

  defp rounds_pair(from, to, range) do
    from_n = String.to_integer(from)
    to_n = String.to_integer(to)

    if to_n < from_n do
      raise UsageError, message: "invalid --rounds #{range}; expected from <= to"
    end

    [from_n, to_n]
  end

  # The `until_round` payload the backend `wait` reads: the submission round
  # the agent expects, so a round already submitted at call time returns at
  # once. Omitted when --until-round is absent.
  defp until_round(values) do
    case values["until_round"] do
      nil ->
        %{}

      raw ->
        case Integer.parse(raw) do
          {round, ""} when round >= 1 ->
            %{"until_round" => round}

          _invalid ->
            raise UsageError, message: "invalid --until-round #{raw}; expected a positive integer"
        end
    end
  end

  defp anchor(values) do
    line = values["line"]
    hunk = values["hunk"]

    if line != nil and hunk != nil,
      do: raise(UsageError, message: "--line and --hunk are mutually exclusive")

    cond do
      is_binary(line) ->
        {start_line, end_line} = line_range(line, "invalid --line #{line}; expected N or N-M")
        %{"type" => "line_range", "start_line" => start_line, "end_line" => end_line}

      is_binary(hunk) ->
        case Regex.run(~r/^(old|new):(.+)$/, hunk) do
          [_whole, side, range] ->
            {start_line, end_line} =
              line_range(range, "invalid --hunk #{hunk}; expected old:N-M or new:N-M")

            %{
              "type" => "diff_hunk",
              "side" => side,
              "start_line" => start_line,
              "end_line" => end_line
            }

          nil ->
            raise UsageError, message: "invalid --hunk #{hunk}; expected old:N-M or new:N-M"
        end

      true ->
        nil
    end
  end

  defp line_range(raw, message) do
    case Regex.run(~r/^(\d+)(?:-(\d+))?$/, raw) do
      [_whole, start] -> line_pair(start, start, message)
      [_whole, start, to] -> line_pair(start, to, message)
      nil -> raise UsageError, message: message
    end
  end

  defp line_pair(start, to, message) do
    start_n = String.to_integer(start)
    to_n = String.to_integer(to)
    if to_n < start_n, do: raise(UsageError, message: message)
    {start_n, to_n}
  end

  # A comment's scope follows from what it points at: an anchor makes it
  # located, --review-wide lifts it off the artifact, and the default sits on
  # the artifact.
  defp comment_scope(values, anchor) when is_map(anchor) do
    if values["review_wide"] == true,
      do: raise(UsageError, message: "--review-wide takes no --line/--hunk")

    "located"
  end

  defp comment_scope(values, _no_anchor) do
    if values["review_wide"] == true, do: "review", else: "artifact"
  end

  defp critique_type(values) do
    type = values["type"] || "note"

    if type not in @critique_types do
      raise UsageError,
        message: "invalid --type #{type}; expected one of #{Enum.join(@critique_types, ", ")}"
    end

    type
  end

  # ── Transport ─────────────────────────────────────────────────────────────

  # One round trip: POST the payload, print the JSON line, apply the exit-code
  # rules. Domain errors live in the JSON (`error` field) and keep exit 0,
  # except on verbs that opted into fail_on_error; transport failures and the
  # token gate fail non-zero.
  defp round_trip(spec, payload) do
    case request(spec, payload) do
      {:ok, line} ->
        if spec[:open], do: open_url(line)
        IO.write(line <> "\n")

        error = if fail_on_error?(spec, payload), do: result_error(line), else: nil

        if error do
          print_error(error)
          1
        else
          0
        end

      {:error, message} ->
        print_error(message)
        1
    end
  end

  defp fail_on_error?(spec, payload) do
    case spec[:fail_on_error] do
      :always -> true
      :stack -> payload["stack_ref"] != nil
      _never -> false
    end
  end

  # `wait` re-issues the request until the server returns a non-timeout
  # snapshot. The server blocks up to its poll window (~25 s) per call and then
  # answers %{"status" => "timeout"}; --timeout caps total wall-clock by
  # passing the remaining budget as `timeout_ms` for each call. Without
  # --timeout the loop waits forever — the caller is an agent waiting on a
  # human, so no submission just means "keep waiting".
  defp poll(spec, payload, values) do
    timeout_secs =
      case values["timeout"] do
        nil ->
          nil

        raw ->
          case Float.parse(raw) do
            {secs, ""} when secs >= 0 -> secs
            _invalid -> raise UsageError, message: "invalid --timeout #{raw}; expected seconds"
          end
      end

    deadline =
      if timeout_secs, do: System.monotonic_time(:millisecond) + trunc(timeout_secs * 1000)

    poll_loop(spec, payload, deadline)
  end

  defp poll_loop(spec, payload, deadline) do
    remaining =
      if deadline,
        do: max(deadline - System.monotonic_time(:millisecond), 0),
        else: nil

    call_payload =
      if remaining == nil, do: payload, else: Map.put(payload, "timeout_ms", remaining)

    case request(spec, call_payload, remaining) do
      {:ok, line} ->
        polled(spec, payload, deadline, line)

      {:error, message} ->
        print_error(message)
        1
    end
  end

  # A non-timeout answer ends the wait; a timeout answer ends it only when the
  # deadline has elapsed, and otherwise re-issues the call.
  defp polled(spec, payload, deadline, line) do
    cond do
      not timeout?(line) ->
        print(line)
        0

      deadline != nil and System.monotonic_time(:millisecond) >= deadline ->
        print(line)
        0

      true ->
        poll_loop(spec, payload, deadline)
    end
  end

  # The transport is one MFA over {port, path, token, body, timeout}: the real
  # HTTP client, or a stub in tests. The default timeout clears a full poll
  # window with slack; a deadline-aware call bounds itself to the remaining
  # budget plus slack so the final round reports its timeout rather than
  # dying mid-request.
  defp request(spec, payload, timeout_ms \\ nil) do
    body = Jason.encode!(payload)

    with {:ok, %{port: port, token: token}} <- Access.fetch(),
         {:ok, status, response} <-
           transport_post(port, route(spec), token, body, transport_timeout(timeout_ms)) do
      case status do
        200 ->
          {:ok, printable(response)}

        401 ->
          {:error, "unauthorized: the CLI token was rejected; restart the server to re-issue it"}

        other ->
          {:error, "request failed (HTTP #{other}): #{response}"}
      end
    else
      :error -> {:error, not_running()}
      {:error, _reason} -> {:error, not_running()}
    end
  end

  defp transport_post(port, path, token, body, timeout) do
    {module, function} = Application.get_env(:suikou, :cli_transport, @transport_default)
    apply(module, function, [port, path, token, body, timeout])
  end

  defp route(%{group: group, verb: verb} = spec), do: "/api/cli/#{group}/#{spec[:route] || verb}"

  # The dispatch spec of one lifecycle request: a `server` verb that takes no
  # input. One builder keeps every caller off a hand-written spec map.
  defp server_spec(verb, extra \\ %{}) do
    Map.merge(%{group: "server", verb: verb, payload: :empty}, extra)
  end

  # A deadline-aware call bounds itself to the remaining budget plus slack, so
  # the final wait round reports its timeout rather than dying mid-request; a
  # free-running call clears a full poll window with slack.
  defp transport_timeout(nil), do: 60_000

  defp transport_timeout(remaining_ms), do: remaining_ms + 5_000

  defp not_running do
    "Suikou is not running — start it first with `suikou`."
  end

  # The server's JSON re-encoded with \uXXXX escapes, byte-identical to the
  # line the old rpc transport printed (latin1-safe).
  defp printable(response) do
    response |> Jason.decode!() |> Jason.encode!(escape: :unicode_safe)
  end

  defp result_error(line) do
    case Jason.decode(line) do
      {:ok, %{"error" => error}} when is_binary(error) -> error
      _none -> nil
    end
  end

  defp timeout?(line) do
    match?({:ok, %{"status" => "timeout"}}, Jason.decode(line))
  end

  defp open_url(line) do
    case Jason.decode(line) do
      {:ok, %{"url" => url}} when is_binary(url) -> open_browser(url)
      _not_json -> :ok
    end
  end

  # ── Lifecycle commands ────────────────────────────────────────────────────

  # Top-level `suikou open`: the board root.
  defp open_root do
    round_trip(server_spec("url", %{open: true}), %{})
  end

  # `suikou start [--force] [--no-open]`: start the server as a background
  # daemon, then open the browser once it serves (the daemon itself never
  # opens it). `--force` stops an already-running daemon first and relaunches
  # it, instead of reattaching to the existing one. Returns once the server
  # answers — the daemon detaches itself.
  defp start_server(argv) do
    force = "--force" in argv or "-f" in argv
    open_browser? = "--no-open" not in argv

    case daemon_command() do
      {:ok, command} -> start_with(command, force, open_browser?)
      :error -> packaged_release_required()
    end
  end

  defp packaged_release_required do
    print_error("suikou start needs the packaged release (bin/suikou or the one-file executable)")
    1
  end

  defp start_with(command, true = _force, open_browser?) do
    case daemon_pid() do
      pid when is_binary(pid) ->
        print("force: stopping running daemon (pid #{pid})")

        case stop_server() do
          0 -> launch_daemon(command, open_browser?)
          code -> code
        end

      nil ->
        launch_daemon(command, open_browser?)
    end
  end

  defp start_with(command, false = _attach, open_browser?) do
    case daemon_pid() do
      pid when is_binary(pid) -> attach_running(pid, open_browser?)
      nil -> launch_daemon(command, open_browser?)
    end
  end

  # The daemon's OS pid through the CLI API, or nil when nothing answers.
  defp daemon_pid do
    case request(server_spec("pid"), %{}) do
      {:ok, line} -> Jason.decode!(line)["pid"]
      {:error, _not_running} -> nil
    end
  end

  # An already-running daemon attaches: report where it serves (waiting for the
  # port when it is still booting through migrations) and open it.
  defp attach_running(_pid, open_browser?) do
    case Access.fetch() do
      {:ok, %{port: port}} ->
        attach_port(port, open_browser?)

      :error ->
        print("already running — port unknown")
        0
    end
  end

  defp attach_port(port, open_browser?) do
    url = url_for_port(port)

    if up?(port) do
      if open_browser?, do: open_browser(url)
      print("already running at #{url}")
      0
    else
      print("already running — starting at #{url}")
      if wait_for_port(port, 20_000) and open_browser?, do: open_browser(url)
      0
    end
  end

  defp launch_daemon(command, open_browser?) do
    port = pick_port()
    url = url_for_port(port)

    case run_daemon(command, port) do
      0 -> daemon_started(port, url, open_browser?)
      exit_code -> daemon_failed(exit_code)
    end
  end

  defp daemon_started(port, url, open_browser?) do
    if wait_for_port(port, 20_000) do
      if open_browser?, do: open_browser(url)
      print("started at #{url}")
      0
    else
      print_error("started but not ready yet at #{url}; see the logs in #{log_dir()}")
      1
    end
  end

  defp daemon_failed(exit_code) do
    print_error("failed to start daemon (exit #{exit_code}); see the logs in #{log_dir()}")
    1
  end

  # How this install launches a daemon: the one-file executable through its
  # own path with `run` — the PBeam launcher of the boot sets
  # `PBEAM_EXECUTABLE` to it (#1286) — or a normal release through its own
  # `bin/suikou start`, the foreground node. `run_daemon/2` detaches either
  # one; neither uses run_erl or distributed Erlang.
  defp daemon_command do
    executable = System.get_env("PBEAM_EXECUTABLE") || System.get_env("SUIKOU_EXECUTABLE")

    cond do
      executable ->
        {:ok, [executable, "run"]}

      root = System.get_env("RELEASE_ROOT") ->
        bin = Path.join(root, "bin/suikou")

        if File.exists?(bin), do: {:ok, [bin, "start"]}, else: :error

      true ->
        :error
    end
  end

  # `sh` starts the server under nohup in the background, with its output
  # appended to the log, and exits at once; the server's path and words reach
  # `sh` as arguments, so no path needs quoting. The environment marks the
  # boot as the daemon (no browser, see `entry/2`), turns off distributed
  # Erlang, and drops the runtime config file of this CLI boot, so the release
  # script writes its own. The exit code is that of `sh`: non-zero only when
  # it cannot background the server.
  defp run_daemon(command, port) do
    File.mkdir_p!(log_dir())

    env = [
      {"PORT", Integer.to_string(port)},
      {"PHX_SERVER", "true"},
      {"PHX_HOST", System.get_env("PHX_HOST") || "localhost"},
      {"SUIKOU_DATA_DIR", Access.data_dir()},
      {@daemon_env, "1"},
      {"RELEASE_DISTRIBUTION", "none"},
      {"RELEASE_SYS_CONFIG", nil},
      {"RELEASE_TMP", Path.join(Access.data_dir(), "tmp")}
    ]

    script = ~s(log="$1"; shift; nohup "$@" </dev/null >>"$log" 2>&1 &)
    log = Path.join(log_dir(), "suikou.log")

    {_output, exit_code} =
      System.cmd("sh", ["-c", script, "sh", log | command], env: env, stderr_to_stdout: true)

    exit_code
  end

  # Honor an explicit PORT; otherwise the configured port (config.toml `port`,
  # defaulting to the base port), failing loudly when it is occupied rather
  # than drifting to an unpredictable port.
  defp pick_port do
    case System.get_env("PORT") do
      nil ->
        port = configured_port()

        if up?(port) do
          raise UsageError,
            message: "port #{port} is in use; stop whatever is using it or set PORT to override"
        end

        port

      explicit ->
        case Integer.parse(explicit) do
          {port, ""} when port in 1..65_535 ->
            port

          _invalid ->
            raise UsageError, message: "invalid PORT #{explicit}; expected an integer in 1-65535"
        end
    end
  end

  defp configured_port do
    config_home = System.get_env("XDG_CONFIG_HOME") || Path.join(System.user_home!(), ".config")
    path = Path.join(config_home, "suikou/config.toml")

    with {:ok, raw} <- File.read(path),
         {:ok, cfg} <- Toml.decode(raw),
         port when is_integer(port) and port in 1..65_535 <- cfg["port"] do
      port
    else
      _fallback -> 47_100
    end
  end

  defp log_dir, do: Path.join([Access.data_dir(), "tmp", "log"])

  defp wait_for_port(port, timeout_ms) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms

    if up?(port) do
      true
    else
      if System.monotonic_time(:millisecond) >= deadline do
        false
      else
        Process.sleep(150)
        wait_for_port(port, timeout_ms)
      end
    end
  end

  # The CLI opens the browser before it returns: the node stops right after
  # the verb, so an `open` left to a spawned process could die unrun. A host
  # without `open` gets a warning, not a crash of the verb.
  defp open_browser(url) do
    case System.find_executable("open") do
      nil -> print_error("cannot open #{url}: no `open` command on this host")
      open -> System.cmd(open, [url])
    end

    :ok
  end

  # `suikou stop`: ask the server to stop, then wait for it to actually vanish
  # so a follow-up start/status sees a clean state. A refused connection means
  # nothing is running, which also succeeds.
  defp stop_server do
    case request(server_spec("stop"), %{}) do
      {:ok, _line} ->
        if wait_until_gone(10_000) do
          print("stopped")
          0
        else
          print_error("failed to stop: the server is still running after 10s")
          1
        end

      {:error, _not_running} ->
        print("not running")
        0
    end
  end

  defp status_server do
    case request(server_spec("pid"), %{}) do
      {:ok, line} ->
        report_status(Jason.decode!(line)["pid"])

      {:error, _not_running} ->
        print("not running")
        0
    end
  end

  defp report_status(pid) do
    case Access.fetch() do
      {:ok, %{port: port}} ->
        report_port(pid, port)

      :error ->
        print("running (pid #{pid}) — port unknown")
        0
    end
  end

  defp report_port(pid, port) do
    url = url_for_port(port)

    if up?(port) do
      print("running (pid #{pid}) at #{url}")
    else
      print("starting (pid #{pid}), port #{port} not yet reachable")
    end

    0
  end

  @doc """
  The user-facing URL of the server on `port`. Reflects `PHX_HOST`, so a
  non-default host such as a Tailscale MagicDNS name is what the CLI prints and
  opens. Liveness probing stays on 127.0.0.1 — only the displayed URL uses the
  host.
  """
  @spec url_for_port(:inet.port_number()) :: String.t()
  def url_for_port(port) do
    "http://#{System.get_env("PHX_HOST") || "localhost"}:#{port}"
  end

  defp wait_until_gone(timeout_ms) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms

    case Access.fetch() do
      {:ok, %{port: port}} -> wait_until_gone(port, deadline)
      :error -> true
    end
  end

  defp wait_until_gone(port, deadline) do
    if up?(port) do
      if System.monotonic_time(:millisecond) >= deadline do
        false
      else
        Process.sleep(150)
        wait_until_gone(port, deadline)
      end
    else
      true
    end
  end

  @doc """
  Whether the server answers on `port` at `127.0.0.1` — a liveness probe.

  One HTTP request to the board, so the probe uses the same transport as a CLI
  call instead of opening a socket of its own (see `SuikouWeb.CLI.HTTP`).
  """
  @spec up?(:inet.port_number()) :: boolean()
  def up?(port), do: HTTP.up?(port)

  # `suikou skill [--output <path>] [-o <path>] [--force]`: emit the agent
  # skill markdown baked into the release. Server-independent.
  defp emit_skill(argv) do
    {parsed, _positionals, invalid} =
      OptionParser.parse(argv, strict: [output: :string, force: :boolean], aliases: [o: :output])

    if invalid != [] do
      print_error(
        "usage: suikou skill [--output <path>] [--force]\n  output the agent CLI skill markdown"
      )

      1
    else
      markdown = skill_doc()
      out = parsed[:output]

      cond do
        out == nil ->
          IO.write(markdown)
          0

        File.exists?(out) and parsed[:force] != true ->
          print_error("#{out} already exists; pass --force to overwrite")
          1

        true ->
          File.mkdir_p!(Path.dirname(out))
          File.write!(out, markdown)
          print(out)
          0
      end
    end
  end

  defp skill_doc do
    :suikou
    |> :code.priv_dir()
    |> Path.join("agent_skill.md")
    |> File.read!()
  end

  # ── Usage ─────────────────────────────────────────────────────────────────

  defp summarize(spec) do
    if spec[:identity] do
      "#{spec.summary} --as <name> [--icon <emoji>]"
    else
      spec.summary
    end
  end

  @doc """
  The usage text, generated from the registry so there is a single source of
  truth: `usage/0` lists everything, `usage/1` a group, `usage/2` one verb.
  """
  @spec usage(String.t() | nil, String.t() | nil) :: String.t()

  def usage(group \\ nil, verb \\ nil)

  def usage(group, verb) when is_binary(group) and is_binary(verb) do
    case @registry[group][verb] do
      nil -> usage(group)
      spec -> "usage: suikou #{group} #{verb}\n  #{summarize(spec)}"
    end
  end

  def usage(group, _no_verb) when is_binary(group) do
    case @registry[group] do
      nil ->
        usage()

      verbs ->
        lines =
          Enum.map(verbs, fn {name, spec} ->
            "  #{group} #{String.pad_trailing(name, 12)} #{summarize(spec)}"
          end)

        IO.iodata_to_binary(["usage: suikou #{group} <verb>\n", Enum.join(lines, "\n")])
    end
  end

  def usage(nil, _no_verb) do
    lifecycle =
      "  (bare)        start the foreground server and open the browser\n" <>
        "  start [--force] [--no-open]  start the background daemon (--force relaunches; --no-open skips the browser)\n" <>
        "  stop|status         background daemon control\n" <>
        "  open                open the Suikou board in the browser\n" <>
        "  wait <review-id>    alias for `review wait`\n" <>
        "  version             print the build identifier\n" <>
        "  skill [-o <path>]   output the agent CLI skill markdown"

    groups =
      @registry
      |> Enum.flat_map(fn {group, verbs} ->
        Enum.map(verbs, fn {name, spec} ->
          "  #{String.pad_trailing("#{group} #{name}", 20)} #{summarize(spec)}"
        end)
      end)
      |> Enum.join("\n")

    "usage: suikou <command>\n\nlifecycle:\n#{lifecycle}\n\ncommands:\n#{groups}"
  end
end
