// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";

// Optional repository-only QA; uses existing dev compiler and leaves engine dependency/exports unchanged.
const root=fileURLToPath(new URL("..",import.meta.url));
const output=process.argv[2];
if(!output) throw Error("Usage: node scripts/generate-producer-export-acceptance.mjs OUTPUT_DIRECTORY");
const build=await mkdtemp(path.join(tmpdir(),"photivra-export-acceptance-"));
try {
  const compile=spawnSync(process.execPath,[path.join(root,"node_modules/typescript/bin/tsc"),"-p",
    path.join(root,"scripts/tsconfig.export-acceptance.json"),"--outDir",build],{cwd:root,stdio:"inherit"});
  if(compile.error) throw compile.error;
  if(compile.status!==0) throw Error("Acceptance fixture compilation failed.");
  await writeFile(path.join(build,"package.json"),JSON.stringify({type:'module'}));
  await mkdir(path.join(build,"test/fixtures"),{recursive:true});
  await copyFile(path.join(root,"test/fixtures/basic-reference-scene.json"),path.join(build,"test/fixtures/basic-reference-scene.json"));
  const generated=spawnSync(process.execPath,[path.join(build,"scripts/generate-producer-export-fixtures.js"),path.resolve(output)],
    {cwd:root,stdio:"inherit"});
  if(generated.error) throw generated.error;
  if(generated.status!==0) throw Error("Acceptance fixture generation failed.");
} finally {
  await rm(build,{recursive:true,force:true});
}
