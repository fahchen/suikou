import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  // Mirror vite.config.ts: @musubi/* are TS-source `file:` deps symlinked into
  // node_modules; without preserveSymlinks their realpath under ../deps/musubi
  // can't resolve react/etc.
  resolve: { preserveSymlinks: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"]
  }
})
