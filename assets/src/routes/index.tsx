import { createFileRoute } from "@tanstack/react-router"

import { ReviewApp } from "../review/ReviewApp"

export const Route = createFileRoute("/")({
  component: ReviewApp
})
