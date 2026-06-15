defmodule Suikou.Repo.Migrations.BackfillGitDiffCreationShas do
  use Ecto.Migration

  alias Suikou.Git
  alias Suikou.Repo

  # The git-diff review source now pins `base_sha`/`head_sha` at creation so the
  # board can flag "refs moved since" (see BDR-0020). Pre-existing rows have
  # neither field on their JSON `source`. Backfill them with the CURRENT
  # resolved SHA — lossy by design (the original creation commit is
  # unrecoverable), so existing reviews read as "not moved" until the ref
  # next advances. Refs that no longer resolve (deleted branch, etc.) leave
  # the SHA null; the render treats null as "unknown — don't flag".
  def up do
    flush()

    %{rows: rows} =
      Repo.query!("""
      SELECT r.id, r.source, p.path FROM reviews r
      JOIN projects p ON p.id = r.project_id
      WHERE json_extract(r.source, '$.__type__') = 'git_diff'
        AND (json_extract(r.source, '$.base_sha') IS NULL
             OR json_extract(r.source, '$.head_sha') IS NULL)
      """)

    for [id, source_json, project_path] <- rows do
      source = JSON.decode!(source_json)
      base_sha = source["base_sha"] || resolve(project_path, source["base_ref"])
      head_sha = source["head_sha"] || resolve(project_path, source["head_ref"])
      next_source = Map.merge(source, %{"base_sha" => base_sha, "head_sha" => head_sha})

      Repo.query!(
        "UPDATE reviews SET source = ? WHERE id = ?",
        [JSON.encode!(next_source), id]
      )
    end
  end

  def down, do: :ok

  defp resolve(path, ref) when is_binary(ref) do
    case Git.rev_parse(path, ref) do
      {:ok, sha} -> sha
      {:error, _reason} -> nil
    end
  end

  defp resolve(_path, _ref), do: nil
end
