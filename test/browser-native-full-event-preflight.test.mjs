// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  inspectFullNativeWork, frozenFullNativeWorkObstructions
} from '../scripts/lib/browser-native-full-event-preflight.mjs';

const caseInput = (overrides = {}) => ({
  id: '251-frozen-base', width: 2048, height: 1366,
  spatial: 4, temporal: 1, pupil: 128, spectral: 2,
  conditional: false, ...overrides
});

describe('#224 full-native static Path-A work preflight (never qualified)', () => {
  it('exactly counts 2048 × 1366 base/required refinements and optional combined support', () => {
    const cases = frozenFullNativeWorkObstructions();
    expect(cases.map(c => c.id)).toEqual([
      '251-frozen-base',
      '251-pupil-refinement',
      '251-temporal-refinement',
      '251-combined-convergence-only'
    ]);
    expect(cases.map(c => c.nativeSites)).toEqual(Array(4).fill('2797568'));
    expect(cases.map(c => c.uniqueGeometryRequests)).toEqual([
      '1432354816', '2864709632', '2864709632', '5729419264'
    ]);
    expect(cases.map(c => c.logicalSpectralSourceSupport)).toEqual([
      '2864709632', '5729419264', '5729419264', '11458838528'
    ]);
    expect(cases.map(c => c.rejectionWorkOverage)).toEqual([
      '864709632', '3729419264', '3729419264', '9458838528'
    ]);
    expect(cases.map(c => c.packedRawPayloadBytes))
      .toEqual(Array(4).fill('19582976'));
    expect(cases.map(c => c.conditionalCase)).toEqual([false, false, false, true]);
    expect(cases.map(c => c.countScreenDisposition))
      .toEqual(Array(4).fill('current-path-a-count-bound-reject'));
  });

  it('does not relabel geometry work as the smaller spectral budget or reset for tiles', () => {
    const base = inspectFullNativeWork(caseInput());
    expect(base.nativeSites).toBe('2797568');
    expect(base.uniqueGeometryRequests).toBe('1432354816');
    expect(base.currentExecutorPlannedSpectralSourceWork).toBe('2864709632');
    expect(base.unchangedWholeEventWorkCeiling).toBe('2000000000');
    expect(base.unchangedSourceTileLogicalCeiling).toBe('100000');
    expect(base.perSiteLogicalSupport).toBe('1024');
    expect(base.exceedsWholeEventWorkCeiling).toBe(true);
    expect(base.exceedsSingleSourceTileLogicalCeiling).toBe(false);
    expect(base.batchSplittingChangesWholeEventBound).toBe(false);
    expect(base.currentExecutorRuntimeAdmitted).toBe(false);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.support)).toBe(true);
    expect(Object.isFrozen(base.frozenNativeRaster)).toBe(true);

    // Smaller site batches do not appear in the input and cannot change totals.
    const hiddenBatch = caseInput({ batchSize: 1 });
    expect(() => inspectFullNativeWork(hiddenBatch))
      .toThrow('Unexpected full-event work-preflight parameters.');
  });

  it('never claims measured runtime, GPU, precision, completion or approval', () => {
    for (const event of frozenFullNativeWorkObstructions()) {
      expect(event.actualFullNativeExecutionAttempted).toBe(false);
      expect(event.actualFullNativeElapsedMilliseconds).toBeNull();
      expect(event.empiricalPeakResidentBytes).toBeNull();
      expect(event.measuredBackend).toBeNull();
      expect(event.fullNativeRuntimeProjection).toBeNull();
      expect(event.fullNativeQualified).toBe(false);
      expect(event.changedMethodApproved).toBe(false);
      expect(event.currentExecutorRuntimeAdmitted).toBe(false);
    }
    const small = inspectFullNativeWork(caseInput({ width: 16, height: 16 }));
    expect(small.countScreenDisposition).toBe('count-screen-only-no-runtime-admission');
    expect(small.currentExecutorRuntimeAdmitted).toBe(false);
    expect(small.fullNativeQualified).toBe(false);
  });

  it('fails closed for illegal native raster, invalid samples, overflow and policy override', () => {
    for (const params of [
      { width: 16_385 }, { height: 16_385 }, { width: 9000, height: 9000 },
      { width: 0 }, { spatial: 0 }, { temporal: -1 },
      { pupil: 128.25 }, { spectral: NaN },
      { spectral: Number.POSITIVE_INFINITY }, { pupil: Number.MAX_SAFE_INTEGER + 1 },
      { conditional: 'yes' }, { id: '../bad' }, { maxWork: 4_000_000_000 }
    ]) {
      expect(() => inspectFullNativeWork(caseInput(params))).toThrow();
    }
    expect(() => inspectFullNativeWork(null)).toThrow();
    expect(() => inspectFullNativeWork({})).toThrow();
  });

  it('preserves exact sampled support and does not lower samples to fit a budget', () => {
    const fixed = inspectFullNativeWork(caseInput());
    const hypotheticallyReduced = inspectFullNativeWork(caseInput({ pupil: 64 }));
    expect(fixed.support.pupilRaysPerSite).toBe(128);
    expect(fixed.exceedsWholeEventWorkCeiling).toBe(true);
    expect(hypotheticallyReduced.logicalSpectralSourceSupport).toBe('1432354816');
    expect(hypotheticallyReduced.countScreenDisposition)
      .toBe('count-screen-only-no-runtime-admission');
    expect(hypotheticallyReduced.fullNativeQualified).toBe(false);
    expect(frozenFullNativeWorkObstructions()[0].support.pupilRaysPerSite).toBe(128);
  });

  it('remains synchronized with the existing reference work ceilings and source execution check', () => {
    const accounting = readFileSync(
      'docs/BROWSER_NATIVE_CAPTURE_RESOURCE_ACCOUNTING.md', 'utf8'
    );
    const executor = readFileSync(
      'src/capture/browser-native-reference-executor.ts', 'utf8'
    );
    const plan = readFileSync(
      'src/capture/browser-native-reference-plan.ts', 'utf8'
    );
    expect(accounting).toContain('**2,000,000,000**');
    expect(accounting).toContain('**100,000**');
    expect(executor).toContain(
      'committedSourceSampleCount > eventPlan.maximumProviderEvaluations'
    );
    expect(plan).toContain('maximumProviderEvaluations > 2_000_000_000');
    expect(accounting).toContain('Decomposing one legacy provider evaluation');
  });
});
