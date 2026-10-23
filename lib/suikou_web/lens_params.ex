defmodule SuikouWeb.LensParams do
  @moduledoc """
  Parses a review-read lens from its string params — the `view`, `scope`, and
  `worktree` query keys the review read endpoints take — into a
  `Suikou.Reviews.lens()`. One parser, so every entry point that reads through a
  lens validates it the same way (BDR-0024, BDR-0028).

  `?scope=all` (default) | `?scope=commits:<sha>[,<sha>...]` | `?worktree=diff`
  (default) | `?worktree=staged` | `?worktree=unstaged` | `?view=source`
  (default) | `?view=stack`. Missing keys keep the pinned `base_ref...head_ref`
  diff (the default lens, `%{}`). `commits` carries a newest-first hex SHA list
  (each 4-64 hex chars), matching `Suikou.Reviews.list_diff_commits/2`'s order
  for the chosen view.
  """

  alias Suikou.Reviews

  @typedoc "Why a lens's params were rejected."
  @type error() ::
          :invalid_scope
          | :invalid_worktree
          | :invalid_view
          | :invalid_scope_worktree_combination

  @doc """
  Parses `params` (string keys) into a lens, leaving defaults out so the default
  lens is `%{}`. A commit scope or the stack view pins the diff to commits, so
  neither combines with a working-tree worktree.

  ## Examples

      iex> SuikouWeb.LensParams.parse(%{})
      {:ok, %{}}

      iex> SuikouWeb.LensParams.parse(%{"view" => "stack", "scope" => "commits:ABCD"})
      {:ok, %{scope: {:commits, ["abcd"]}, view: :stack}}

      iex> SuikouWeb.LensParams.parse(%{"view" => "stack", "worktree" => "staged"})
      {:error, :invalid_scope_worktree_combination}

      iex> SuikouWeb.LensParams.parse(%{"scope" => "commits:not-a-sha"})
      {:error, :invalid_scope}

  """
  @spec parse(%{optional(String.t()) => String.t()}) :: {:ok, Reviews.lens()} | {:error, error()}
  def parse(params) do
    with {:ok, scope} <- parse_scope(Map.get(params, "scope")),
         {:ok, worktree} <- parse_worktree(Map.get(params, "worktree")),
         {:ok, view} <- parse_view(Map.get(params, "view")) do
      lens =
        %{}
        |> maybe_put(:scope, scope, :all)
        |> maybe_put(:worktree, worktree, :diff)
        |> maybe_put(:view, view, :source)

      pinned? = match?({:commits, [_first | _rest]}, scope) or view == :stack

      if pinned? and worktree in [:staged, :unstaged] do
        {:error, :invalid_scope_worktree_combination}
      else
        {:ok, lens}
      end
    end
  end

  defp parse_scope(nil), do: {:ok, :all}
  defp parse_scope("all"), do: {:ok, :all}

  defp parse_scope("commits:" <> rest) when byte_size(rest) > 0 do
    shas = String.split(rest, ",", trim: true)

    if shas != [] and Enum.all?(shas, &(&1 =~ ~r/^[a-f0-9]{4,64}$/i)),
      do: {:ok, {:commits, Enum.map(shas, &String.downcase/1)}},
      else: {:error, :invalid_scope}
  end

  defp parse_scope(_other), do: {:error, :invalid_scope}

  defp parse_worktree(nil), do: {:ok, :diff}
  defp parse_worktree("diff"), do: {:ok, :diff}
  defp parse_worktree("staged"), do: {:ok, :staged}
  defp parse_worktree("unstaged"), do: {:ok, :unstaged}
  defp parse_worktree(_other), do: {:error, :invalid_worktree}

  defp parse_view(nil), do: {:ok, :source}
  defp parse_view("source"), do: {:ok, :source}
  defp parse_view("stack"), do: {:ok, :stack}
  defp parse_view(_other), do: {:error, :invalid_view}

  defp maybe_put(map, _key, default, default), do: map
  defp maybe_put(map, key, value, _default), do: Map.put(map, key, value)
end
