// SPDX-License-Identifier: Apache-2.0

/**
 * Build step after `tsc` (#536): strips comments and indentation from the `/* wgsl *\/` shader literals in `dist/`
 * (scripts/lib/wgsl-minify.mjs). It checks that every tagged literal of `src/` reached `dist/` and was minified, and
 * that its WGSL tokens are unchanged, so a tsc change that dropped the tags, or a literal the minifier would refuse,
 * fails the build instead of shipping silently larger or different shaders. Running it twice changes nothing.
 */
import console from "node:console";
import process from "node:process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { minifyWgslTemplates, wgslTokens } from "./lib/wgsl-minify.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const walk = (directory, extension) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(directory, entry.name), extension) : entry.name.endsWith(extension) ? [join(directory, entry.name)] : []);

const expected = walk(join(root, "src"), ".ts").reduce((count, file) => count + minifyWgslTemplates(readFileSync(file, "utf8")).literals.length, 0);
let found = 0, before = 0, after = 0;
const problems = [];
for (const file of walk(join(root, "dist"), ".js")) {
  const source = readFileSync(file, "utf8");
  const { code, literals } = minifyWgslTemplates(source);
  if (literals.length === 0) continue;
  found += literals.length;
  for (const literal of literals) {
    if (literal.kept && literal.minified !== literal.original) problems.push(file + ": a kept literal changed");
    if (JSON.stringify(wgslTokens(literal.original)) !== JSON.stringify(wgslTokens(literal.minified))) problems.push(file + ": WGSL tokens changed");
    if (literal.original.split("\n").length !== literal.minified.split("\n").length) problems.push(file + ": line count changed");
    if (literal.kept && /\/\/|\n[ \t]/u.test(literal.original)) problems.push(file + " (offset " + literal.offset + "): a shader literal could not be minified safely");
  }
  before += source.length;
  after += code.length;
  if (code !== source) writeFileSync(file, code);
}
if (found !== expected) problems.push("dist/ has " + found + " /* wgsl */ literals but src/ has " + expected + "; did tsc drop a tag?");
if (problems.length > 0) {
  console.error("WGSL minification failed:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("WGSL minified: " + found + " literals; the files that hold them went from " + before + " to " + after + " bytes.");
