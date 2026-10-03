// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";

// Repository-only generation; no new engine or dev dependency.
const root = fileURLToPath(new URL("..", import.meta.url)), output = process.argv[2];
if (!output) throw Error("Usage: node scripts/generate-print-detail-jpeg.mjs OUTPUT_DIRECTORY");
const build = await mkdtemp(path.join(tmpdir(), "photivra-print-jpeg-"));
try {
  const compile = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p",
    path.join(root, "scripts/tsconfig.print-jpeg.json"), "--outDir", build], { cwd: root, stdio: "inherit" });
  if (compile.error) throw compile.error;
  if (compile.status !== 0) throw Error("JPEG evidence compilation failed.");
  await writeFile(path.join(build, "package.json"), JSON.stringify({ type: "module" }));
  await mkdir(path.join(build, "test/fixtures"), { recursive: true });
  await copyFile(path.join(root, "test/fixtures/basic-reference-scene.json"), path.join(build, "test/fixtures/basic-reference-scene.json"));
  const generate = spawnSync(process.execPath, [path.join(build, "scripts/generate-print-detail-jpeg.js"), path.resolve(output)],
    { cwd: root, stdio: "inherit" });
  if (generate.error) throw generate.error;
  if (generate.status !== 0) throw Error("JPEG evidence generation failed.");
} finally { await rm(build, { recursive: true, force: true }); }
