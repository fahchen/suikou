This is an API-only application written using the Phoenix web framework, with a
server-authoritative Musubi runtime and a separate React frontend under `assets/`.

## Project guidelines

- **English only.** Everything committed to this project is in English — code, comments, identifiers, commit messages, PR descriptions, docs, and the BDD spec (`spec/`, glossary, BDRs). Chat with the user in their language, but never write non-English content into the repository.
- Use `mix precommit` alias when you are done with all changes and fix any pending issues
- Use the already included and available `:req` (`Req`) library for HTTP requests, **avoid** `:httpoison`, `:tesla`, and `:httpc`. Req is included by default and is the preferred HTTP client for Phoenix apps

## Git guidelines

- **Keep commits small.** One commit per logical change — a schema/migration, a single context module, a feature's tests, etc. Avoid bundling unrelated changes into one commit. Smaller commits review better and revert cleanly.

## Architecture guidelines

- **Never** add functions, modules, or delegations that are not yet used by any caller — introduce them when the first caller needs them
- Context sibling files are named by business responsibility (e.g. `submission.ex`, `verdicts.ex`, `discussion.ex`) — **never** by CRUD (`commands.ex`, `finders.ex`)
- **Function ordering:** public functions first, each followed immediately by its private helpers. A private function serving multiple public functions goes below all of them; private functions are ordered by call sequence
- Extract composable `Ecto.Query` builders into a `queries/` subdirectory — these return `Ecto.Query.t()` only and **never** hit `Repo`. Each queries module exposes a zero-arity `base()` returning the starting query with its named binding; composable builders default to `query \\ base()`. Never apply `base()` inside a builder body, and never expose `base/1` that accepts a queryable
