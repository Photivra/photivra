// SPDX-License-Identifier: Apache-2.0

/**
 * Paired photographic export: writes one simulated RAW capture as a lossless DNG and, from the same RAW,
 * develops and writes a baseline JPEG.
 *
 * The JPEG path reconstructs colour from the CFA (colour filter array) mosaic, applies an approximate
 * camera colour profile and white balance (WB), optional lens correction, orientation and crop, and SDR
 * rendering. The DNG keeps the native RAW codes unchanged.
 * @see docs/PHOTOGRAPHIC_EXPORT.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */
// This product includes DNG technology under license by Adobe.

import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";

import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseEvidenceList, type EvidenceProvenance } from "../core/evidence-provenance.js";
import { LINEAR_CAPTURE_RGB_PROFILE, resolveCaptureColorModel } from "../color/capture-color.js";
import { invertSensorColorMatrix, prepareSensorColorDevelopment, sensorColorReferenceWhite, type RawHighlightMode } from "../color/sensor-color-development.js";
import { ICC_D50_WHITE_XYZ } from "../color/srgb-icc.js";
import { chromaticAdaptationMatrix } from "../color/chromatic-adaptation.js";
import { createRawPixelDeveloper, type RawDevelopmentSource } from "./raw-development-kernel.js";
import type { RawHighlightDiagnostics } from "./native-raw-development.js";
import { calculateSdrRendering, parseSdrRenderingProfile, type SdrRenderingProfile, type SdrRenderingResult } from "../output/sdr-rendering.js";
import { transformOrientedRasterPointToNative, transformOrientedRasterRectToNative, type RasterRect } from "../output/capture-geometry.js";
import { resolveRawFrameReconstruction, parseRawFrameReconstructionInput, type RawFrameReconstructionInput, type RawFrameReconstruction } from "./raw-frame-reconstruction.js";
import { createCaptureExportMetadataPair, type CaptureExportMetadataInput, type CaptureExportMetadataPair } from "./capture-export-metadata.js";
import { encodeExportJpeg } from "./export-jpeg.js";
import { packExportTiff, exportTiffAscii as ascii, exportTiffNumbers as numbers, exportTiffRationals as rationals,
  exportTiffBytes as rawBytes, exportTiffDoubles as doubles, packExportJpegExif, type ExportTiffTag } from "./export-tiff.js";
import { calculateCaptureCorrectedSdr, parseCaptureCorrectionChoice,
  type CaptureCorrectedSdrInput, type CaptureCorrectedSdrResult } from "../output/capture-corrected-sdr.js";
import { resolveLensCorrectionPlan, type ResolvedLensCorrectionPlan } from "../output/lens-corrections.js";
import { parseSimulatedCapture } from "./simulated-capture.js";
import { approximationResult, type CalculationResult } from "../core/calculation-result.js";

export const PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION = "0.1.0" as const;
/**
 * Version of the RAW and processed pipeline, recorded in XMP.
 *
 * 0.2.0: development scales to the effective white level, handles saturation, and fixes WB for colour
 * matrices that are not white-normalized. DNG output fixes WhiteLevel, AsShotNeutral and BlackLevel/CFA
 * phase, and adds the DNG 1.4 tags ForwardMatrix1, BaselineExposure, NoiseProfile and AnalogBalance.
 */
export const PHOTOGRAPHIC_EXPORT_PIPELINE_VERSION = "0.2.0" as const;
/** Version of the `processed-sensor-raw-sdr` model (0.2.0: scaling to effective white, saturation and WB fixes). */
export const PROCESSED_SENSOR_RAW_MODEL_VERSION = "0.2.0" as const;
type Matrix = readonly (readonly number[])[];
/** Explicit, approximate conversion from normalized camera channels to scene XYZ (D65). Never guessed from RGB or CFA channel names. */
export interface ExportSensorColorProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  profileVersion: string;
  colorSamplingProfileId: string;
  channelIds: readonly ["red", "green", "blue"];
  scientificStatus: "approximation";
  referenceIlluminant: "D65";
  normalizedCameraChannelsToXyz: Matrix;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
/** Optional export settings. The engine uses no files, clocks, randomness, network or external encoder. */
export interface PhotographicExportInput {
  reconstruction: RawFrameReconstructionInput;
  colorProfile: ExportSensorColorProfile;
  whiteBalance: "not-required" | "apply-resolved-sensor-gains";
  rendering: SdrRenderingProfile;
  metadata: Omit<CaptureExportMetadataInput, "capture">;
  /** Public scene ID and version declared by the caller. They must match the committed scene state. */
  sceneProfile: { id: string; version: string; sceneStateId: string };
  /** JPEG constant quantization step, 1..255. It is not an imitation of a manufacturer's "quality" scale. */
  jpegQuantizationStep: number;
  /** Optional lens correction in native optical coordinates, applied after colour. JPEG only; the RAW records it as information. */
  correction?: CaptureCorrectedSdrInput["correction"];
  /** How RAW highlights are handled before WB; default `clip`. See `prepareSensorColorDevelopment`. */
  highlightMode?: RawHighlightMode;
}
/** Options for {@link createPhotographicExportPair}. */
export interface PhotographicExportOptions {
  /** Aborting rejects with a domain error at the next step. No partial pair is returned. */
  signal?: AbortSignal;
}
/** Explicit RAW development settings (after the ADC), shared by the preview and the file output. */
export type ProcessedSensorRawInput = Pick<PhotographicExportInput,
  "reconstruction" | "colorProfile" | "whiteBalance" | "rendering" | "correction" | "highlightMode">;
/**
 * Processing record for the preview and JPEG, derived from the exact attached native RAW.
 *
 * Each step (reconstruction, colour, WB, correction, rendering) reports its input and output domains and
 * its own clipping and cost diagnostics. The output view is oriented and cropped SDR. The native default
 * crop and the physical capture history are unchanged. The returned arrays are the pixels before file
 * encoding, not a decoded (lossy) JPEG.
 */
export interface ProcessedSensorRawResult {
  inputDomain: "post-adc-native-sensor-raw";
  colorProfile: ExportSensorColorProfile;
  whiteBalancePolicy: ProcessedSensorRawInput["whiteBalance"];
  outputDomain: "output-referred-srgb-d65-sdr";
  physicalCaptureModified: false;
  displayAdaptationApplied: false;
  whiteBalance: "applied-here" | "not-required";
  source: CalculationResult<RawFrameReconstruction>;
  rendering: CalculationResult<SdrRenderingResult>;
  nativeDefaultCrop: RasterRect;
  processedOutputView: PhotographicExportPair["processedOutputView"];
  correction: CalculationResult<CaptureCorrectedSdrResult> | null;
  rawCorrectionIntent: CalculationResult<ResolvedLensCorrectionPlan> | null;
  /** RAW saturation handled before WB, over the developed image. */
  highlight: RawHighlightDiagnostics;
}
/** The byte arrays belong to the caller and can be changed. IDs and hashes refer to the exact bytes as first returned. */
export interface PhotographicExportPair {
  schemaVersion: typeof PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION;
  metadata: CaptureExportMetadataPair;
  simulationHashAlgorithm: "sha-256";
  simulationHash: string;
  rawDataUniqueId: string;
  uniqueCameraModel: string;
  source: CalculationResult<RawFrameReconstruction>;
  rendering: CalculationResult<SdrRenderingResult>;
  nativeDefaultCrop: RasterRect;
  /** The JPEG's rectangle in the oriented output. It never replaces the RAW's default crop. */
  processedOutputView: { rect: RasterRect; pixelWidth: number; pixelHeight: number };
  correction: CalculationResult<CaptureCorrectedSdrResult> | null;
  rawCorrectionIntent: CalculationResult<ResolvedLensCorrectionPlan> | null;
  /** RAW saturation handled before WB in the JPEG development. */
  highlight: RawHighlightDiagnostics;
  imageDataPairing: "jpeg-generated-from-exact-attached-raw";
  dng: { mediaType: "image/dng"; bytes: Uint8Array; sha256: string };
  jpeg: { mediaType: "image/jpeg"; bytes: Uint8Array; sha256: string };
  interoperability: "independent-decode-required-editor-validation-pending";
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(value, keys, "Invalid photographic export fields.");
}
function id(value: unknown): string {
  return requirePublicOpaqueId(value, "Invalid public export profile identity.");
}
/** Validates the separately supplied numeric colour-profile evidence, and ties the approximate profile to the exact CFA profile. */
export function parseExportSensorColorProfile(value: unknown): ExportSensorColorProfile {
  const r=object(value,["schemaVersion","profileId","profileVersion","colorSamplingProfileId","channelIds","scientificStatus","referenceIlluminant","normalizedCameraChannelsToXyz","evidence","limitations"]);
  const m=r.normalizedCameraChannelsToXyz;
  if (r.schemaVersion!=="0.1.0" || r.scientificStatus!=="approximation" || r.referenceIlluminant!=="D65" || JSON.stringify(r.channelIds)!=='["red","green","blue"]' ||
      !Array.isArray(m) || m.length!==3 || m.some((row) => !Array.isArray(row) || row.length!==3 || Array.from(row).some((v) => typeof v!=="number" || !Number.isFinite(v) || Math.abs(v)>100)) ||
      !Array.isArray(r.limitations) || r.limitations.length===0 || r.limitations.length>16 || Array.from(r.limitations).some((s) => typeof s!=="string" || s.length===0 || s.length>512)) throw new InvalidConfigurationError("Unsupported sensor color interpretation.");
  const matrix=(m as number[][]).map((row) => [...row]); invertSensorColorMatrix(matrix);
  const evidence=parseEvidenceList(r.evidence,"exportColor.evidence");
  if (evidence.some((e) => e.reuseStatus==="factual-reference-only")) throw new InvalidConfigurationError("Embedded numeric color profiles require reusable or owned evidence.");
  return { schemaVersion:"0.1.0",profileId:id(r.profileId),profileVersion:id(r.profileVersion),colorSamplingProfileId:id(r.colorSamplingProfileId),
    channelIds:["red","green","blue"],scientificStatus:"approximation",referenceIlluminant:"D65",normalizedCameraChannelsToXyz:matrix,evidence,limitations:[...r.limitations] as string[] };
}
/** Quick geometry and layout checks, run after the RAW is revalidated and before any pixel work. */
export function validateProcessedSensorRawEnvelope(reconstruction: Pick<RawFrameReconstructionInput, "region"> & { rawFrame: Pick<RawFrameReconstructionInput["rawFrame"], "capture"> }, corrected: boolean): { local: RasterRect; nativeDefaultCrop: RasterRect } {
  const frame=reconstruction.rawFrame, capture=frame.capture, g=capture.resolvedGeometry,
    active=g.activeCapture.nativeRect, crop=g.output.cropRect, raster=g.output.raster, region=reconstruction.region;
  if (raster.pixelWidth!==crop.width || raster.pixelHeight!==crop.height) throw new InvalidConfigurationError("Initial paired export requires 1:1 output crop sampling; resampling is unsupported.");
  const local=transformOrientedRasterRectToNative({ rect:crop,nativeRaster:g.activeCapture.raster,orientation:capture.geometry.orientation });
  const nativeDefaultCrop={ ...local,x:local.x+active.x,y:local.y+active.y };
  if (nativeDefaultCrop.x<region.x || nativeDefaultCrop.y<region.y || nativeDefaultCrop.x+nativeDefaultCrop.width>region.x+region.width ||
      nativeDefaultCrop.y+nativeDefaultCrop.height>region.y+region.height) throw new InvalidConfigurationError("Reconstruction does not cover the exact declared final native crop.");
  if (corrected && (active.x<region.x || active.y<region.y || active.x+active.width>region.x+region.width ||
      active.y+active.height>region.y+region.height)) throw new InvalidConfigurationError("Corrected export requires reconstruction of the full active native RAW area.");
  return {local,nativeDefaultCrop};
}
function requireDngTopology(frame: RawFrameReconstructionInput["rawFrame"]): void {
  const layout=frame.colorSamplingProfile.layout;
  if (layout.kind!=="periodic-mosaic" || layout.repeatWidthSites!==2 || layout.repeatHeightSites!==2 || !["red","green","green","blue"].every((ch) => layout.siteChannelIds.includes(ch)) ||
      layout.siteChannelIds.filter((ch) => ch==="red").length!==1 || layout.siteChannelIds.filter((ch) => ch==="blue").length!==1 ||
      layout.siteChannelIds.filter((ch) => ch==="green").length!==2) throw new InvalidConfigurationError("Initial DNG profile supports explicitly registered 2x2 RGB Bayer topology only.");
}
/**
 * Revalidates one attached RAW snapshot and the explicit processing settings.
 *
 * Crop sampling and reconstruction coverage problems fail here, before per-pixel work. Passing this
 * check does not prove kernel support at the edges, correction support or that the file can be encoded;
 * those are still checked during execution. The input is copied. No file or display code runs.
 */
export function parseProcessedSensorRawInput(value: unknown): ProcessedSensorRawInput {
  const r=object(value,["reconstruction","colorProfile","whiteBalance","rendering","correction","highlightMode"]);
  if (r.highlightMode!==undefined && r.highlightMode!=="clip" && r.highlightMode!=="reconstruct") throw new InvalidConfigurationError("Unsupported RAW highlight mode.");
  const reconstruction=parseRawFrameReconstructionInput(r.reconstruction), colorProfile=parseExportSensorColorProfile(r.colorProfile), rendering=parseSdrRenderingProfile(r.rendering);
  const intent=reconstruction.rawFrame.capture.whiteBalanceIntent;
  if (colorProfile.colorSamplingProfileId!==reconstruction.rawFrame.colorSamplingProfile.profileId ||
      reconstruction.phaseProfiles.some((p) => JSON.stringify(p.profile.kernels.map((k) => k.outputChannelId))!==JSON.stringify(colorProfile.channelIds)) ||
      (r.whiteBalance!=="not-required" && r.whiteBalance!=="apply-resolved-sensor-gains") ||
      ((r.whiteBalance==="not-required") !== (intent===null))) throw new InvalidConfigurationError("Processed RAW color/WB/rendering identities are inconsistent.");
  const correction=r.correction===undefined ? undefined : parseCaptureCorrectionChoice(r.correction,
    reconstruction.rawFrame.capture,["photivra-export-developed"]);
  if (correction?.resampler.antialias!==undefined && correction.resampler.antialias!=="none") {
    throw new InvalidConfigurationError("RAW-derived processing has no source prefilter; prefiltered declarations are unsupported.");
  }
  validateProcessedSensorRawEnvelope(reconstruction,correction!==undefined);
  return { reconstruction,colorProfile,whiteBalance:r.whiteBalance,rendering,...(correction===undefined ? {} : {correction}),
    ...(r.highlightMode===undefined ? {} : {highlightMode:r.highlightMode}) };
}
/** Adds file metadata and encoding checks to the shared RAW processing settings. */
export function parsePhotographicExportInput(value: unknown): PhotographicExportInput {
  const r=object(value,["reconstruction","colorProfile","whiteBalance","rendering","metadata","sceneProfile","jpegQuantizationStep","correction","highlightMode"]);
  const processed=parseProcessedSensorRawInput({reconstruction:r.reconstruction,colorProfile:r.colorProfile,whiteBalance:r.whiteBalance,rendering:r.rendering,
    ...(r.correction===undefined ? {} : {correction:r.correction}),...(r.highlightMode===undefined ? {} : {highlightMode:r.highlightMode})});
  requireDngTopology(processed.reconstruction.rawFrame);
  if (processed.rendering.bitDepth!==8) throw new InvalidConfigurationError("Initial JPEG export requires 8-bit SDR.");
  const meta=object(r.metadata,["workflow","capturedAtUtc","raw","jpeg"]);
  const metadata=createCaptureExportMetadataPair({ ...meta, capture:processed.reconstruction.rawFrame.capture } as unknown as CaptureExportMetadataInput);
  const scene=object(r.sceneProfile,["id","version","sceneStateId"]), sceneProfile={id:id(scene.id),version:id(scene.version),sceneStateId:id(scene.sceneStateId)};
  if (sceneProfile.sceneStateId!==processed.reconstruction.rawFrame.capture.sceneStateId || !Number.isInteger(r.jpegQuantizationStep) ||
      (r.jpegQuantizationStep as number)<1 || (r.jpegQuantizationStep as number)>255) throw new InvalidConfigurationError("Export scene identity or encoder settings are inconsistent.");
  return { ...processed,sceneProfile,metadata:{ workflow:metadata.shared.workflow,capturedAtUtc:metadata.shared.capturedAtUtc,
    raw:{ documentId:metadata.raw.documentId,instanceId:metadata.raw.instanceId }, jpeg:{ documentId:metadata.jpeg.documentId,instanceId:metadata.jpeg.instanceId } },
    jpegQuantizationStep:r.jpegQuantizationStep as number };
}
function canonical(value: unknown): string {
  return stringifyCanonicalJson(value, {
    undefinedObjectProperties: "reject",
    nonFiniteNumberMessage: "Export hash requires finite canonical JSON.",
    unsupportedValueMessage: "Export hash requires finite canonical JSON."
  });
}

function requireWebCrypto(): void {
  if (!globalThis.crypto?.subtle) throw new InvalidConfigurationError("Paired export requires Web Crypto SHA-256 (crypto.subtle). Browsers expose it only in secure contexts (HTTPS or localhost); Node.js 22+ provides it globally.");
}
async function hash(value: Uint8Array | string): Promise<string> {
  requireWebCrypto();
  const data=typeof value==="string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const result=await globalThis.crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(result),(v) => v.toString(16).padStart(2,"0")).join("");
}
function xmp(pair: CaptureExportMetadataPair, role: "raw" | "jpeg", simulationHash: string, color: ExportSensorColorProfile, mode: string, scene: PhotographicExportInput["sceneProfile"], corrected?: { choice: NonNullable<PhotographicExportInput["correction"]>; rect: RasterRect; clippingEvents: number }): Uint8Array {
  const s=pair.shared, artifact=pair[role];
  const values: Record<string,string>={ "xmp:CreatorTool":s.creatorTool,"xmpMM:DocumentID":"uuid:"+artifact.documentId,"xmpMM:InstanceID":"uuid:"+artifact.instanceId,
    "Iptc4xmpExt:DigitalImageGUID":"urn:uuid:"+artifact.documentId,"Iptc4xmpExt:DigitalSourceType":s.digitalSourceTypeUri,
    "photivra:SchemaVersion":"1.0","photivra:SimulatedCapture":"True","photivra:CaptureID":s.captureId,"photivra:OutputRole":role,
    "photivra:EngineVersion":s.engineApiVersion,"photivra:CaptureContractVersion":s.captureContractVersion,"photivra:RawPipelineVersion":PHOTOGRAPHIC_EXPORT_PIPELINE_VERSION,
    "photivra:SceneID":scene.id,"photivra:SceneVersion":scene.version,"photivra:SensorProfileID":color.profileId,"photivra:CaptureMode":mode,"photivra:RawSampleModel":"post_adc_pre_demosaic",
    "photivra:DeterministicSeed":String(s.noise.seedUint32),"photivra:SimulationHashAlgorithm":"sha-256","photivra:SimulationHash":simulationHash,
    "photivra:SceneTime":String(s.sceneTimeSeconds) };
  if (corrected) {
    values["photivra:CorrectionProfileID"]=corrected.choice.profile.id;
    values["photivra:CorrectionProfileVersion"]=corrected.choice.profile.version;
    values["photivra:CorrectionSelectionKind"]=corrected.choice.selectionKind;
    values["photivra:CorrectionSelections"]=canonical(corrected.choice.selections);
    values["photivra:CorrectionDisposition"]=role==="raw" ? "informational-intent-only" : "processed-view";
    values["photivra:ProcessedOutputRect"]=canonical(corrected.rect);
    values["photivra:ProcessedIlluminationClippingEvents"]=String(corrected.clippingEvents);
  }
  if (role==="jpeg") values["photivra:ProcessedPipelineVersion"]=PHOTOGRAPHIC_EXPORT_PIPELINE_VERSION;
  if (s.focus.kind==="finite") values["photivra:FocusDistanceMeters"]=String(s.focus.distanceM);
  const escape=(v: string): string => v.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  const attributes=Object.entries(values).map(([k,v]) => k+'="'+escape(v)+'"').join(" ");
  return new TextEncoder().encode('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:photivra="https://photivra.com/ns/simulation/1.0/" '+attributes+'/></rdf:RDF></x:xmpmeta>');
}
function commonExif(pair: CaptureExportMetadataPair, role: "raw" | "jpeg", width: number, height: number): ExportTiffTag[] {
  const s=pair.shared,e=s.exposure;
  if (!Number.isInteger(e.iso) || e.iso>65535) throw new InvalidConfigurationError("Initial export records only integer virtual REI values up to 65535.");
  const date=s.capturedAtUtc.slice(0,19).replaceAll("-",":").replace("T"," ");
  return [rawBytes(36864,7,new TextEncoder().encode("0232")),rationals(33434,false,[e.shutterSeconds]),rationals(33437,false,[e.aperture]),
    numbers(34855,3,[e.iso]),numbers(34864,3,[2]),numbers(34866,4,[e.iso]),ascii(36867,date),ascii(36881,"+00:00"),ascii(37521,s.capturedAtUtc.slice(20,23)),
    rationals(37386,false,[e.focalLengthMm]),numbers(40962,4,[width]),numbers(40963,4,[height]),numbers(40961,3,[role==="jpeg" ? 1 : 65535]),
    ascii(42016,pair[role].documentId.replaceAll("-","")),
    ...(Math.round(s.equivalentFocalLength35Mm)<=65535 ? [numbers(41989,3,[Math.round(s.equivalentFocalLength35Mm)])] : [])];
}
function identity(pair: CaptureExportMetadataPair, orientation: number): ExportTiffTag[] {
  return [ascii(271,pair.shared.make),ascii(272,pair.shared.model),ascii(305,pair.shared.software),numbers(274,3,[orientation])];
}
function developmentFor(color: ExportSensorColorProfile, intent: ProcessedSensorRawInput["reconstruction"]["rawFrame"]["capture"]["whiteBalanceIntent"],
  highlightMode: RawHighlightMode): ReturnType<typeof prepareSensorColorDevelopment> {
  return prepareSensorColorDevelopment(color.normalizedCameraChannelsToXyz,
    intent ? [intent.channelGains.red,intent.channelGains.green,intent.channelGains.blue] : null, highlightMode);
}
/** Typed-array view of a bounded attached RAW frame. The frame parser guarantees one white level per CFA phase. */
function frameDevelopmentSource(frame: RawFrameReconstruction["rawFrame"]): RawDevelopmentSource {
  const layout=frame.colorSamplingProfile.layout;
  if (layout.kind!=="periodic-mosaic") throw new InvalidConfigurationError("Development requires periodic CFA.");
  const n=frame.samples.length, codes=new Uint16Array(n), blacks=new Uint16Array(n), flags=new Uint8Array(n),
    white=new Uint16Array(layout.repeatWidthSites*layout.repeatHeightSites);
  frame.samples.forEach((s,i) => {
    const x=i%frame.nativePixelWidth, y=Math.floor(i/frame.nativePixelWidth);
    codes[i]=s.rawCode; blacks[i]=s.blackLevelCode;
    flags[i]=Number(s.physicalScalarSaturationApplied)|Number(s.digitalSaturationApplied)<<2;
    white[(y%layout.repeatHeightSites)*layout.repeatWidthSites+x%layout.repeatWidthSites]=s.effectiveSaturationCode;
  });
  return {nativeWidth:frame.nativePixelWidth,repeatWidth:layout.repeatWidthSites,repeatHeight:layout.repeatHeightSites,codes,blackLevels:blacks,saturationFlags:flags,whiteByPhase:white};
}
/** Reconstructs the exact attached RAW, develops colour and WB once, corrects, orients and crops, and encodes SDR. No file or display I/O. */
export function calculateProcessedSensorRaw(input: ProcessedSensorRawInput): CalculationResult<ProcessedSensorRawResult> {
  const v=structuredClone(parseProcessedSensorRawInput(input));
  const source=resolveRawFrameReconstruction(v.reconstruction), frame=source.value.rawFrame, capture=frame.capture,
    g=capture.resolvedGeometry,
    active=g.activeCapture.nativeRect,crop=g.output.cropRect, raster=g.output.raster, region=source.value.region;
  const {nativeDefaultCrop}=validateProcessedSensorRawEnvelope(v.reconstruction,v.correction!==undefined);
  const intent=capture.whiteBalanceIntent, highlightMode=v.highlightMode ?? "clip";
  const development=developmentFor(v.colorProfile,intent,highlightMode), white=development.referenceWhiteXyz;
  const developedRaster=v.correction ? g.orientedCapture.raster : raster,
    developedRect=v.correction ? {x:0,y:0,width:developedRaster.pixelWidth,height:developedRaster.pixelHeight} : crop;
  // The attached RAW codes go through the shared typed kernel: effective white per phase, saturation handled before WB.
  // Reconstruction (above) already validated every kernel halo for the region, which covers this raster.
  const developer=createRawPixelDeveloper(frameDevelopmentSource(frame),source.value.phaseProfiles,development);
  const rgb: number[]=new Array<number>(developedRaster.pixelWidth*developedRaster.pixelHeight*3).fill(0);
  for (let y=0;y<developedRaster.pixelHeight;y++) for (let x=0;x<developedRaster.pixelWidth;x++) {
    const p=transformOrientedRasterPointToNative({ point:{x:developedRect.x+x+.5,y:developedRect.y+y+.5},nativeRaster:g.activeCapture.raster,orientation:capture.geometry.orientation });
    const nx=Math.floor(p.x)+active.x, ny=Math.floor(p.y)+active.y;
    if (nx<region.x || ny<region.y || nx>=region.x+region.width || ny>=region.y+region.height) throw new InvalidConfigurationError("Reconstruction does not cover the developed raster.");
    developer.developAt(nx,ny,rgb,(y*developedRaster.pixelWidth+x)*3);
  }
  const highlight: RawHighlightDiagnostics={mode:highlightMode,saturatedPixelCount:developer.counts.saturatedPixelCount,
    whiteBalanceClippedSampleCount:developer.counts.whiteBalanceClippedSampleCount,reconstructedPixelCount:developer.counts.reconstructedPixelCount};
  // This private processing plane comes only from reconstructing the exact attached RAW. The original float planes are dropped.
  const correction=v.correction ? calculateCaptureCorrectedSdr({capture:parseSimulatedCapture({...capture,planes:[{
    id:"photivra-export-linear",imageStateId:"photivra-export-developed",imageState:"color-transformed-linear-rgb",
    rasterBinding:"oriented-active-capture",pixelWidth:developedRaster.pixelWidth,pixelHeight:developedRaster.pixelHeight,
    channelIds:["red","green","blue"],colorProfile:LINEAR_CAPTURE_RGB_PROFILE,encodingReferenceWhiteXyz:white,referenceWhiteValue:1,
    whiteBalanceApplication:intent ? "applied-rgb-gains" : "not-applicable",captureSaturation:{kind:"not-modeled"},
    appliedTransforms:[{kind:"linear-color",profile:{id:v.colorProfile.profileId,version:v.colorProfile.profileVersion}}],
    storage:{kind:"inline-float64",samples:rgb}
  }]}),sourcePlaneId:"photivra-export-linear",color:{kind:"already-transformed"},profile:v.rendering,correction:v.correction}) : null;
  const rawCorrectionIntent=v.correction ? resolveLensCorrectionPlan({profile:v.correction.profile,state:v.correction.state,
    selections:v.correction.selections,selectionKind:v.correction.selectionKind,outputKind:"raw-like"}) : null;
  const processedOutputView=correction ? {rect:correction.value.outputView.rect,pixelWidth:correction.value.outputView.pixelWidth,
    pixelHeight:correction.value.outputView.pixelHeight} : {rect:{x:0,y:0,width:raster.pixelWidth,height:raster.pixelHeight},
    pixelWidth:raster.pixelWidth,pixelHeight:raster.pixelHeight};
  const rendering=correction?.value.rendering ?? calculateSdrRendering({ sourceImageStateId:frame.frameId+":developed",inputImageState:"color-transformed-linear-rgb",inputColorSpace:"linear-srgb-d65",
    whiteBalanceHandling:intent ? "already-applied-upstream" : "not-required",pixelWidth:raster.pixelWidth,pixelHeight:raster.pixelHeight,referenceWhiteValue:1,samples:rgb,profile:v.rendering });
  return approximationResult({ inputDomain:"post-adc-native-sensor-raw",colorProfile:v.colorProfile,whiteBalancePolicy:v.whiteBalance,outputDomain:"output-referred-srgb-d65-sdr",physicalCaptureModified:false,
    displayAdaptationApplied:false,whiteBalance:intent ? "applied-here" : "not-required",source,rendering,nativeDefaultCrop,processedOutputView,correction,rawCorrectionIntent,highlight }, "processed-sensor-raw-sdr", PROCESSED_SENSOR_RAW_MODEL_VERSION, [
    "Exact attached RAW codes are normalized to each CFA phase's effective white level, clipped and saturation-consumed before WB, then developed through explicit approximate sensor color; WB is applied once before correction and SDR.",
    "Output is encoded sRGB/D65 SDR; platform viewing adaptation and HDR encoding are not applied.",
    "Bounded reference reconstruction, correction support and 1:1 output crop remain explicit; physical capture is unchanged."
  ]);
}

/**
 * Writes one RAW capture as a lossless, uncompressed CFA DNG and a separately encoded baseline JPEG.
 * Shared metadata comes from the committed capture. Orientation, WB and rendering never rewrite the
 * native RAW codes.
 *
 * The DNG keeps one revalidated native RAW frame (after the ADC) unchanged. The JPEG develops that same
 * frame through explicit reconstruction, an approximate sensor-channel colour and WB conversion, and SDR
 * rendering. File identity and RAW data identity are separate. Hashing is asynchronous; input data is
 * copied before the first await. The full sensor is limited to 4096 sites.
 * @param input - The RAW reconstruction input, colour profile, white-balance mode, SDR rendering profile, file metadata and JPEG settings.
 * @returns The DNG and JPEG pair with their processing records. Success does not imply calibration.
 *
 * @see docs/API_REFERENCE.md for the package export and its full type definitions.
 */
export async function createPhotographicExportPair(input: PhotographicExportInput, options: PhotographicExportOptions = {}): Promise<PhotographicExportPair> {
  const opts=object(options,["signal"]), signal=opts.signal as AbortSignal | undefined;
  if (signal!==undefined && (typeof signal!=="object" || signal===null || typeof signal.aborted!=="boolean")) throw new InvalidConfigurationError("Export signal must be an AbortSignal.");
  const active=(): void => { if (signal?.aborted) throw new InvalidConfigurationError("Photographic export aborted."); };
  // Fail before any work when the context cannot hash (browsers expose crypto.subtle only in secure contexts).
  requireWebCrypto(); active();
  // Copy the validated inputs into private values before the first await, so later caller changes cannot affect hashing or encoding.
  const v=JSON.parse(JSON.stringify(parsePhotographicExportInput(input))) as PhotographicExportInput;
  const highlightMode=v.highlightMode ?? "clip";
  const processed=calculateProcessedSensorRaw({reconstruction:v.reconstruction,colorProfile:v.colorProfile,whiteBalance:v.whiteBalance,rendering:v.rendering,
    ...(v.correction===undefined ? {} : {correction:v.correction}),highlightMode}).value;
  const {source,rendering,nativeDefaultCrop,processedOutputView,correction,rawCorrectionIntent,highlight}=processed;
  const frame=source.value.rawFrame,capture=frame.capture,g=capture.resolvedGeometry,activeRect=g.activeCapture.nativeRect,region=source.value.region;
  const metadata=createCaptureExportMetadataPair({...v.metadata,capture});
  const {local}=validateProcessedSensorRawEnvelope(v.reconstruction,v.correction!==undefined);
  const colorMatrix=invertSensorColorMatrix(v.colorProfile.normalizedCameraChannelsToXyz),intent=capture.whiteBalanceIntent;
  const development=developmentFor(v.colorProfile,intent,highlightMode);
  const correctedMetadata=v.correction && correction ? {choice:v.correction,rect:processedOutputView.rect,
    clippingEvents:correction.value.correction.value.illuminationClippingEventCount} : undefined;
  const layout=frame.colorSamplingProfile.layout;
  if (layout.kind!=="periodic-mosaic") throw new InvalidConfigurationError("Initial DNG profile supports explicitly registered 2x2 RGB Bayer topology only.");
  const dng=dngLevels(frame,activeRect);
  const simulationHash=await hash(canonical({ schema:PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION,pipeline:PHOTOGRAPHIC_EXPORT_PIPELINE_VERSION,rawFrame:frame,phaseProfiles:source.value.phaseProfiles,region,
    colorProfile:v.colorProfile,sceneProfile:v.sceneProfile,whiteBalance:v.whiteBalance,rendering:v.rendering,jpegQuantizationStep:v.jpegQuantizationStep,highlightMode,
    ...(v.correction ? {correction:v.correction} : {}) }));
  active();
  const rawHash=await hash(canonical({ schema:"photivra-raw-data-id-0.1",width:frame.nativePixelWidth,height:frame.nativePixelHeight,
    cfa:layout,containerBitDepth:16,codes:frame.samples.map((s) => s.rawCode) })),rawDataUniqueId=rawHash.slice(0,32);
  active();
  const colorHash=await hash(canonical(v.colorProfile)),uniqueCameraModel="Photivra Virtual Camera "+v.colorProfile.profileId+" "+v.colorProfile.profileVersion+" "+colorHash;
  active();
  const orientation={landscape:1,"portrait-clockwise":6,"landscape-inverted":3,"portrait-counter-clockwise":8}[capture.geometry.orientation];
  const pixels=new Uint8Array(frame.samples.length*2), view=new DataView(pixels.buffer); frame.samples.forEach((s,i) => view.setUint16(i*2,s.rawCode,true));
  const strip={...numbers(273,4,[0]),pointer:"pixels" as const};
  // ForwardMatrix1 maps white-balanced camera values to XYZ(D50) with [1,1,1] -> D50 white:
  // FM = Bradford(D65->D50) * M * diag(w), w = M^-1 * XYZ(D65) (unnormalized camera white).
  const cameraWhite=sensorColorReferenceWhite(colorMatrix), m=v.colorProfile.normalizedCameraChannelsToXyz, chad=chromaticAdaptationMatrix({transform:"bradford",sourceWhiteXyz:resolveCaptureColorModel().referenceWhiteXyz,destinationWhiteXyz:{x:ICC_D50_WHITE_XYZ[0],y:1,z:ICC_D50_WHITE_XYZ[2]}}).matrix;
  const forward=chad.map((row) => [0,1,2].map((j) => row.reduce((sum,x,k) => sum+x*m[k]![j]!*cameraWhite[j]!,0)));
  const dngBytes=packExportTiff([...identity(metadata,orientation),numbers(254,4,[0]),numbers(256,4,[frame.nativePixelWidth]),numbers(257,4,[frame.nativePixelHeight]),
    numbers(258,3,[16]),numbers(259,3,[1]),numbers(262,3,[32803]),strip,numbers(277,3,[1]),numbers(278,4,[frame.nativePixelHeight]),numbers(279,4,[pixels.length]),
    numbers(284,3,[1]),numbers(339,3,[1]),numbers(33421,3,[2,2]),numbers(33422,1,dng.cfaPattern),
    numbers(50706,1,[1,4,0,0]),numbers(50707,1,[1,1,0,0]),ascii(50708,uniqueCameraModel),numbers(50710,1,[0,1,2]),numbers(50711,3,[1]),numbers(50713,3,[2,2]),
    rationals(50714,false,dng.black),numbers(50717,4,[dng.whiteLevel]),numbers(50719,4,[local.x,local.y]),numbers(50720,4,[local.width,local.height]),
    rationals(50721,true,colorMatrix.flat()),rationals(50727,false,[1,1,1]),rationals(50728,false,[...development.asShotNeutral]),
    rationals(50730,true,[v.rendering.renderingExposureEv]),numbers(50778,3,[21]),
    rawBytes(50781,1,Uint8Array.from(rawDataUniqueId.match(/../g)!.map((s) => parseInt(s,16)))),numbers(50829,4,[activeRect.y,activeRect.x,activeRect.y+activeRect.height,activeRect.x+activeRect.width]),
    rationals(50964,true,forward.flat()),...(dng.noiseProfile ? [doubles(51041,dng.noiseProfile)] : []),
    rawBytes(700,1,xmp(metadata,"raw",simulationHash,v.colorProfile,frame.modeId,v.sceneProfile,correctedMetadata))],commonExif(metadata,"raw",local.width,local.height),pixels);
  // Exif 2.32 mandatory tags for a compressed primary image (resolution 72 dpi = unknown, YCbCrPositioning, FlashpixVersion, ComponentsConfiguration).
  const jpegExif=packExportJpegExif(identity(metadata,1),commonExif(metadata,"jpeg",processedOutputView.pixelWidth,processedOutputView.pixelHeight),
    {pixelWidth:processedOutputView.pixelWidth,pixelHeight:processedOutputView.pixelHeight});
  const jpegBytes=encodeExportJpeg({width:processedOutputView.pixelWidth,height:processedOutputView.pixelHeight,samples:rendering.value.integerSamples,
    quantizationStep:v.jpegQuantizationStep,exif:jpegExif,xmp:xmp(metadata,"jpeg",simulationHash,v.colorProfile,frame.modeId,v.sceneProfile,correctedMetadata)});
  active();
  const dngHash=await hash(dngBytes); active();
  const jpegHash=await hash(jpegBytes); active();
  return { schemaVersion:PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION,metadata,simulationHashAlgorithm:"sha-256",simulationHash,rawDataUniqueId,uniqueCameraModel,source,rendering,nativeDefaultCrop,processedOutputView,correction,rawCorrectionIntent,
    highlight,imageDataPairing:"jpeg-generated-from-exact-attached-raw",
    dng:{mediaType:"image/dng",bytes:dngBytes,sha256:dngHash},jpeg:{mediaType:"image/jpeg",bytes:jpegBytes,sha256:jpegHash},
    interoperability:"independent-decode-required-editor-validation-pending" };
}
/**
 * DNG level tags for a 2×2 CFA frame.
 *
 * DNG 1.7 applies BlackLevelRepeatDim and CFAPattern to the image after the ActiveArea crop (stage 2), so
 * phases are measured from the ActiveArea origin. WhiteLevel (one value, because SamplesPerPixel is 1) is
 * the smallest per-phase effective white code, so no channel is reported as unsaturated above its own
 * saturation point.
 *
 * NoiseProfile (tag 51041) is written per CFAPlaneColor plane, only when every phase of a channel has the
 * same gain, read noise and black level. With x = (code − black)/(WhiteLevel − black):
 * var(x) = S·x + O, S = 1/(G·span), O = (σ²/G² + 1/12)/span². The model covers Poisson photo and dark shot
 * noise, Gaussian read noise and uniform ADC quantization. PRNU (photo-response non-uniformity), DSNU
 * (dark-signal non-uniformity) and other fixed-pattern noise are not modelled and not included.
 */
function dngLevels(frame: RawFrameReconstruction["rawFrame"], activeRect: RasterRect): { black: number[]; cfaPattern: number[]; whiteLevel: number; noiseProfile: number[] | null } {
  const layout=frame.colorSamplingProfile.layout;
  if (layout.kind!=="periodic-mosaic") throw new InvalidConfigurationError("Initial DNG profile supports explicitly registered 2x2 RGB Bayer topology only.");
  const black: number[]=[], cfaPattern: number[]=[], whites: number[]=[], perChannel=new Map<string, {gain:number;readNoise:number;black:number}[]>();
  for (let py=0;py<2;py++) for (let px=0;px<2;px++) {
    // Absolute native phase of active-relative phase (px, py).
    const ax=(activeRect.x+px)%2, ay=(activeRect.y+py)%2;
    const found=frame.samples.filter((s) => s.colorSamplingSite.x%2===ax && s.colorSamplingSite.y%2===ay), first=found[0];
    if (!first || found.some((s) => s.blackLevelCode!==first.blackLevelCode)) throw new InvalidConfigurationError("DNG requires a fixed repeating black tile.");
    black.push(first.blackLevelCode); whites.push(first.effectiveSaturationCode);
    cfaPattern.push(["red","green","blue"].indexOf(layout.siteChannelIds[ay*2+ax]!));
    const list=perChannel.get(first.channelId) ?? []; list.push({gain:first.systemConversionGainElectronsPerCode,readNoise:first.readNoiseRmsElectrons,black:first.blackLevelCode});
    perChannel.set(first.channelId,list);
  }
  const whiteLevel=Math.min(...whites);
  if (black.some((b) => b>=whiteLevel)) throw new InvalidConfigurationError("DNG black level must be below the effective WhiteLevel.");
  let noiseProfile: number[] | null=[];
  for (const channel of ["red","green","blue"]) {
    const list=perChannel.get(channel), f=list?.[0];
    if (!list || !f || list.some((e) => e.gain!==f.gain || e.readNoise!==f.readNoise || e.black!==f.black)) { noiseProfile=null; break; }
    const span=whiteLevel-f.black;
    noiseProfile.push(1/(f.gain*span),(f.readNoise*f.readNoise/(f.gain*f.gain)+1/12)/(span*span));
  }
  return {black,cfaPattern,whiteLevel,noiseProfile};
}
