// `import x from "./foo.pack.gz" with { type: "file" }` yields the embedded file's
// path string (real path in dev, `$bunfs/...` in the compiled binary).
declare module "*.pack.gz" {
  const path: string
  export default path
}
