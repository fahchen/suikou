import { createFileRoute } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"
import type { StoreProxy } from "@musubi/react"

import { useMusubiRoot, useMusubiSnapshot, useMusubiCommand } from "../musubi"
import { uiStore } from "../stores/ui-store"

export const Route = createFileRoute("/")({
  component: HomePage
})

type CounterProxy = StoreProxy<"SuikouWeb.Stores.CounterStore", Musubi.Stores>

const CounterPanel = observer(function CounterPanel(props: { store: CounterProxy }) {
  const snapshot = useMusubiSnapshot(props.store)
  const increment = useMusubiCommand(props.store, "increment")

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-6xl font-mono tabular-nums">{snapshot.count}</p>

      <div className="flex items-center gap-2">
        <input
          type="number"
          className="w-20 rounded border border-gray-300 px-2 py-1"
          value={uiStore.pendingAmount}
          onChange={(e) => uiStore.setPendingAmount(e.target.valueAsNumber)}
        />
        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-50"
          disabled={increment.isPending}
          onClick={() => void increment.dispatch({ amount: uiStore.pendingAmount })}
        >
          Increment
        </button>
      </div>

      {increment.error && (
        <p className="text-sm text-red-600">{increment.error.message}</p>
      )}
    </div>
  )
})

function HomePage() {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.CounterStore",
    id: "main",
    params: { count: 0 }
  })

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold">Suikou</h1>

      {root.status === "loading" && <p className="text-gray-500">Connecting…</p>}
      {root.status === "error" && (
        <p className="text-red-600">{root.error.message}</p>
      )}
      {root.status === "ready" && <CounterPanel store={root.store} />}
    </main>
  )
}
