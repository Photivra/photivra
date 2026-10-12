// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { copyInto, sealed } from "../scripts/sync-agent-core.mjs";

const notice = "<!-- copy notice -->";
const wrap = (sha, body) => `<!-- BEGIN photivra-agent-core v1 sha256:${sha} -->\n${notice}\n${body}<!-- END photivra-agent-core -->`;

describe("sync-agent-core", () => {
  it("seals the canonical body with its sha256", () => {
    const body = "## Rules\n\n- One.\n";
    const { block, text } = sealed(`# Intro\n\n${wrap("0".repeat(64), body)}\n`);
    const sha = createHash("sha256").update(body).digest("hex");
    expect(block).toBe(wrap(sha, body));
    expect(text).toBe(`# Intro\n\n${wrap(sha, body)}\n`);
  });

  it("replaces only the block in an AGENTS.md", () => {
    const block = wrap("a".repeat(64), "## New\n");
    const before = `# Agents\n\n## Local\n\n${wrap("b".repeat(64), "## Old\n")}\n\n## After\n`;
    expect(copyInto(before, block)).toBe(`# Agents\n\n## Local\n\n${block}\n\n## After\n`);
    expect(copyInto("# No block\n", block)).toBeNull();
  });

  it("refuses a canonical file without a block", () => {
    expect(() => sealed("# Nothing here\n")).toThrow(/missing photivra-agent-core block/u);
  });
});
