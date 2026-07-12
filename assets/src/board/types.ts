import type { CommandReply, StoreProxy } from "@musubi/react"

export type BoardStore = StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>
export type LoadBoardReply = CommandReply<
  "SuikouWeb.Stores.ProjectBoardStore",
  "load_board",
  Musubi.Stores
>
export type BoardProject = LoadBoardReply["projects"][number]
export type BoardReview = BoardProject["reviews"][number]
export type ReviewFilesGrouped = LoadBoardReply["review_files"]
export type BoardReviewFile = ReviewFilesGrouped[number]["files"][number]
