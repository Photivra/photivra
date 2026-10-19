// SPDX-License-Identifier: Apache-2.0

/**
 * The public entry point of the display view (`simulateDisplayView`) and its renderer. `simulate-capture.ts` resolves the
 * request (`runCapture`) and calls the renderer it is given, so a bundle that imports only `simulateCapture` or
 * `simulateIdealReference` does not contain the display view (`display-view.ts`) or the portable evaluations it uses.
 * The design and its error analysis are in docs/DISPLAY_VIEW.md.
 */

import { ENGINE_API_VERSION } from "../core/version.js";
import { resolvePortableColorTemperatureWhiteBalance, type ResolvedWhiteBalanceState } from "../color/white-balance.js";
import { resolveCaptureColorModel } from "../color/capture-color.js";
import { prepareSensorColorDevelopment } from "../color/sensor-color-development.js";
import { resolveLensPsfConvolutionKernels } from "../optics/lens-psf-kernels.js";
import { resolveProjectionDistanceMm } from "../motion/camera-rotation.js";
import { resolveSensorReadoutRegime } from "../sensor/raw-readout.js";
import { resolvePortableChartScene, type ChartScene } from "./chart-scenes.js";
import { resolvePortableCaptureIlluminant, calculateIlluminantIrradianceScale } from "./scene-radiance.js";
import { ahdCandidateKernels, createDisplayViewExpectedSignal, renderDisplayView, type DisplayViewChannelReadout, type DisplayViewExpectedSignal, type DisplayViewRenderResult,
  type DisplayViewScene } from "./display-view.js";
import { runCapture, apertureNodeOffsets, bilinearPhaseProfiles, clockMs, fail, sceneIlluminantWhiteBalance, CAMERA_TO_XYZ, CHANNELS, DARK_CURRENT_ELECTRONS_PER_SECOND, FACADE_EVIDENCE,
  SIMULATE_CAPTURE_FACADE_VERSION, type DisplayViewResult, type DisplayViewRunContext, type SimulateCaptureOptions, type SimulateDisplayViewOptions } from "./simulate-capture.js";

/**
 * The display view of a capture request: the image the real full-resolution capture (`simulateCapture(options)`) would
 * give after it is resized to `view.width` × `view.height` by area averaging in linear light, estimated at a cost that
 * follows the display pixels, not the capture's. Optics (lens diffraction, the anti-aliasing filter, the pixel aperture)
 * act at the real pixel pitch; the colour mosaic, demosaic and development are those of the real pixels; the noise is
 * that of the average of the real pixels, demosaic correlation included; exposure, white balance and tone are the
 * capture's. The result is labelled `kind: "display-view"`; it is not a capture.
 * @see docs/DISPLAY_VIEW.md and docs/QUICK_START.md, "Display view".
 */
export async function simulateDisplayView(options: SimulateCaptureOptions, view: SimulateDisplayViewOptions): Promise<DisplayViewResult> {
  return await runCapture(options, "display-view", view, (context) => renderDisplayViewResult(context)) as DisplayViewResult;
}
/**
 * Internal (not exported from the package): the display view plus its noise-free expected linear values and noise standard
 * deviations, for the validation scripts and tests.
 */
export async function simulateDisplayViewWithInternals(options: SimulateCaptureOptions, view: SimulateDisplayViewOptions):
  Promise<{ result: DisplayViewResult; internals: DisplayViewRenderResult; signal: DisplayViewExpectedSignal }> {
  const internals: { value?: DisplayViewRenderResult; signal?: DisplayViewExpectedSignal } = {};
  const result = await runCapture(options, "display-view", view, (context) => renderDisplayViewResult(context, internals)) as DisplayViewResult;
  return { result, internals: internals.value!, signal: internals.signal! };
}

/** AHD low-signal correction (display view): draws per flat-neighbourhood state, and the pixel noise (linear light) above which it applies. */
const DISPLAY_VIEW_AHD_CORRECTION_DRAWS = 2048, DISPLAY_VIEW_AHD_CORRECTION_THRESHOLD = 0.01;

/** Renders the display view of a resolved request (the last step of `runCapture` for "display-view"). */
async function renderDisplayViewResult(context: DisplayViewRunContext, viewInternals?: { value?: DisplayViewRenderResult; signal?: DisplayViewExpectedSignal }): Promise<DisplayViewResult> {
  const { ahd, antiAliasing, aspect, assume, assumptions, axisChannelResponse, boxSamples, buildProvider, callerScene, chart, chartReport, chartSize, diffraction, diffractionPsf, fNumber, focalLengthMm, focusDistanceM, height, highlightMode, illuminanceLux, illuminant, illuminantOption, imagingArea, intentOf, metresPerFrameUnit, noiseSeed, outputOptions, parsedView, pitch, preset, provider, regimeByChannel, resolvedIso, sceneOption, scenePreset, shutterSeconds, started, subjectDistanceM, toneCurve, whiteBalanceOption, whiteBalanceState, width, checkAbort, margin, mode, nativeHeight, nativeWidth, sourceSha256, yieldControl } = context;
  const kelvinInput = context.kelvinWhiteBalanceInput;
  const portableKelvinWhiteBalance = kelvinInput ? (): ResolvedWhiteBalanceState => resolvePortableColorTemperatureWhiteBalance(kelvinInput) : undefined;
  const viewStarted = clockMs(), v = parsedView!;
  // The engine's illuminant formulas (Planckian, CIE A, daylight locus) evaluated with the portable power and e^x − 1, so
  // the view's radiances, irradiance scale and scene-illuminant white balance have the same bits in every JavaScript
  // engine; they differ from the capture's own by at most a few ulps (docs/DISPLAY_VIEW.md, "Same bytes in every engine").
  const viewIlluminant = resolvePortableCaptureIlluminant(illuminantOption), viewIrradianceScale = calculateIlluminantIrradianceScale(viewIlluminant.shape, illuminanceLux);
  const viewProvider = buildProvider(viewIlluminant, viewIrradianceScale);
  const viewWhiteBalanceState = whiteBalanceOption === "scene-illuminant" ? sceneIlluminantWhiteBalance(viewIlluminant) : portableKelvinWhiteBalance ? portableKelvinWhiteBalance() : whiteBalanceState;
  // The chart's materials likewise (a step wedge's geometric levels use the portable power); same geometry and order.
  const viewChart = chart ? resolvePortableChartScene({ scene: sceneOption as ChartScene, aspect: chartSize ? chartSize.heightM / chartSize.widthM : aspect }) : undefined;
  if (chart && viewChart!.materials.length !== chart.materials.length) fail("simulateDisplayView: the chart's materials could not be resolved portably.");
  const { electronsPerRadiance, wavelengths, relativePerElectron } = axisChannelResponse("simulateDisplayView");
  const perNode = CHANNELS.map((c) => Float64Array.from(wavelengths, (nm) => electronsPerRadiance[c].get(nm) ?? 0)) as [Float64Array, Float64Array, Float64Array];
  // Query offsets of each site: pixel-aperture nodes minus anti-aliasing split offsets (sites, +x right, +y down), as the environment forms them.
  const spots = antiAliasing ? antiAliasing.components : [{ offsetMicrometers: { x: 0, y: 0 }, normalizedWeight: 1 }];
  const offsets = apertureNodeOffsets(boxSamples).flatMap((node) => spots.map((c) => ({ x: node.x - c.offsetMicrometers.x / pitch, y: node.y - c.offsetMicrometers.y / pitch,
    weight: c.normalizedWeight / (boxSamples * boxSamples) })));
  // Diffraction: the same per-node site kernels as the object-space convolution (createDiffractedPlanarProvider).
  let kernels: { radius: number; perNode: Float64Array[] } | undefined;
  if (diffraction) {
    const radius = diffraction.kernelRadiusSamples;
    kernels = { radius, perNode: wavelengths.map((wavelengthNm) => {
      if (!diffraction!.profile.axes.wavelengthNm.includes(wavelengthNm)) fail("simulateDisplayView: a spectral node has no diffraction kernel.");
      const k = resolveLensPsfConvolutionKernels({ schemaVersion: "0.1.0", psf: diffractionPsf!.configuration.psf, spectralWeights: [{ wavelengthNm, weight: 1 }],
        grid: { width: 1, height: 1, sitePitchMicrometers: { x: pitch, y: pitch }, opticalAxisSite: { x: 0.5, y: 0.5 } }, patchWidth: 1, patchHeight: 1, kernelRadius: radius }).value;
      if (!k.exactSiteSampling || k.kernelRadius !== radius) fail("simulateDisplayView: diffraction kernels must sample the site pitch exactly.");
      return Float64Array.from(k.kernels);
    }) };
  }
  const scene: DisplayViewScene = chart && provider.chartMaterialAt ? { kind: "materials", materialAt: provider.chartMaterialAt,
    materials: [...viewChart!.materials.map((m, index) => (m.kind === "neutral" ? { neutral: m.reflectance } : { radiance: Float64Array.from(wavelengths, (nm) => viewProvider.materialRadiance!(index, nm)) })),
      ...(chartSize ? [{ neutral: chartSize.surroundReflectance }] : [])],
    whiteRadiance: Float64Array.from(wavelengths, (nm) => viewIrradianceScale * viewIlluminant.shape.evaluate(nm) / Math.PI) } :
    { kind: "radiance", radianceAt: viewProvider.radianceAt };
  const channelIndex = (x: number, y: number): number => ((y & 1) === 0 ? ((x & 1) === 0 ? 0 : 1) : ((x & 1) === 0 ? 1 : 2));
  // Without diffraction the environment's own query arithmetic (native-environment-lean.ts `geometry`, then the rectilinear
  // still-camera ray and the planar provider's plane point), so boundary points resolve as in the capture.
  const projectionDistance = resolveProjectionDistanceMm(focalLengthMm, focusDistanceM).projectionDistanceMm, siteWidthMm = pitch / 1000;
  const nodePhases = apertureNodeOffsets(boxSamples).flatMap((_, index) => spots.map((c) => ({ xPhase: (index % boxSamples + 0.5) / boxSamples, yPhase: (Math.floor(index / boxSamples) + 0.5) / boxSamples,
    aaX: c.offsetMicrometers.x / 1000, aaY: c.offsetMicrometers.y / 1000 })));
  const queryPoint = (x: number, y: number, o: number, out: Float64Array): void => {
    const node = nodePhases[o]!;
    const centerX = -imagingArea.widthMm / 2 + (pitch / 2 + x * pitch + 0) / 1000, centerY = -imagingArea.heightMm / 2 + (pitch / 2 + y * pitch + 0) / 1000;
    const sourceX = (centerX - siteWidthMm / 2 + node.xPhase * siteWidthMm) - node.aaX, sourceY = (centerY - siteWidthMm / 2 + node.yPhase * siteWidthMm) - node.aaY;
    const rx = projectionDistance * (sourceX / projectionDistance), ry = projectionDistance * (-sourceY / projectionDistance);
    const length = Math.hypot(rx, ry, projectionDistance), t = subjectDistanceM / (projectionDistance / length);
    out[0] = rx / length * t / metresPerFrameUnit; out[1] = ry / length * t / metresPerFrameUnit;
  };
  const signal = createDisplayViewExpectedSignal({ nativeWidth, nativeHeight, outputWidth: width, wavelengthsNm: wavelengths, electronsPerRadiance: perNode, offsets,
    ...(kernels ? { kernels } : { queryPoint }), scene, channelAt: channelIndex });
  // Readout moments per channel: normalized value k·e with variance k²·(e + σ_read²) plus the ADC quantization (1/12 code², times d² before a digital gain d).
  const readout = CHANNELS.map((channel): DisplayViewChannelReadout => {
    const { readoutProfile, regimeId } = regimeByChannel[channel];
    const resolved = resolveSensorReadoutRegime({ profile: readoutProfile as Parameters<typeof resolveSensorReadoutRegime>[0]["profile"], regimeId });
    const k = relativePerElectron[channel], digitalGain = resolved.regime.adc.digitalGain ?? 1, gain = resolved.regime.systemConversionGainElectronsPerCode.value;
    const codeSpan = digitalGain / (gain * k), read = resolved.combinedReadNoiseRmsElectrons;
    const quantizationCodes = digitalGain * digitalGain / 12 + (digitalGain === 1 ? 0 : 1 / 12);
    return { perElectron: k, darkElectrons: DARK_CURRENT_ELECTRONS_PER_SECOND * shutterSeconds, constantVariance: k * k * read * read + quantizationCodes / (codeSpan * codeSpan) };
  }) as [DisplayViewChannelReadout, DisplayViewChannelReadout, DisplayViewChannelReadout];
  const phases = bilinearPhaseProfiles(), demosaicTable: { dx: number; dy: number; weight: number }[][][] = [];
  for (const phase of phases) demosaicTable[phase.phaseY * 2 + phase.phaseX] = CHANNELS.map((c) => phase.profile.kernels.find((k) => k.outputChannelId === c)!.contributions
    .map((t) => ({ dx: t.offsetX, dy: t.offsetY, weight: t.weight })));
  const viewIntent = intentOf(viewWhiteBalanceState), viewGains = viewIntent ? [viewIntent.channelGains.red, viewIntent.channelGains.green, viewIntent.channelGains.blue] : null;
  const colour = prepareSensorColorDevelopment(CAMERA_TO_XYZ as unknown as Parameters<typeof prepareSensorColorDevelopment>[0], viewGains, highlightMode);
  const toSrgb = resolveCaptureColorModel().xyzToCameraRgb, m = colour.cameraToXyz;
  const matrix = [0, 1, 2].map((r) => [0, 1, 2].map((c) => toSrgb[r]![0]! * m[0]![c]! + toSrgb[r]![1]! * m[1]![c]! + toSrgb[r]![2]! * m[2]![c]!));
  const viewRegion = v.region ?? { x: 0, y: 0, width: v.width, height: v.height };
  // Reach of a footprint's pixels into the scene, in sites: the demosaic (1), the largest query offset and the kernel radius.
  const reachSites = (ahd ? 3 : 1) + Math.ceil(Math.max(0, ...offsets.map((o) => Math.max(Math.abs(o.x), Math.abs(o.y))))) + (kernels ? kernels.radius : 0);
  const rendered = await renderDisplayView({ frameWidth: width, frameHeight: height, margin, nativeWidth, nativeHeight, viewWidth: v.width, viewHeight: v.height,
    region: viewRegion, samplesPerAxis: v.samplesPerAxis, reachSites, bitDepth: v.bitDepth, seed: noiseSeed, signal, readout, demosaic: demosaicTable,
    ...(ahd ? { candidates: [0, 1, 2, 3].map((p) => ahdCandidateKernels(p % 2, Math.floor(p / 2))),
      ahdCorrection: { labMatrix: CAMERA_TO_XYZ.map((row) => row.map((value, c) => value * (viewGains ? viewGains[c]! : 1))), drawsPerState: DISPLAY_VIEW_AHD_CORRECTION_DRAWS,
        thresholdVariance: DISPLAY_VIEW_AHD_CORRECTION_THRESHOLD * DISPLAY_VIEW_AHD_CORRECTION_THRESHOLD } } : {}),
    gains: colour.appliedGains as [number, number, number], clipLevel: Math.min(...colour.appliedGains), matrix, toneCurve: toneCurve as "identity" | "positive-reinhard-per-channel",
    yieldControl, checkAbort });
  if (viewInternals) { viewInternals.value = rendered; viewInternals.signal = signal; }
  const viewMs = clockMs() - viewStarted, scaleX = width / v.width, scaleY = height / v.height;
  assume("view.definition", "model", { resampling: "area-average-linear-light", width: v.width, height: v.height, frameWidth: width, frameHeight: height, scaleX, scaleY },
    "The image the full-resolution capture of this request would give after resizing to " + v.width + " × " + v.height + ": each display pixel is the area-weighted mean, in linear light (sRGB samples decoded with the sRGB EOTF), " +
    "of the real output pixels its rectangle covers (" + scaleX + " × " + scaleY + " real pixels), then sRGB-encoded and rounded. The real capture's own samples are rounded to the view's bit depth before averaging.");
  const uniformSamplesPerAxis = Math.max(1, Math.round(v.samplesPerAxis / 4));
  assume("view.estimation", "model", { method: "stratified-monte-carlo-over-real-pixels", samplesPerAxis: v.samplesPerAxis, uniformSamplesPerAxis,
    detailPixels: rendered.detailPixelCount, uniformPixels: rendered.uniformPixelCount },
    "Each display pixel's expected value is the mean over K × K strata of its rectangle, one seeded uniformly jittered real pixel in each, so it is unbiased; the error is zero where the rectangle is uniform " +
    "and falls as K^-3/2 at an edge. K = " + v.samplesPerAxis + " where a fixed pilot grid over the rectangle (widened by the demosaic, filter and kernel reach) or a neighbouring pixel's grid finds more than one scene value, " +
    "K = " + uniformSamplesPerAxis + " elsewhere. For each sampled pixel the expected electrons of the real sites its demosaic reads are exact at the real pitch (the scene sampled at those sites through the pixel aperture, " +
    "anti-aliasing filter and diffraction kernels, with the capture's own query arithmetic, so the colour mosaic and its aliasing are the real sensor's), and the per-site clip at white, the highlight clip, the tone curve " +
    "and the clip to [0, 1] act on the pixel's own noise distribution, approximated as normal.");
  assume("view.noise", "model", { method: "variance-of-the-area-mean", distribution: "normal" },
    "Noise of the mean of the real pixels: the covariance of the weighted sum of independent site noises (shot, dark, read and ADC), with the demosaic correlation (B_c = Σ β², in closed form from the rectangle) and the " +
    "expected slopes of the clips and the tone curve (Stein's lemma); the variance the linearization misses and the real pixels' output rounding are added per pixel. One correlated normal draw per display pixel, seeded " +
    "by sensor.noiseSeed: the same statistics as the resized capture, not the same realization.");
  assume("view.demosaic", "model", ahd ? { capture: "ahd", view: "ahd-candidates-with-low-signal-correction", correctedPixels: rendered.ahdCorrectedPixelCount,
    correctionDrawsPerState: DISPLAY_VIEW_AHD_CORRECTION_DRAWS, correctionThresholdLinearStd: DISPLAY_VIEW_AHD_CORRECTION_THRESHOLD } : { capture: "bilinear", view: "bilinear" },
    ahd ? "AHD is non-linear only in its choice between two linear candidates (green along the rows or the columns, red and blue from colour differences). The view propagates both candidates' exact linear statistics " +
      "and averages them. Where a sampled pixel's noise exceeds " + DISPLAY_VIEW_AHD_CORRECTION_THRESHOLD + " (linear light), the choice reacts to the noise and shifts the colour, so the pixel adds the mean " +
      "difference between the engine's AHD steps and the two candidates on " + DISPLAY_VIEW_AHD_CORRECTION_DRAWS + " drawn noisy flat neighbourhoods (Poisson electrons plus read and ADC noise) with its channel means, " +
      "computed once per state of a logarithmic grid (8 steps per octave of the channel means) and interpolated trilinearly, a control variate with no per-pixel sampling noise; " +
      "the flat-neighbourhood state is an approximation at edges (docs/DISPLAY_VIEW.md, validation)." :
      "The bilinear demosaic's linear kernels, exactly.");
  assume("view.source", "model", { rendering: "srgb", format: v.format, ignoredCaptureOutput: ["format", "colorEncoding", "bitDepth", "gamutMapping", "jpegQuantizationStep", "dng", "metadata", "maximumPixels"].filter((k) => outputOptions[k] !== undefined) },
    "The view shows the capture's sRGB rendering (its tone curve, white balance and highlight mode); the capture's file-format options do not apply to it.");
  return Object.freeze({ kind: "display-view" as const, label: "Display view: the full-resolution capture resized to " + v.width + " × " + v.height + " (estimated); not a capture.",
    facadeVersion: SIMULATE_CAPTURE_FACADE_VERSION, engineApiVersion: ENGINE_API_VERSION,
    image: { width: viewRegion.width, height: viewRegion.height, format: v.format, samples: rendered.samples },
    view: { width: v.width, height: v.height, frameWidth: width, frameHeight: height, scaleX, scaleY, samplesPerAxis: v.samplesPerAxis, ...(v.region ? { region: { ...v.region } } : {}) },
    exposure: { mode, settings: { fNumber, shutterSeconds, iso: resolvedIso }, ev100: Math.log2(fNumber ** 2 / shutterSeconds) },
    scene: { sceneId: chart ? "chart:" + chart.preset : callerScene!.sceneId, preset: scenePreset, parameters: chart ? chart.parameters : {},
      illuminant: { id: illuminant.id, description: illuminant.description, illuminanceLux }, distanceM: subjectDistanceM,
      framedWidthM: 2 * metresPerFrameUnit, framedHeightM: 2 * metresPerFrameUnit * aspect, ...(chartReport ? { chart: chartReport } : {}), sourceSha256 },
    diagnostics: { sampleCount: rendered.sampleCount, siteEvaluations: rendered.siteCount, sceneLookups: signal.lookups, detailPixelCount: rendered.detailPixelCount,
      uniformPixelCount: rendered.uniformPixelCount, ahdCorrectedPixelCount: rendered.ahdCorrectedPixelCount, timingsMs: { view: viewMs, total: Date.now() - started } },
    provenance: { scientificStatus: "approximation" as const, cameraPresetId: preset.presetId, cameraPresetVersion: preset.presetVersion, evidence: [...FACADE_EVIDENCE, ...preset.evidence],
      composedContracts: ["calculateEnvironmentSensorPhotoSignal", "resolveSensorReadoutRegime", "calculateSiteEffectiveSaturationCode", ...(diffraction ? ["createDiffractionLimitedPsfProfile", "resolveLensPsfConvolutionKernels"] : []),
        ...(antiAliasing ? ["resolveAntiAliasingSpatialKernel"] : []), "prepareSensorColorDevelopment", "display view estimator"],
      limitations: ["Estimated display view of the full-resolution capture: its expected value is a stratified Monte Carlo estimate and its noise is drawn from the variance of the area mean, so it has the resized capture's statistics, not its exact pixels; not a capture and not a measurement."] },
    assumptions: Object.freeze(assumptions.map((a) => Object.freeze(a))) });
}
