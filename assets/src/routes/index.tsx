import { createFileRoute } from "@tanstack/react-router"

import { ProjectsBoard } from "../board/ProjectsBoard"

export const Route = createFileRoute("/")({
  component: ProjectsBoard,
})
