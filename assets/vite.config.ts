import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss()
  ],
  // Musubi's @musubi/client / @musubi/react are consumed as TypeScript source
  // via `file:` deps and symlinked into node_modules. Without this, Rollup
  // resolves their realpath under ../deps/musubi and can't find react/etc.
  resolve: { preserveSymlinks: true },
  build: {
    outDir: "../priv/static/assets",
    emptyOutDir: true,
    manifest: true
  },
  server: {
    proxy: {
      "/socket": {
        target: "ws://localhost:4000",
        ws: true
      }
    }
  }
})
