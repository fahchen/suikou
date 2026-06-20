import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { ProjectBoard } from "../review/ProjectBoard"
import { reviewFileTarget } from "../review/review-navigation"

export const Route = createFileRoute("/")({
  component: BoardRoute
})

function BoardRoute() {
  const navigate = useNavigate()
  return (
    <ProjectBoard
      onOpen={(reviewId, path) =>
        void navigate(reviewFileTarget(reviewId, path, false))
      }
    />
  )
}
