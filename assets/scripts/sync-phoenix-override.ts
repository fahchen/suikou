#!/usr/bin/env bun
// Pin bun's `overrides.phoenix` to the exact version mix vendored into
// deps/phoenix. phoenix is a file: dep (mix-managed); left as file: bun
// re-resolves its floating devDeps every install and the lockfile churns
// (registry<->file: oscillation, duplicate keys). Collapsing phoenix to its
// registry version dedupes it to one hashed node -> idempotent lock. This
// keeps that pin tracking whatever version mix.lock currently holds.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const phoenixVersion: string = JSON.parse(
  readFileSync(join(root, "../deps/phoenix/package.json"), "utf8"),
).version;

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.overrides ??= {};

if (pkg.overrides.phoenix === phoenixVersion) process.exit(0);

pkg.overrides.phoenix = phoenixVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`synced overrides.phoenix -> ${phoenixVersion}`);
