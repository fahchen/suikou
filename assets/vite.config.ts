import { fileURLToPath } from "node:url"

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
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  // @musubi/react is consumed as TS source, so its CJS dependency
  // `use-sync-external-store/shim/with-selector` isn't pre-bundled by default
  // and Vite serves it without named-export interop. Force-include it.
  optimizeDeps: {
    include: ["use-sync-external-store/shim/with-selector", "use-sync-external-store/shim"]
  },
  build: {
    // index.html -> priv/static/index.html, hashed JS/CSS -> priv/static/assets/.
    // emptyOutDir is false because priv/static also holds committed static files
    // (favicon.ico, robots.txt, fonts/, images/); the package task clears stale
    // hashed bundles before building.
    outDir: "../priv/static",
    assetsDir: "assets",
    emptyOutDir: false,
    manifest: true
  },
  server: {
    host: true,
    allowedHosts: [".ts.net"],
    proxy: {
      "/socket": {
        target: "ws://localhost:4710",
        ws: true
      },
      "/api": {
        target: "http://localhost:4710"
      }
    }
  }
})
