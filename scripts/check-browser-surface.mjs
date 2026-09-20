// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";

const sourceRoot = path.resolve("src");
const entrypoint = path.join(sourceRoot, "index.ts");
const visited = new Set();
const violations = [];

function extractSpecifiers(source) {
  const specifiers = [];
  const fromPattern = /\bfrom\s+["']([^"']+)["']/gu;
  const sideEffectPattern = /\bimport\s+["']([^"']+)["']/gu;

  for (const pattern of [fromPattern, sideEffectPattern]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

function resolveSourceImport(importer, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const resolved = path.resolve(path.dirname(importer), specifier);
  if (resolved.endsWith(".js")) {
    return resolved.slice(0, -3) + ".ts";
  }
  if (path.extname(resolved) === "") {
    return resolved + ".ts";
  }
  return resolved;
}

async function visit(file) {
  if (visited.has(file)) {
    return;
  }
  visited.add(file);

  if (!file.startsWith(sourceRoot + path.sep)) {
    violations.push(
      `${path.relative(sourceRoot, file)} escapes the engine source root.`
    );
    return;
  }

  const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
  if (relative.startsWith("api/")) {
    violations.push(
      `${relative} is Node-only POC API code reachable from the root package export.`
    );
    return;
  }

  const source = await readFile(file, "utf8");
  for (const specifier of extractSpecifiers(source)) {
    if (
      specifier.startsWith("node:") ||
      specifier === "fs" ||
      specifier === "path" ||
      specifier === "http" ||
      specifier === "https" ||
      specifier === "net" ||
      specifier === "tls" ||
      specifier === "child_process" ||
      specifier === "worker_threads"
    ) {
      violations.push(
        `${relative} imports Node-only module "${specifier}" from the browser package graph.`
      );
      continue;
    }

    const dependency = resolveSourceImport(file, specifier);
    if (dependency !== null) {
      await visit(dependency);
    }
  }
}

await visit(entrypoint);

if (violations.length > 0) {
  throw new Error(
    [
      "Browser package surface check failed:",
      ...violations.map((violation) => `- ${violation}`)
    ].join("\n")
  );
}

stdout.write(
  `Browser package surface check passed across ${visited.size} reachable source modules.\n`
);
