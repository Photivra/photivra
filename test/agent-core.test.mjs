// Shared Photivra agent rules: integrity of the copied block.
// This file is identical in every Photivra repository that carries the block.
// The canonical text is docs/agent-core.md in the public Photivra/photivra
// repository; every carrying repository has a copy inside its AGENTS.md.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BEGIN = /^<!-- BEGIN photivra-agent-core v(\d+) sha256:([0-9a-f]{64}) -->$/u;
const END = "<!-- END photivra-agent-core -->";

export function readBlock(text) {
  const lines = text.replace(/\r\n/gu, "\n").split("\n");
  const starts = lines.flatMap((line, index) => (BEGIN.test(line) ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === END ? [index] : []));
  expect(starts.length, "expected exactly one BEGIN photivra-agent-core marker").toBe(1);
  expect(ends.length, "expected exactly one END photivra-agent-core marker").toBe(1);
  expect(ends[0] > starts[0] + 1, "END marker must follow BEGIN and its notice line").toBe(true);
  const [, version, recorded] = lines[starts[0]].match(BEGIN);
  // The line after BEGIN is the copy notice; the hashed body follows it.
  const body = `${lines.slice(starts[0] + 2, ends[0]).join("\n")}\n`;
  const block = lines.slice(starts[0], ends[0] + 1).join("\n");
  return { version: Number(version), recorded, actual: createHash("sha256").update(body).digest("hex"), block };
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonical = join(root, "docs", "agent-core.md");
const agents = join(root, "AGENTS.md");

describe("shared Photivra agent block", () => {
  it("AGENTS.md carries the block unedited", () => {
    const block = readBlock(readFileSync(agents, "utf8"));
    expect(block.actual, "shared agent block does not match its recorded sha256; edit docs/agent-core.md in Photivra/photivra and recopy it").toBe(block.recorded);
  });

  if (existsSync(canonical)) {
    it("the canonical file is sealed and AGENTS.md carries it byte for byte", () => {
      const source = readBlock(readFileSync(canonical, "utf8"));
      expect(source.actual, "docs/agent-core.md is not sealed; run node scripts/sync-agent-core.mjs --write").toBe(source.recorded);
      expect(readBlock(readFileSync(agents, "utf8")).block, "AGENTS.md is out of date; run node scripts/sync-agent-core.mjs --write").toBe(source.block);
    });
  }
});
