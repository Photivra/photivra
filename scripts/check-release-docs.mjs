// SPDX-License-Identifier: Apache-2.0

/** Check root-reference drift, repository/package navigation and explicit example dependencies. */
import ts from "typescript";
import process from "node:process";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
execFileSync(process.execPath, ["scripts/generate-api-reference.mjs", "--check"], { stdio: "inherit" });
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const citation = readFileSync("CITATION.cff", "utf8");
if (pkg.version !== "1.0.0" || lock.version !== pkg.version || lock.packages[""].version !== pkg.version || !citation.includes(`version: "${pkg.version}"`)) throw new Error("Distribution/lock/citation version drift");
const manifest = JSON.parse(readFileSync("docs/api/exports.json", "utf8"));
if (manifest.packageVersion !== pkg.version || manifest.engineApiVersion !== "0.116.0") throw new Error("Independent release/API identity drift");
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split("\n");
const docs = tracked.filter(p => p.endsWith(".md") && !p.startsWith(".release-"));
function anchors(text) {
  const used = new Map();
  return new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gmu)].map(m => {
    const id = m[1].toLowerCase().replace(/[`*]/gu, "").replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s/gu, "-");
    const occurrence = used.get(id) ?? 0; used.set(id, occurrence + 1);
    return id + (occurrence ? `-${occurrence}` : "");
  }));
}
let links = 0;
for (const path of docs) {
  const source = readFileSync(path, "utf8");
  const prose = source.replace(/```[\s\S]*?```/gu, "");
  for (const m of prose.matchAll(/\]\(([^\s)]+)\)/gu)) {
    let destination = m[1], target;
    const repository = destination.match(/^https:\/\/github\.com\/Photivra\/photivra\/blob\/main\/(.+)$/iu);
    if (repository) destination = repository[1];
    else if (/^(?:https?:|mailto:)/u.test(destination)) continue;
    const [file, fragment] = destination.split("#");
    target = repository ? resolve(file) : file ? resolve(dirname(path), file) : resolve(path);
    if (!existsSync(target)) throw new Error(`Missing navigation: ${path} -> ${m[1]}`);
    if (fragment && target.endsWith(".md") && !anchors(readFileSync(target,"utf8")).has(decodeURIComponent(fragment))) {
      throw new Error(`Missing heading: ${path} -> ${m[1]}`);
    }
    links++;
  }
}
const fragments = JSON.parse(readFileSync("docs/validation/documentation-fragments.json", "utf8"));
const config = ts.readConfigFile("tsconfig.build.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker(), root = program.getSourceFile("src/index.ts");
const exported = new Set(checker.getExportsOfModule(checker.getSymbolAtLocation(root)).map(s => s.name));
let complete = 0, partial = 0;
for (const path of ["README.md", ...docs.filter(p => /^docs\/[^/]+\.md$/u.test(p))]) {
  if (path === "docs/API_REFERENCE.md") continue;
  const text = readFileSync(path, "utf8"); let block = 0;
  for (const match of text.matchAll(/```(?:ts|typescript|js|javascript)\n([\s\S]*?)\n```/gu)) {
    const index = block++, code = match[1];
    if (!code.includes("@photivra/engine")) continue;
    const sf = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
    for (const statement of sf.statements) {
      if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === "@photivra/engine") {
        for (const element of statement.importClause?.namedBindings?.elements ?? []) {
          if (!exported.has(element.propertyName?.text ?? element.name.text)) throw new Error(`Unexported example symbol in ${path}: ${element.name.text}`);
        }
      }
    }
    const fragment = fragments.find(f => f.file === path && f.block === index);
    if (fragment) {
      const prefix = text.slice(Math.max(0, match.index - 600), match.index);
      if (!prefix.includes("Composition fragment: requires previously validated bindings") || fragment.bindings.some(b => !prefix.includes("`" + b + "`"))) throw new Error(`Unstated fragment prerequisites: ${path} block ${index}`);
      partial++;
    } else complete++;
  }
}
console.log(`Docs checked: ${docs.length} Markdown files, ${links} repository/local links, ${complete} complete importing examples and ${partial} explicit fragments.`);
