import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // App-shell service worker. iOS Safari evicts a backgrounded tab and forces a
    // full reload on return; precaching the built shell makes that reload paint
    // from cache instead of refetching index.html + JS over the network.
    VitePWA({
      registerType: "autoUpdate",
      // sw.js + manifest.webmanifest land at priv/static root. The Phoenix
      // endpoint's "/" Plug.Static only serves files listed in static_paths(),
      // and SpaController treats anything else as a client route and returns the
      // SPA shell — so both names are registered there. inlineWorkboxRuntime
      // keeps the workbox runtime inside sw.js so there's no hashed second file
      // to register.
      workbox: {
        inlineWorkboxRuntime: true,
        // Precache only the shell (index.html + entry CSS). The JS lives in
        // hundreds of hash-named, lazy-loaded grammar/shiki chunks (~15 MB), so
        // precaching them all would bloat every SW install. They're immutable
        // (content-hashed URLs), so a CacheFirst runtime cache serves them from
        // disk on a forced reload while a new hash always bypasses the stale one.
        globPatterns: ["index.html", "assets/*.css"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/socket/],
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "suikou-assets",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      manifest: {
        name: "Suikou",
        short_name: "Suikou",
        display: "standalone",
        start_url: "/",
        theme_color: "#f5f6f7",
        background_color: "#f5f6f7",
        icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }]
      },
      // Off in dev so the SW never shadows Vite HMR on :5173.
      devOptions: { enabled: false }
    })
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
    manifest: true,
    // Emit .map files for the Phoenix-served prod bundle (dev already has maps).
    // Note: the browser does NOT remap a programmatically-read error.stack, so
    // the overlay's copied stack stays at minified positions in prod — resolve
    // it offline / in DevTools with these maps. Runtime remap would need a dep.
    sourcemap: true
  },
  // The highlight worker dynamic-imports Shiki grammars, so its bundle
  // code-splits — unsupported by the default "iife" worker format.
  worker: { format: "es" },
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
