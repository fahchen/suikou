import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { VitePWA } from "vite-plugin-pwa"

// What this bundle was built from, stamped in at build time and shown under
// Settings → About. Answers "is the thing I'm looking at the thing I just
// built?" — the question every one of these fixes started with. A build from a
// source tarball has no git, so every field degrades to "unknown" rather than
// failing the build.
function buildInfo() {
  const git = (...args: string[]) => {
    try {
      return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    } catch {
      return ""
    }
  }

  const commit = git("rev-parse", "--short", "HEAD")
  return {
    commit: commit || "unknown",
    // The subject line says what this build actually contains — far quicker to
    // place than a hash you would have to go and look up.
    subject: git("log", "-1", "--format=%s") || "unknown",
    // Marks a build made from edits that were never committed, so a stack trace
    // from it is not blamed on the commit it merely sat next to.
    dirty: git("status", "--porcelain") !== "",
    builtAt: new Date().toISOString(),
  }
}

export default defineConfig({
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo()),
  },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // App-shell service worker. iOS Safari evicts a backgrounded tab and forces a
    // full reload on return; precaching the built shell makes that reload paint
    // from cache instead of refetching index.html + JS over the network.
    VitePWA({
      registerType: "autoUpdate",
      // Registration lives in main.tsx via `virtual:pwa-register`, so this plugin
      // emits nothing itself. The obvious alternatives both fail here: a separate
      // registerSW.js lands at priv/static root, where the Phoenix "/" Plug.Static
      // only serves files listed in static_paths() — SpaController would swallow
      // it and return the SPA shell, so the browser parses HTML as JS ("Unexpected
      // token '<'"). "inline" avoids that but emits a bare register() call with
      // none of autoUpdate's reload-on-new-worker logic, which left stale tabs
      // stranded on a shell whose chunks the next build had already deleted.
      // Importing the virtual module bundles that logic into the hashed app JS —
      // no extra file for Phoenix to serve, and the update actually applies.
      injectRegister: null,
      workbox: {
        inlineWorkboxRuntime: true,
        // Take over pages that are already open. skipWaiting alone activates the
        // new worker but leaves existing tabs driven by the old one, still being
        // served the previous index.html — which points at chunk hashes this
        // build has removed.
        clientsClaim: true,
        // Layer the Web Push push/notificationclick handlers onto the generated
        // sw.js. push-sw.js is a committed static file (priv/static), kept out of
        // the build so this tuned app-shell config stays intact.
        importScripts: ["/push-sw.js"],
        // Precache only the shell (index.html + entry CSS). The JS lives in
        // hundreds of hash-named, lazy-loaded grammar/shiki chunks (~15 MB), so
        // precaching them all would bloat every SW install. They're immutable
        // (content-hashed URLs), so a CacheFirst runtime cache serves them from
        // disk on a forced reload while a new hash always bypasses the stale one.
        globPatterns: ["index.html", "assets/*.css", "icon-*.png"],
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
        // Splash / standalone title bar. Match the app's default (Suikou Dark)
        // first-paint canvas so launch is seamless, not a vermilion flash.
        theme_color: "#12181c",
        background_color: "#12181c",
        // Icons are rounded-rect with transparent corners — they carry their own
        // radius rather than a maskable safe zone, so ship `any` only. Declaring
        // `maskable` would let Android's circular mask clip the corner glyphs.
        icons: [
          { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }
        ]
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
      // App icons live in priv/static (served by Phoenix), not in a Vite
      // publicDir, so forward them to resolve the favicon on the dev origin too.
      "^/(favicon\\.ico|icon-\\d+\\.png)$": {
        target: "http://localhost:4710"
      },
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
