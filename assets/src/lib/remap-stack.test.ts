import { SourceMapGenerator } from "source-map-js"
import { afterEach, describe, expect, it, vi } from "vitest"

import { remapStack } from "./remap-stack"

afterEach(() => {
  vi.unstubAllGlobals()
})

// With fetch failing, no source map is found, so every frame is kept at its
// bundled position — isolating the grammar parsing and deps-filter logic.
describe("remapStack without source maps", () => {
  function stubNoMaps() {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )
  }

  it("parses V8 frames and normalizes them", async () => {
    stubNoMaps()
    const stack = "Error: boom\n    at fn (https://app/assets/v8-a.js:10:5)"
    expect(await remapStack(stack, { includeDeps: true })).toBe(
      "Error: boom\n    at fn (https://app/assets/v8-a.js:10:5)",
    )
  })

  it("parses JSC/Safari frames and normalizes them to the V8 shape", async () => {
    stubNoMaps()
    const stack = "boom@https://app/assets/jsc-b.js:3:7"
    expect(await remapStack(stack, { includeDeps: true })).toBe(
      "at boom (https://app/assets/jsc-b.js:3:7)",
    )
  })

  it("keeps non-frame lines verbatim", async () => {
    stubNoMaps()
    const stack = "TypeError: nope\nsome free text\n    at f (https://app/assets/v8-c.js:1:1)"
    expect(await remapStack(stack, { includeDeps: true })).toBe(
      "TypeError: nope\nsome free text\n    at f (https://app/assets/v8-c.js:1:1)",
    )
  })

  it("drops dependency frames when includeDeps is false", async () => {
    stubNoMaps()
    const stack = [
      "    at app (https://app/assets/v8-d.js:2:2)",
      "    at https://app/node_modules/.vite/deps/react.js:20:1",
      "    at https://app/deps/musubi/client.js:9:3",
    ].join("\n")
    expect(await remapStack(stack, { includeDeps: false })).toBe(
      "    at app (https://app/assets/v8-d.js:2:2)",
    )
  })

  it("keeps dependency frames when includeDeps is true", async () => {
    stubNoMaps()
    const stack = [
      "    at app (https://app/assets/v8-e.js:2:2)",
      "    at https://app/node_modules/.vite/deps/react.js:20:1",
    ].join("\n")
    expect(await remapStack(stack, { includeDeps: true })).toBe(
      ["    at app (https://app/assets/v8-e.js:2:2)", "    at (https://app/node_modules/.vite/deps/react.js:20:1)"].join(
        "\n",
      ),
    )
  })
})

describe("remapStack with a source map", () => {
  it("remaps a frame to its original source position via an inline map", async () => {
    const gen = new SourceMapGenerator({ file: "v8-map.js" })
    gen.addMapping({
      generated: { line: 1, column: 10 },
      original: { line: 5, column: 2 },
      source: "src/app.ts",
      name: "boom",
    })
    const inline = `data:application/json;base64,${btoa(gen.toString())}`
    const bundle = `(()=>{})()\n//# sourceMappingURL=${inline}`
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ text: () => Promise.resolve(bundle) }) as unknown as Promise<Response>),
    )

    const stack = "    at boom (https://app/assets/v8-map.js:1:10)"
    expect(await remapStack(stack, { includeDeps: true })).toBe("    at boom (src/app.ts:5:2)")
  })
})
