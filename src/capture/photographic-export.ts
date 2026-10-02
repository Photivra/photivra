// SPDX-License-Identifier: Apache-2.0
// This product includes DNG technology under license by Adobe.

import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";

import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseEvidenceList, type EvidenceProvenance } from "../core/evidence-provenance.js";
import { LINEAR_CAPTURE_RGB_PROFILE } from "../color/capture-color.js";
import { invertSensorColorMatrix, prepareSensorColorDevelopment, sensorColorReferenceWhite } from "../color/sensor-color-development.js";
import { calculateSdrRendering, parseSdrRenderingProfile, type SdrRenderingProfile, type SdrRenderingResult } from "../output/sdr-rendering.js";
import { transformOrientedRasterPointToNative, transformOrientedRasterRectToNative, type RasterRect } from "../output/capture-geometry.js";
import { resolveRawFrameReconstruction, parseRawFrameReconstructionInput, type RawFrameReconstructionInput, type RawFrameReconstruction } from "./raw-frame-reconstruction.js";
import { createCaptureExportMetadataPair, type CaptureExportMetadataInput, type CaptureExportMetadataPair } from "./capture-export-metadata.js";
import { encodeExportJpeg } from "./export-jpeg.js";
import { packExportTiff, exportTiffAscii as ascii, exportTiffNumbers as numbers, exportTiffRationals as rationals,
  exportTiffBytes as rawBytes, type ExportTiffTag } from "./export-tiff.js";
import { calculateCaptureCorrectedSdr, parseCaptureCorrectionChoice,
  type CaptureCorrectedSdrInput, type CaptureCorrectedSdrResult } from "../output/capture-corrected-sdr.js";
import { resolveLensCorrectionPlan, type ResolvedLensCorrectionPlan } from "../output/lens-corrections.js";
import { parseSimulatedCapture } from "./simulated-capture.js";
import { approximationResult, type CalculationResult } from "../core/calculation-result.js";

export const PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION = "0.1.0" as const;
type Matrix = readonly (readonly number[])[];
/** Explicit approximation of normalized camera-channel -> scene XYZ/D65, never inferred from RGB/CFA names. */
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
/** Optional explicit exporter boundary; no files, clocks, randomness, network or encoder dependency. */
export interface PhotographicExportInput {
  reconstruction: RawFrameReconstructionInput;
  colorProfile: ExportSensorColorProfile;
  whiteBalance: "not-required" | "apply-resolved-sensor-gains";
  rendering: SdrRenderingProfile;
  metadata: Omit<CaptureExportMetadataInput, "capture">;
  /** Caller-declared public scene/version, explicitly bound to the committed scene state. */
  sceneProfile: { id: string; version: string; sceneStateId: string };
  /** JPEG constant quantization step 1..255, not an emulated manufacturer's 'quality' scale. */
  jpegQuantizationStep: number;
  /** Optional native-optical post-color correction; JPEG only, RAW records informational intent. */
  correction?: CaptureCorrectedSdrInput["correction"];
}
/** Explicit post-ADC RAW development policy shared by preview and file output. */
export type ProcessedSensorRawInput = Pick<PhotographicExportInput,
  "reconstruction" | "colorProfile" | "whiteBalance" | "rendering" | "correction">;
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
}
/** Owned byte arrays are mutable; identities/hashes refer to the exact bytes returned at creation. */
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
  /** Derived JPEG rectangle in the declared oriented output; never replaces the RAW default crop. */
  processedOutputView: { rect: RasterRect; pixelWidth: number; pixelHeight: number };
  correction: CalculationResult<CaptureCorrectedSdrResult> | null;
  rawCorrectionIntent: CalculationResult<ResolvedLensCorrectionPlan> | null;
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
/** Validates independently supplied numeric profile evidence and binds the approximation to the exact CFA profile. */
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
/** Cheap geometry/topology preflight after RAW revalidation, before pixel execution. */
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
 * Revalidates one attached RAW snapshot and explicit processing policy.
 * Crop sampling and reconstruction coverage fail here before
 * per-pixel execution. Successful parsing does not establish kernel edge support,
 * correction support or container encoding readiness; those retain execution
 * checks. Input is copied; no file or display backend runs.
 */
export function parseProcessedSensorRawInput(value: unknown): ProcessedSensorRawInput {
  const r=object(value,["reconstruction","colorProfile","whiteBalance","rendering","correction"]);
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
  return { reconstruction,colorProfile,whiteBalance:r.whiteBalance,rendering,...(correction===undefined ? {} : {correction}) };
}
/** Adds file metadata/encoding validation to the shared processed RAW policy. */
export function parsePhotographicExportInput(value: unknown): PhotographicExportInput {
  const r=object(value,["reconstruction","colorProfile","whiteBalance","rendering","metadata","sceneProfile","jpegQuantizationStep","correction"]);
  const processed=parseProcessedSensorRawInput({reconstruction:r.reconstruction,colorProfile:r.colorProfile,whiteBalance:r.whiteBalance,rendering:r.rendering,
    ...(r.correction===undefined ? {} : {correction:r.correction})});
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

async function hash(value: Uint8Array | string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new InvalidConfigurationError("Paired export requires Web Crypto SHA-256 in this execution context.");
  const data=typeof value==="string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const result=await globalThis.crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(result),(v) => v.toString(16).padStart(2,"0")).join("");
}
function xmp(pair: CaptureExportMetadataPair, role: "raw" | "jpeg", simulationHash: string, color: ExportSensorColorProfile, mode: string, scene: PhotographicExportInput["sceneProfile"], corrected?: { choice: NonNullable<PhotographicExportInput["correction"]>; rect: RasterRect; clippingEvents: number }): Uint8Array {
  const s=pair.shared, artifact=pair[role];
  const values: Record<string,string>={ "xmp:CreatorTool":s.creatorTool,"xmpMM:DocumentID":"uuid:"+artifact.documentId,"xmpMM:InstanceID":"uuid:"+artifact.instanceId,
    "Iptc4xmpExt:DigitalImageGUID":"urn:uuid:"+artifact.documentId,"Iptc4xmpExt:DigitalSourceType":s.digitalSourceTypeUri,
    "photivra:SchemaVersion":"1.0","photivra:SimulatedCapture":"True","photivra:CaptureID":s.captureId,"photivra:OutputRole":role,
    "photivra:EngineVersion":s.engineApiVersion,"photivra:CaptureContractVersion":s.captureContractVersion,"photivra:RawPipelineVersion":"0.1.0",
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
  if (role==="jpeg") values["photivra:ProcessedPipelineVersion"]=PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION;
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
/** Reconstruct exact attached RAW, develop color/WB once, correct, orient/crop and encode SDR; no file/display IO. */
export function calculateProcessedSensorRaw(input: ProcessedSensorRawInput): CalculationResult<ProcessedSensorRawResult> {
  const v=structuredClone(parseProcessedSensorRawInput(input));
  const source=resolveRawFrameReconstruction(v.reconstruction), frame=source.value.rawFrame, capture=frame.capture,
    g=capture.resolvedGeometry,
    active=g.activeCapture.nativeRect,crop=g.output.cropRect, raster=g.output.raster, region=source.value.region;
  const {nativeDefaultCrop}=validateProcessedSensorRawEnvelope(v.reconstruction,v.correction!==undefined);
  const colorMatrix=invertSensorColorMatrix(v.colorProfile.normalizedCameraChannelsToXyz),
    cameraWhite=sensorColorReferenceWhite(colorMatrix), intent=capture.whiteBalanceIntent,
    gains=intent ? [intent.channelGains.red,intent.channelGains.green,intent.channelGains.blue] : [1,1,1];
  const development=prepareSensorColorDevelopment(v.colorProfile.normalizedCameraChannelsToXyz,gains), white=development.referenceWhiteXyz;
  if (cameraWhite.some((x) => x<=0 || !Number.isFinite(x))) throw new InvalidConfigurationError("DNG reference white must map to positive camera-neutral coordinates.");
  const developedRaster=v.correction ? g.orientedCapture.raster : raster,
    developedRect=v.correction ? {x:0,y:0,width:developedRaster.pixelWidth,height:developedRaster.pixelHeight} : crop;
  const rgb: number[]=[];
  for (let y=0;y<developedRaster.pixelHeight;y++) for (let x=0;x<developedRaster.pixelWidth;x++) {
    const p=transformOrientedRasterPointToNative({ point:{x:developedRect.x+x+.5,y:developedRect.y+y+.5},nativeRaster:g.activeCapture.raster,orientation:capture.geometry.orientation });
    const index=((Math.floor(p.y)+active.y-region.y)*region.width+Math.floor(p.x)+active.x-region.x)*3;
    const values=source.value.linearPlane.samples.slice(index,index+3);
    rgb.push(...development.develop(values));
  }
  // Only exact attached RAW reconstruction supplies this private processing plane. Original float planes are discarded.
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
    displayAdaptationApplied:false,whiteBalance:intent ? "applied-here" : "not-required",source,rendering,nativeDefaultCrop,processedOutputView,correction,rawCorrectionIntent }, "processed-sensor-raw-sdr", "0.1.0", [
    "Exact attached RAW feeds explicit approximate sensor color development; WB is applied once before correction and SDR.",
    "Output is encoded sRGB/D65 SDR; platform viewing adaptation and HDR encoding are not applied.",
    "Bounded reference reconstruction, correction support and 1:1 output crop remain explicit; physical capture is unchanged."
  ]);
}

export async function createPhotographicExportPair(input: PhotographicExportInput): Promise<PhotographicExportPair> {
  // Copy validated inputs into private owned values before the first async boundary to prevent hash/encoding races.
  const v=JSON.parse(JSON.stringify(parsePhotographicExportInput(input))) as PhotographicExportInput;
  const processed=calculateProcessedSensorRaw({reconstruction:v.reconstruction,colorProfile:v.colorProfile,whiteBalance:v.whiteBalance,rendering:v.rendering,
    ...(v.correction===undefined ? {} : {correction:v.correction})}).value;
  const {source,rendering,nativeDefaultCrop,processedOutputView,correction,rawCorrectionIntent}=processed;
  const frame=source.value.rawFrame,capture=frame.capture,g=capture.resolvedGeometry,active=g.activeCapture.nativeRect,region=source.value.region;
  const metadata=createCaptureExportMetadataPair({...v.metadata,capture});
  const {local}=validateProcessedSensorRawEnvelope(v.reconstruction,v.correction!==undefined);
  const colorMatrix=invertSensorColorMatrix(v.colorProfile.normalizedCameraChannelsToXyz),cameraWhite=sensorColorReferenceWhite(colorMatrix),intent=capture.whiteBalanceIntent;
  const gains=intent ? [intent.channelGains.red,intent.channelGains.green,intent.channelGains.blue] : [1,1,1];
  const neutral=cameraWhite.map((x,i)=>x/gains[i]!),scale=neutral[1]!;
  const correctedMetadata=v.correction && correction ? {choice:v.correction,rect:processedOutputView.rect,
    clippingEvents:correction.value.correction.value.illuminationClippingEventCount} : undefined;
  const layout=frame.colorSamplingProfile.layout;
  if (layout.kind!=="periodic-mosaic") throw new InvalidConfigurationError("Initial DNG profile supports explicitly registered 2x2 RGB Bayer topology only.");
  const whiteLevel=frame.samples[0]!.digitalSaturationCode, black:number[]=[];
  for (let py=0;py<2;py++) for (let px=0;px<2;px++) {
    const found=frame.samples.filter((s) => s.colorSamplingSite.x%2===px && s.colorSamplingSite.y%2===py), first=found[0];
    if (!first || found.some((s) => s.blackLevelCode!==first.blackLevelCode || s.digitalSaturationCode!==whiteLevel)) throw new InvalidConfigurationError("DNG requires a fixed repeating black tile and one common WhiteLevel.");
    black.push(first.blackLevelCode);
  }
  const simulationHash=await hash(canonical({ schema:PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION,rawFrame:frame,phaseProfiles:source.value.phaseProfiles,region,
    colorProfile:v.colorProfile,sceneProfile:v.sceneProfile,whiteBalance:v.whiteBalance,rendering:v.rendering,jpegQuantizationStep:v.jpegQuantizationStep,
    ...(v.correction ? {correction:v.correction} : {}) }));
  const rawHash=await hash(canonical({ schema:"photivra-raw-data-id-0.1",width:frame.nativePixelWidth,height:frame.nativePixelHeight,
    cfa:layout,containerBitDepth:16,codes:frame.samples.map((s) => s.rawCode) })),rawDataUniqueId=rawHash.slice(0,32);
  const colorHash=await hash(canonical(v.colorProfile)),uniqueCameraModel="Photivra Virtual Camera "+v.colorProfile.profileId+" "+v.colorProfile.profileVersion+" "+colorHash;
  const orientation={landscape:1,"portrait-clockwise":6,"landscape-inverted":3,"portrait-counter-clockwise":8}[capture.geometry.orientation];
  const pixels=new Uint8Array(frame.samples.length*2), view=new DataView(pixels.buffer); frame.samples.forEach((s,i) => view.setUint16(i*2,s.rawCode,true));
  const strip={...numbers(273,4,[0]),pointer:"pixels" as const};
  const dngBytes=packExportTiff([...identity(metadata,orientation),numbers(254,4,[0]),numbers(256,4,[frame.nativePixelWidth]),numbers(257,4,[frame.nativePixelHeight]),
    numbers(258,3,[16]),numbers(259,3,[1]),numbers(262,3,[32803]),strip,numbers(277,3,[1]),numbers(278,4,[frame.nativePixelHeight]),numbers(279,4,[pixels.length]),
    numbers(284,3,[1]),numbers(339,3,[1]),numbers(33421,3,[2,2]),numbers(33422,1,layout.siteChannelIds.map((ch) => ["red","green","blue"].indexOf(ch))),
    numbers(50706,1,[1,1,0,0]),numbers(50707,1,[1,1,0,0]),ascii(50708,uniqueCameraModel),numbers(50710,1,[0,1,2]),numbers(50711,3,[1]),numbers(50713,3,[2,2]),
    rationals(50714,false,black),numbers(50717,4,[whiteLevel]),numbers(50719,4,[local.x,local.y]),numbers(50720,4,[local.width,local.height]),
    rationals(50721,true,colorMatrix.flat()),rationals(50728,false,neutral.map((n) => n/scale)),numbers(50778,3,[21]),
    rawBytes(50781,1,Uint8Array.from(rawDataUniqueId.match(/../g)!.map((s) => parseInt(s,16)))),numbers(50829,4,[active.y,active.x,active.y+active.height,active.x+active.width]),
    rawBytes(700,1,xmp(metadata,"raw",simulationHash,v.colorProfile,frame.modeId,v.sceneProfile,correctedMetadata))],commonExif(metadata,"raw",local.width,local.height),pixels);
  const jpegExif=packExportTiff(identity(metadata,1),commonExif(metadata,"jpeg",processedOutputView.pixelWidth,processedOutputView.pixelHeight));
  const jpegBytes=encodeExportJpeg({width:processedOutputView.pixelWidth,height:processedOutputView.pixelHeight,samples:rendering.value.integerSamples,
    quantizationStep:v.jpegQuantizationStep,exif:jpegExif,xmp:xmp(metadata,"jpeg",simulationHash,v.colorProfile,frame.modeId,v.sceneProfile,correctedMetadata)});
  return { schemaVersion:PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION,metadata,simulationHashAlgorithm:"sha-256",simulationHash,rawDataUniqueId,uniqueCameraModel,source,rendering,nativeDefaultCrop,processedOutputView,correction,rawCorrectionIntent,
    imageDataPairing:"jpeg-generated-from-exact-attached-raw",
    dng:{mediaType:"image/dng",bytes:dngBytes,sha256:await hash(dngBytes)},jpeg:{mediaType:"image/jpeg",bytes:jpegBytes,sha256:await hash(jpegBytes)},
    interoperability:"independent-decode-required-editor-validation-pending" };
}
