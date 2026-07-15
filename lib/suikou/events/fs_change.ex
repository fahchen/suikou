defmodule Suikou.Events.FsChange do
  @moduledoc """
  Filesystem-change payload broadcast by `Suikou.Events.fs_changed/3`.

  A named, typed message the file-forwarding stores pattern-match on, carrying
  the review it belongs to, the review-relative `rel_path` that changed, and
  whether that path still exists (`false` for a deletion).
  """

  use TypedStructor

  typed_structor enforce: true do
    field(:review_id, String.t())
    field(:rel_path, String.t())
    field(:exists?, boolean())
  end
end
