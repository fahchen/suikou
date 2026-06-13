// `import x from "./foo.tar.gz" with { type: "file" }` yields the embedded file's
// path string (real path in dev, `$bunfs/...` in the compiled binary).
declare module "*.tar.gz" {
  const path: string
  export default path
}
