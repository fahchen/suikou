/**
 * Max height (with vertical scroll) shared by the review's file tree in its two
 * board incarnations: the edit-files picker (`FileTree`) and the read-only
 * expanded preview (`ReviewFileTree`). One constant keeps the two caps in sync
 * so a long file list scrolls inside its own container instead of pushing the
 * page, identically in both views.
 */
export const FILE_TREE_SCROLL = "max-h-72 overflow-y-auto"
