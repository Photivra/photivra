// SPDX-License-Identifier: Apache-2.0
import { createSimulatedCapture, simulateSensorRawFrame, type SensorRawProducerInput, type PrintRegionRaster } from "../../src/index.js";
import { loadSensorRawProducerInput } from "./sensor-raw-producer-fixture.js";
import { statisticsFrame } from "./print-region-statistics-fixture.js";

export interface PrintReadoutExperiment {
  capacityElectrons: number;
  preAdcElectronEquivalent: number;
  conversionGainElectronsPerCode: number;
  injectedElectronEquivalents: readonly number[];
  photoMean?: number;
  darkMean?: number;
  readNoiseRmsElectrons?: number;
  blackLevelCode?: number;
}
/** Public native RAW execution with declared electronic test inputs. The ideal
 * neutral scalar interpretation is conditional, not physical radiometry or an
 * assertion that an electronic charge injection is a photographed subject. */
export function printReadoutProducer(experiment: PrintReadoutExperiment, repeat = 0): SensorRawProducerInput {
  const input = loadSensorRawProducerInput(), previous = input.frame.capture;
  const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...capture } = previous;
  void _s; void _e; void _g; void _f;
  input.frame.capture = createSimulatedCapture({ ...capture, captureId: `00000000-0000-4000-8000-${String(196000 + repeat).padStart(12, "0")}`,
    noise: { ...capture.noise, seedUint32: (Math.imul(repeat + 1, 2654435761) + 196) >>> 0 } }).value;
  input.sites.forEach((site, i) => {
    const photo = site.charge.photoSignal, dark = site.charge.darkCharge;
    if (photo.kind !== "eqe-expected-counts") throw Error("owned fixture");
    const duration = photo.localExposureDurationSeconds, mean = experiment.photoMean ?? 0, darkMean = experiment.darkMean ?? 0;
    photo.expectedGeneratedElectronCount = mean; photo.expectedGeneratedElectronRatePerSecond = mean / duration;
    photo.expectedIncidentPhotonCount = mean * 2; photo.incidentPhotonRatePerSecond = mean * 2 / duration;
    dark.expectedDarkElectronCount = darkMean; dark.darkCurrentElectronsPerSecond = darkMean / duration;
    const injection = "owned-neutral-equivalent-injection";
    site.charge.additionalChargeComponents = [{ componentId: injection, kind: "charge-injection", colorSamplingProfileId: photo.colorSamplingProfileId,
      channelId: photo.channelId, site: photo.site, bindingId: photo.bindingId, timeReference: photo.timeReference,
      startOffsetSecondsFromOpeningReference: photo.startOffsetSecondsFromOpeningReference, endOffsetSecondsFromOpeningReference: photo.endOffsetSecondsFromOpeningReference,
      accountingMeaning: "incremental-stored-electrons-beyond-photo-and-modeled-dark-current", expectedElectronCount: experiment.injectedElectronEquivalents[i]!,
      scientificStatus: "approximation", uncertainty: { kind: "not-quantified", limitation: "Declared owned electronic reference, not radiometry." },
      evidence: site.capacityProfile.evidence }];
    site.charge.completenessProfile.includedAdditionalComponentIds = [injection];
    site.samplingProfile.additionalComponentPolicies = [{ componentId: injection, model: "deterministic-expected-electron-equivalent" }];
    site.capacityProfile.capacityElectrons = experiment.capacityElectrons;
    const regime = site.readoutProfile.regimes[0]!;
    regime.systemConversionGainElectronsPerCode.value = experiment.conversionGainElectronsPerCode;
    regime.preAdcSaturationElectronEquivalent.value = experiment.preAdcElectronEquivalent;
    regime.readNoiseComponents[0]!.rmsElectrons.value = experiment.readNoiseRmsElectrons ?? 0;
    regime.adc.bitDepth = 12; regime.adc.blackLevelCode = experiment.blackLevelCode ?? 512; regime.adc.digitalSaturationCode = 4095;
  });
  return input;
}
export function printReadoutFrame(samples: readonly number[], raw: ReturnType<typeof simulateSensorRawFrame>["value"], representation: string,
  realization: string | null): PrintRegionRaster {
  const frame = statisticsFrame(samples, raw.frame.capture.captureId, representation, realization);
  if (frame.print.source.kind !== "native-retained") throw Error("owned fixture");
  frame.print.source.geometry = raw.frame.capture.geometry;
  frame.print.printedImage = { width: 2, height: 2, unit: "inches" };
  frame.source.raster = { pixelWidth: 2, pixelHeight: 2 }; frame.region.rect = { x: 0, y: 0, width: 2, height: 2 };
  frame.region.role = "field-diagnostic"; frame.source.processing = { id: representation, version: "0.1.0" };
  return frame;
}
