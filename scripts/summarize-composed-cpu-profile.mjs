// SPDX-License-Identifier: Apache-2.0

import { readFileSync, statSync } from "node:fs";
import process from "node:process";

const path = process.argv[2];
if (!path || statSync(path).size > 32*1024*1024) throw new Error("Provide one CPU profile file at most 32 MiB.");
const profile = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(profile.nodes) || !Array.isArray(profile.samples)) throw new Error("Expected a V8 CPU profile.");
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parents = new Map();
for (const node of profile.nodes) for (const id of node.children ?? []) {
  if (parents.has(id) || !nodes.has(id)) throw new Error("Invalid CPU profile parent graph.");
  parents.set(id, node.id);
}
const names = ["calculateThinLensImageDistance", "requirePositiveFinite", "assertFiniteNumbers"];
const hits = Object.fromEntries(names.map((name) => [name, 0]));
let composed = 0;
for (const id of profile.samples) {
  const stack = [], seen = new Set(); let current = id;
  while (current !== undefined) {
    if (seen.has(current) || !nodes.has(current)) throw new Error("Invalid CPU profile stack.");
    seen.add(current); stack.push(nodes.get(current).callFrame?.functionName); current = parents.get(current);
  }
  if (stack.includes("simulatePocCamera")) {
    composed++;
    for (const name of names) if (stack.includes(name)) hits[name]++;
  }
}
process.stdout.write(JSON.stringify({ totalCpuSamples: profile.samples.length, composedCallCpuSamples: composed,
  inclusiveSampleCounts: hits, fractionsOfComposedCallSamples: Object.fromEntries(names.map((name) => [name, composed ? hits[name]/composed : null])),
  limitations: ["Sampled inclusive stacks, not exact timing or allocation counts", "Categories overlap and must not be summed",
    "V8 inlining and sampling frequency affect attribution; zero samples do not establish zero work",
    "Profiled run timings are not compared with unprofiled baseline"] }, null, 2)+"\n");
