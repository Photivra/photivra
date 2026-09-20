// SPDX-License-Identifier: Apache-2.0

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";

const ROOTS = ["src", "scripts"];
const EXPECTED = "// SPDX-License-Identifier: Apache-2.0";
const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!fullPath.endsWith(".ts") && !fullPath.endsWith(".mjs")) {
      continue;
    }

    const content = await readFile(fullPath, "utf8");
    if (!content.startsWith(EXPECTED)) {
      violations.push(fullPath);
    }
  }
}

for (const root of ROOTS) {
  await walk(root);
}

if (violations.length > 0) {
  throw new Error(
    [
      "SPDX license-header check failed:",
      ...violations.map((file) => `- ${file}`)
    ].join("\n")
  );
}

stdout.write(`SPDX license-header check passed for ${ROOTS.join(", ")}.\n`);
