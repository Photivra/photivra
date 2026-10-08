// SPDX-License-Identifier: Apache-2.0

/**
 * #224 / #251 static whole-event work-preflight only.
 *
 * This code does NOT execute a camera, change engine sampling, or authorize
 * dynamic runtime admission. The unchanged reference executor currently counts
 * the full committed spectral support against the 2B work ceiling.
 * See docs/BROWSER_NATIVE_FULL_EVENT_PREFLIGHT.md.
 */
const LIMITS = Object.freeze({
  nativeSites: 24_000_000n,
  nativeDimension: 16_384n,
  wholeEventDynamicEvaluations: 2_000_000_000n,
  perSourceTileLogicalEvaluations: 100_000n,
  packedRawBytesPerSite: 7n
});

const FRAME = Object.freeze({ width: 2048, height: 1366, spatial: 4, spectral: 2 });

const CASES = Object.freeze([
  Object.freeze({
    id: '251-frozen-base', pupil: 128, temporal: 1,
    conditional: false
  }),
  Object.freeze({
    id: '251-pupil-refinement', pupil: 256, temporal: 1,
    conditional: false
  }),
  Object.freeze({
    id: '251-temporal-refinement', pupil: 128, temporal: 2,
    conditional: false
  }),
  Object.freeze({
    id: '251-combined-convergence-only', pupil: 256, temporal: 2,
    conditional: true
  })
]);

const integer = (n, name) => {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) {
    throw new TypeError(name + ' must be a positive safe integer.');
  }
  return BigInt(n);
};

function insistKeys(input, allowed) {
  if (input === null || typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).sort().join('|') !== [...allowed].sort().join('|')) {
    throw new TypeError('Unexpected full-event work-preflight parameters.');
  }
}

/**
 * Returns exact *logical/planned* counts and the unchanged implementation's
 * pre-admission work-budget outcome. No runtime, RAM or scientific pass claim.
 *
 * Array dimensions and factors are supplied explicitly to make changes in
 * sampling semantics visible, never inferred from a small-case pilot.
 */
export function inspectFullNativeWork(input) {
  insistKeys(input, ['id', 'width', 'height', 'spatial', 'temporal',
    'pupil', 'spectral', 'conditional']);
  if (typeof input.id !== 'string' ||
      !/^251-[a-z-]{4,64}$/u.test(input.id) ||
      typeof input.conditional !== 'boolean') {
    throw new TypeError('Invalid #251 case identity or conditional status.');
  }
  const width = integer(input.width, 'width');
  const height = integer(input.height, 'height');
  const spatial = integer(input.spatial, 'spatial');
  const temporal = integer(input.temporal, 'temporal');
  const pupil = integer(input.pupil, 'pupil');
  const spectral = integer(input.spectral, 'spectral');
  const nativeSites = width * height;
  if (width > LIMITS.nativeDimension || height > LIMITS.nativeDimension ||
      nativeSites > LIMITS.nativeSites) {
    throw new RangeError('Native raster exceeds the unchanged RAW limits.');
  }
  const uniqueGeometryRequests = nativeSites * spatial * temporal * pupil;
  const logicalSpectralSourceSupport = uniqueGeometryRequests * spectral;
  const packedRawPayloadBytes = nativeSites * LIMITS.packedRawBytesPerSite;
  const perSiteLogicalSupport = spatial * temporal * pupil * spectral;
  const sourceTileSiteFit = perSiteLogicalSupport <=
    LIMITS.perSourceTileLogicalEvaluations;
  const belowWholeEventBudget = logicalSpectralSourceSupport <=
    LIMITS.wholeEventDynamicEvaluations;

  return Object.freeze({
    schemaVersion: '1.0.0',
    kind: 'repository-only-251-static-work-obstruction',
    id: input.id,
    frozenNativeRaster: Object.freeze({
      width: input.width, height: input.height
    }),
    support: Object.freeze({
      spatialNodesPerSite: input.spatial,
      temporalNodesPerSite: input.temporal,
      pupilRaysPerSite: input.pupil,
      spectralNodesPerSite: input.spectral
    }),
    conditionalCase: input.conditional,
    nativeSites: String(nativeSites),
    perSiteLogicalSupport: String(perSiteLogicalSupport),
    uniqueGeometryRequests: String(uniqueGeometryRequests),
    logicalSpectralSourceSupport: String(logicalSpectralSourceSupport),
    currentExecutorPlannedSpectralSourceWork:
      String(logicalSpectralSourceSupport),
    packedRawPayloadBytes: String(packedRawPayloadBytes),
    unchangedWholeEventWorkCeiling:
      String(LIMITS.wholeEventDynamicEvaluations),
    unchangedSourceTileLogicalCeiling:
      String(LIMITS.perSourceTileLogicalEvaluations),
    exceedsWholeEventWorkCeiling: !belowWholeEventBudget,
    exceedsSingleSourceTileLogicalCeiling: !sourceTileSiteFit,
    countScreenDisposition: belowWholeEventBudget && sourceTileSiteFit
      ? 'count-screen-only-no-runtime-admission'
      : 'current-path-a-count-bound-reject',
    rejectionWorkOverage: belowWholeEventBudget ? '0' :
      String(logicalSpectralSourceSupport -
        LIMITS.wholeEventDynamicEvaluations),
    batchSplittingChangesWholeEventBound: false,
    currentExecutorRuntimeAdmitted: false,
    actualFullNativeExecutionAttempted: false,
    actualFullNativeElapsedMilliseconds: null,
    empiricalPeakResidentBytes: null,
    measuredBackend: null,
    fullNativeQualified: false,
    fullNativeRuntimeProjection: null,
    changedMethodApproved: false
  });
}

/** Exactly the approved frozen #251 work-count cases, never sampled-down. */
export function frozenFullNativeWorkObstructions() {
  return Object.freeze(CASES.map(c => inspectFullNativeWork({
    id: c.id, width: FRAME.width, height: FRAME.height,
    spatial: FRAME.spatial, spectral: FRAME.spectral,
    temporal: c.temporal, pupil: c.pupil, conditional: c.conditional
  })));
}
