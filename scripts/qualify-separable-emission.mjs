// SPDX-License-Identifier: Apache-2.0
/** Repository-only pilot measurements; never a full-native/device qualification claim. */
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';
const compiled = mkdtempSync(join(tmpdir(), 'photivra-emission-'));
try {
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json',
    '--outDir', compiled, '--declaration', 'false', '--declarationMap', 'false', '--sourceMap', 'false'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Qualification compilation failed.');
  cpSync('test/fixtures', join(compiled, 'test/fixtures'), { recursive: true });
  const { separableNativeFixture } = await import(pathToFileURL(join(compiled, 'test/helpers/separable-native-fixture.js')).href);
  const { createExperimentalNativeSeparableEmissionTask } = await import(pathToFileURL(join(compiled, 'src/api/native-separable-emission-experimental.js')).href);
  const sourceSha256 = Object.fromEntries(['src/api/separable-emission-experimental.ts',
    'src/api/native-separable-emission-experimental.ts', 'test/helpers/separable-native-fixture.ts',
    'scripts/qualify-separable-emission.mjs'].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const dirty = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.length > 0;
  for (const rays of [32, 64, 128]) for (const rolling of [false, true]) {
    const f = separableNativeFixture(rays, rolling);
    globalThis.gc?.();
    const baseline = process.memoryUsage();
    let peakRss = baseline.rss, peakHeap = baseline.heapUsed, peakArrayBuffers = baseline.arrayBuffers;
    let yieldCount = 0, longestTileMilliseconds = 0, lastYield = performance.now();
    function sample() {
      const m = process.memoryUsage();
      peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed);
      peakArrayBuffers = Math.max(peakArrayBuffers, m.arrayBuffers);
    }
    let callbacks = 0;
    const task = createExperimentalNativeSeparableEmissionTask(f.input, { ...f.provider,
      evaluateGeometry(q) { if (++callbacks % 128 === 0) sample(); return f.provider.evaluateGeometry(q); },
      async yieldControl() {
        const now = performance.now(); longestTileMilliseconds = Math.max(longestTileMilliseconds, now - lastYield);
        yieldCount++; sample(); await setImmediate(); lastYield = performance.now();
      } });
    const start = performance.now(); lastYield = start;
    await task.run();
    const milliseconds = performance.now() - start, output = task.takeOutput(); sample();
    const codes = Array.from(output.raw.codes);
    if (JSON.stringify(codes) !== JSON.stringify(f.reference.value.raw.value.frame.samples.map(s => s.rawCode)))
      throw new Error('Seeded RAW reference disagreement.');
    const packed = Buffer.alloc(codes.length * 2);
    codes.forEach((code, i) => packed.writeUInt16LE(code, 2 * i));
    console.log(JSON.stringify({ schemaVersion: '1.0.0', kind: 'repository-only-complete-small-event-pilot',
      revision, workingTreeModified: dirty, sourceSha256, forcedGcAvailable: typeof globalThis.gc === "function", runtime: process.version, platform: process.platform, arch: process.arch,
      raster: { width: 2, height: 2 }, spatialNodes: 4, spectralNodes: 2, temporalNodes: 2, pupilRays: rays,
      shutter: rolling ? 'right-to-left-native-scan' : 'global', tileWidth: 1, completedTiles: task.completedTileCount,
      milliseconds, longestTileMilliseconds, yieldCount, baseline,
      sampledPeak: { rss: peakRss, heapUsed: peakHeap, arrayBuffers: peakArrayBuffers },
      outputBytes: output.raw.codes.byteLength + output.raw.blackLevels.byteLength + output.raw.digitalSaturationCodes.byteLength + output.raw.saturationFlags.byteLength,
      geometryEvaluations: output.geometryEvaluationCount, spectralCompositions: output.spectralCompositionCount,
      packedUint16LittleEndianSha256: createHash('sha256').update(packed).digest('hex'),
      projected2048x1366OneTemporalNodeMilliseconds: milliseconds * (2048 * 1366 / 4) / 2,
      projectionIsMeasurement: false, fullNativeQualified: false, externalSourceSeparabilityVerified: false,
      refinementConvergenceEstablished: false, productionPlanActivated: false,
      limitation: 'Complete 2x2 synthetic events only. Sampled process peaks omit unsampled transients; elapsed-time scaling is an extrapolation, not native/device evidence.' }));
  }
} finally { rmSync(resolve(compiled), { recursive: true, force: true }); }
