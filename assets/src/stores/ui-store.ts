import { makeAutoObservable } from "mobx"

/**
 * Ephemeral, client-only UI state. Server-owned data lives in Musubi stores;
 * MobX is reserved for transient interaction state (open panels, draft input,
 * optimistic toggles) that never needs to round-trip to the server.
 */
export class UiStore {
  pendingAmount = 1

  constructor() {
    makeAutoObservable(this)
  }

  setPendingAmount(amount: number): void {
    this.pendingAmount = Number.isFinite(amount) ? amount : 0
  }
}

export const uiStore = new UiStore()
