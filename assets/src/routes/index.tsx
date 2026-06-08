import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { ProjectBoard } from "../review/ProjectBoard"

export const Route = createFileRoute("/")({
  component: BoardRoute
})

function BoardRoute() {
  const navigate = useNavigate()
  return (
    <ProjectBoard
      onOpen={(artifactId) =>
        void navigate({ to: "/review/$artifactId", params: { artifactId } })
      }
    />
  )
}
