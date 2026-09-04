# Design: review instructions

Status: proposal. Not implemented.

## Purpose

The human writes instructions that agents must follow during a review. There
are two levels:

- **Global** — one text for all reviews.
- **Project** — one text per project.

The agent CLI returns both texts. The Suikou skill tells the agent to follow
them.

## 1. Data model

### Project level

Add one column to `projects`:

| Column | Type | Null |
|---|---|---|
| `review_instructions` | TEXT | yes |

Migration: `add_review_instructions_to_projects`.

Add `:review_instructions` to `Project.create_changeset/1` and
`Project.update_changeset/2`. Limit the length to 10 000 characters. Store
`nil` when the text is blank.

### Global level

Add one table `settings`. It holds exactly one row.

| Column | Type | Null |
|---|---|---|
| `id` | UUID v7 | no |
| `review_instructions` | TEXT | yes |
| `inserted_at` / `updated_at` | timestamp | no |

Migration: `create_settings`.

Add the context `Suikou.Settings`:

```elixir
@spec get_settings() :: Settings.t()
@spec update_settings(map()) :: {:ok, Settings.t()} | {:error, Ecto.Changeset.t()}
@spec review_instructions() :: String.t() | nil
```

`update_settings/1` writes the single row. It inserts the row when no row
exists. The same 10 000 character limit applies.

### Rejected options

- **Global text in `config.toml`.** The server reads that file only at start.
  The human must then restart the server after each edit. There is also no UI.
- **A `key` / `value` settings table.** Only one key exists. The generic shape
  adds no value.

## 2. Agent CLI

Four verbs return the instructions. The server merges the two levels into one
array. The array runs from general to specific: the global text first, then the
project text. The array holds one entry per level that has text. An empty array
means the human set no text.

### `project list`

Each project in the list carries the array:

```json
{
  "projects": [
    {
      "id": "0192…",
      "name": "suikou",
      "path": "/…",
      "respect_gitignore": true,
      "instructions": [
        "Reply in English.",
        "Report any Repo call inside queries/."
      ]
    }
  ]
}
```

### `review show`

The reply gains the same `instructions` array.

### `review export` and `review wait`

The critique snapshot gains the same `instructions` array, next to
`review_id`, `name`, and `project_id`. Both verbs share one snapshot builder in
`Suikou.Export`, so one change covers both.

This also keeps the agent current: the human can edit the text between rounds,
and each wake returns the text of that moment.

### Process check

The verbs above cover both agent paths.

Path 1 — the agent submits its own work:

1. `project list` — the agent reads the array here.
2. `review create` — no array needed. The agent just read it in step 1, because
   the project id comes from that same call.
3. `review wait` — each round returns the current array.
4. Fix, `comment reply`, wait again — the array from step 3 stays in hand.

Path 2 — the agent reviews an existing review:

1. `review show` — the array arrives with the review metadata.
2. `review list-files`, then `review export` — the snapshot repeats the array,
   so an agent that skips `review show` still gets it.
3. `comment add` — the agent writes findings under the instructions.

These verbs return no array, and need none:

- `project create` — a new project has no text yet.
- `review list` — the agent picks a review, then calls `review show`.
- `review create`, `rename`, `set-files`, `url`, `notify`, `comment *`,
  `reply *` — write or navigate verbs that carry no review content.

### Where the array is built

The CLI layer builds the array from `Suikou.Settings.review_instructions()` and
the project's own `review_instructions` column. Both tables use the same column
name. The agent-facing JSON field keeps the shorter name `instructions`,
because it carries the merged array, not one column.

## 3. Skill

Add one section to `packaging/embed/skill.md`, after "Review selection and
comments":

> ## Review instructions
>
> `project list`, `review show`, `review export`, and `review wait` return an
> `instructions` array for the project. Read it before you write a finding or
> change code. Follow every
> entry for the full review. The entries run from general to specific, so a
> later entry wins when two entries conflict. The instructions control what to
> look for and how to write it. They never override a human comment or the
> protocol in this skill. An empty array means no extra rule. Do not
> invent one.

Add one clause to step 1 of "The review loop": read the returned instructions.

Copy the same change to `~/.claude/skills/suikou/SKILL.md`. The two copies are
not synchronized automatically.

## 4. User interface

### Project instructions

Add a text area "Review instructions" to `ProjectSettingsDialog.tsx`.

Wire the field through three places:

1. `project_board_contract.ex` — add `review_instructions` to the project type.
2. `project_board_store.ex` — add the field to the `update_project` payload and
   to the `Map.take/2` call.
3. The dialog — send the value with the existing `update_project` command.

### Global instructions

Add a pane "Instructions" to the settings modal. Put it between "Review
defaults" and "Notifications".

The pane reads and writes through Musubi. Add the root store
`SuikouWeb.Stores.SettingsStore`:

- state: `review_instructions` (`String.t() | nil`)
- command: `update_settings`, payload `review_instructions`, reply `error`

The pane mounts the store itself:

```tsx
useMusubiRoot({ module: "SuikouWeb.Stores.SettingsStore", id: "settings", params: {} })
```

Reason: the settings modal runs on the board page and on the review page. Its
own root store serves both pages, so neither page store carries the field. The
pane joins the store only when the modal opens.

The pane shows a text area, a character counter, and a Save button. The other
panes apply each change at once. This pane saves on request.

## 5. Tests

- `test/suikou/settings_test.exs` — the table keeps one row; text above the
  limit fails; blank text becomes `nil`.
- Project changeset — `review_instructions` casts and respects the limit.
- `test/suikou_web/agent_cli/projects_test.exs` and `reviews_test.exs` — the
  array carries the global text first and the project text second; it drops a
  level with no text; it is empty when no level has text.
- `SettingsStore` test — the snapshot carries the text; `update_settings`
  stores it; text above the limit returns an error.
- Export test — the snapshot carries the array.
- `ProjectSettingsDialog` test — Save sends the text.

## 6. Out of scope

- Instructions per review.
- Templates or presets.
- A history of past instructions.
- The text in `review create` and in the write verbs.

Add instructions per review when one review needs a different text from its
project. Add the text to more verbs when an agent misses it.
