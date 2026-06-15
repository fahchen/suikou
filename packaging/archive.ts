import { chmod, lstat, mkdir, readdir, readlink, symlink } from "node:fs/promises"
import { dirname, join, relative } from "node:path"

// A self-contained archive codec shared by the build-time packer and the runtime
// unpacker, so the binary needs no external `tar`. Because the same code writes
// and reads the format, it only covers what we emit — no tar headers, checksums,
// padding, or long-name variants.
//
// Wire format (gzip-compressed as a whole):
//   [4-byte big-endian manifest-JSON length][manifest JSON utf8][concatenated body bytes]
// The manifest is an array of entries; "file" entries carry `size` and contribute
// `size` bytes to the body, in manifest order. Mode is preserved explicitly because
// the gunzip/write path does not carry unix permissions (unlike tar), yet
// `suikou/bin/suikou` and `erts-*/bin/*` must stay executable (0o755).

type Entry =
  | { path: string; type: "file"; mode: number; size: number }
  | { path: string; type: "dir"; mode: number }
  | { path: string; type: "symlink"; mode: number; target: string }

export async function packDir(srcDir: string): Promise<Uint8Array> {
  const entries: Entry[] = []
  const bodies: Uint8Array[] = []

  await walk(srcDir, srcDir, entries, bodies)

  const manifestJson = new TextEncoder().encode(JSON.stringify(entries))
  const header = new Uint8Array(4)
  new DataView(header.buffer).setUint32(0, manifestJson.length, false)

  const bodyLength = bodies.reduce((sum, b) => sum + b.length, 0)
  const whole = new Uint8Array(header.length + manifestJson.length + bodyLength)
  whole.set(header, 0)
  whole.set(manifestJson, header.length)
  let offset = header.length + manifestJson.length
  for (const b of bodies) {
    whole.set(b, offset)
    offset += b.length
  }

  return Bun.gzipSync(whole)
}

export async function unpack(gz: Uint8Array, destDir: string): Promise<void> {
  const whole = Bun.gunzipSync(gz)
  const manifestLength = new DataView(whole.buffer, whole.byteOffset, 4).getUint32(0, false)
  const manifestStart = 4
  const bodyStart = manifestStart + manifestLength
  const manifest: Entry[] = JSON.parse(
    new TextDecoder().decode(whole.subarray(manifestStart, bodyStart))
  )

  let offset = bodyStart
  for (const entry of manifest) {
    const target = join(destDir, entry.path)
    if (entry.type === "dir") {
      await mkdir(target, { recursive: true })
      await chmod(target, entry.mode)
    } else if (entry.type === "symlink") {
      await mkdir(dirname(target), { recursive: true })
      await symlink(entry.target, target)
    } else {
      await mkdir(dirname(target), { recursive: true })
      await Bun.write(target, whole.subarray(offset, offset + entry.size))
      await chmod(target, entry.mode)
      offset += entry.size
    }
  }
}

async function walk(
  root: string,
  dir: string,
  entries: Entry[],
  bodies: Uint8Array[]
): Promise<void> {
  const dirents = await readdir(dir, { withFileTypes: true })
  // Sort for deterministic, reproducible output.
  dirents.sort((a: { name: string }, b: { name: string }) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )

  for (const dirent of dirents) {
    const full = join(dir, dirent.name)
    const path = relative(root, full)
    const info = await lstat(full)
    const mode = info.mode & 0o7777

    if (dirent.isSymbolicLink()) {
      entries.push({ path, type: "symlink", mode, target: await readlink(full) })
    } else if (dirent.isDirectory()) {
      entries.push({ path, type: "dir", mode })
      await walk(root, full, entries, bodies)
    } else {
      const bytes = await Bun.file(full).bytes()
      entries.push({ path, type: "file", mode, size: bytes.length })
      bodies.push(bytes)
    }
  }
}

if (import.meta.main) {
  const [srcDir, outFile] = process.argv.slice(2)
  if (!srcDir || !outFile) {
    console.error("usage: bun run archive.ts <srcDir> <outFile>")
    process.exit(1)
  }
  const bytes = await packDir(srcDir)
  await Bun.write(outFile, bytes)
}
