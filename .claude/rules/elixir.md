---
description: Elixir, Ecto, and ExUnit conventions for this repo
paths:
  - "lib/**"
  - "test/**"
  - "config/**"
  - "priv/**"
  - "*.exs"
---

## Elixir guidelines

- **Always** use `TypedStructor` to define structs, records, and exceptions. It generates the struct, `@type t()`, and `@enforce_keys` from a single block; select the target with the `:definer` option (`:defstruct` by default, `:defexception`, or `:defrecord`)
- **Never** nest multiple modules in the same file as it can cause cyclic dependencies and compilation errors
- **Never** use map access syntax (`changeset[:field]`) on structs as they do not implement the Access behaviour by default. For regular structs, you **must** access the fields directly, such as `my_struct.field` or use higher level APIs that are available on the struct if they exist, `Ecto.Changeset.get_field/2` for changesets
- Elixir's standard library has everything necessary for date and time manipulation. Familiarize yourself with the common `Time`, `Date`, `DateTime`, and `Calendar` interfaces by accessing their documentation as necessary. **Never** install additional dependencies unless asked or for date/time parsing (which you can use the `date_time_parser` package)
- Don't use `String.to_atom/1` on user input (memory leak risk)
- Predicate function names should not start with `is_` and should end in a question mark. Names like `is_thing` should be reserved for guards
- **Lookup naming:** `get_` returns `Schema.t() | nil`, `fetch_` returns `{:ok, Schema.t()} | :error` — never mix the two
- Use `Task.async_stream(collection, callback, options)` for concurrent enumeration with back-pressure. The majority of times you will want to pass `timeout: :infinity` as option
- **Every public function must carry a `@doc`** describing what it does, with at least one `## Examples` block. Use `iex>` prompts **only** for examples that are actually runnable as doctests (pure, no `Repo`/fixtures) so they can be exercised by `doctest`; for examples that hit `Repo` or need setup, use a plain (non-`iex>`) code block with `#=>` marking the return value. Private functions (`defp`) do not need docs.
- **Always include parentheses** when referencing types and zero-arity functions, both in code and prose: write `@type t()` not `@type t`, `list_artifacts()` not `list_artifacts`, `defdelegate list_artifacts(), to: Reads` not `defdelegate list_artifacts`
- **Always** use `params` as the parameter name for changeset/function input — never `attrs`
- **Always** use `@typep` for types only used within the module — never expose types without external callers
- **Always** use concrete types in specs — never `term()`, `any()`, or bare `atom()`. Error reasons should be specific atom unions, and return values should name the actual struct/type
- **Always** use the `JSON` module (Elixir 1.18+ stdlib) for encode/decode — never `Jason`
- **Always** use `System.fetch_env!` for required environment variables — never `System.get_env` with an empty default for credentials

## Test guidelines

- **Always use `start_supervised!/1`** to start processes in tests as it guarantees cleanup between tests
- **Avoid** `Process.sleep/1` and `Process.alive?/1` in tests
  - Instead of sleeping to wait for a process to finish, **always** use `Process.monitor/1` and assert on the DOWN message:

      ref = Process.monitor(pid)
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}

   - Instead of sleeping to synchronize before the next call, **always** use `_ = :sys.get_state/1` to ensure the process has handled prior messages
- **Always** use pattern matching in test assertions — never `assert x.field == value`
- **Test ordering:** test cases (`describe`/`test`) at the top, helpers and setup at the bottom. Use `setup` and `@tag` to organize preparation — avoid inline helper calls
- **Never** seed global/shared data in tests or `test_helper.exs` — each test inserts the rows it needs explicitly
- **Never** use `Application.put_env` for shared or cross-test keys — put those test values in `config/test.exs`

## Ecto guidelines

- **Always** use `EctoTypedSchema` to define Ecto schemas. It infers `@type t()` from the field definitions; replace `use Ecto.Schema` with `use EctoTypedSchema` and `schema`/`embedded_schema` with `typed_schema`/`typed_embedded_schema`
- **Always** preload Ecto associations in queries when they'll be accessed later, ie a message that needs to reference the `message.user.email`
- **Always** use named bindings in Ecto queries (`[comment: c]`) — never positional (`[c]`)
- **Always** cast external input through a changeset first, then read validated fields from the changeset — never pattern-match on raw params maps
- State-transition fields (status, timestamps like `resolved_round`) must only be set through dedicated changesets — never via generic `cast` fields
- `Ecto.Changeset.validate_number/2` **DOES NOT SUPPORT the `:allow_nil` option**. By default, Ecto validations only run if a change for the given field exists and the change value is not nil, so such as option is never needed
- Fields which are set programmatically, such as `user_id`, must not be listed in `cast` calls or similar for security purposes. Instead they must be explicitly set when creating the struct
- **Always** invoke `mix ecto.gen.migration migration_name_using_underscores` when generating migration files, so the correct timestamp and conventions are applied
