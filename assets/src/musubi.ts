import { Socket } from "phoenix"
import { createMusubi } from "@musubi/react"

export const socket = new Socket("/socket")

export const {
  MusubiProvider,
  useMusubiConnectionStatus,
  useMusubiRoot,
  useMusubiSnapshot,
  useMusubiCommand
} = createMusubi<Musubi.Stores>()
