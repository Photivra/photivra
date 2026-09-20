// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { platform, stdout } from "node:process";

const packageJson = JSON.parse(
  await readFile("package.json", "utf8")
);

const exportKeys = Object.keys(packageJson.exports ?? {});
if (packageJson.scripts?.["start:poc-api"] !== undefined) {
  throw new Error(
    "Published package metadata must not advertise the repository-only POC API as an npm script."
  );
}
if (exportKeys.length !== 1 || exportKeys[0] !== ".") {
  throw new Error(
    `Published package exports must contain only the root scientific surface; found: ${exportKeys.join(", ") || "(none)"}`
  );
}

const raw = execFileSync(
  platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  }
);

const pack = JSON.parse(raw);
const entry = pack[0];
if (entry === undefined || !Array.isArray(entry.files)) {
  throw new Error("npm pack dry run did not return a file manifest.");
}

const paths = entry.files.map((file) => file.path);
const forbidden = paths.filter(
  (path) =>
    path.startsWith("dist/api/") ||
    path.startsWith("src/") ||
    path.startsWith("test/") ||
    path.startsWith("scripts/")
);

if (forbidden.length > 0) {
  throw new Error(
    ["Published package contains repository-only files:", ...forbidden.map((path) => `- ${path}`)].join("\n")
  );
}

for (const required of [
  "package.json",
  "dist/index.js",
  "dist/index.d.ts",
  "README.md",
  "LICENSE",
  "NOTICE"
]) {
  if (!paths.includes(required)) {
    throw new Error(`Published package is missing required file: ${required}`);
  }
}

stdout.write(
  `Package surface check passed: ${paths.length} files; root export only; local POC API excluded.\n`
);
