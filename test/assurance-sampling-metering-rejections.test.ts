// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { composeScientificAssurance, InvalidConfigurationError, InvalidScientificInputError, parseGenericBodyMeteringCapabilityProfile,
  parseSensorColorSamplingProfile, resolveColorSamplingSite } from "../src/index.js";
import { expectRejection, type Json, type RejectionCase } from "./helpers/rejection-table.js";

const evidence = [{ sourceOrigin: "photivra", sourceReference: "test:assurance-sampling-metering", reuseStatus: "photivra-owned" }];

describe("scientific assurance composition rejection branches", () => {
  const component = (overrides: Json = {}): Json => ({ componentId: "a", role: "test", required: true,
    sourceIdentity: { kind: "model", id: "model-a", version: "1.0.0" }, basisKind: "evidence-backed-fact", scientificStatus: "calibrated",
    evidenceRequirement: "required", evidence, uncertainty: { kind: "relative", fraction: 0.02, basis: "test" }, limitations: [], ...overrides });
  const base = (): Json => ({ components: [component()] });
  const compose = (input: Json): unknown => composeScientificAssurance(input);

  it("reports not-propagated for quantified calculation-quality and not-applicable when no required input has an uncertainty", () => {
    const quality = { uncertainty: [{ quantityPath: "value", source: "calibration", kind: "relative", fraction: 0.01 }] };
    const quantified = composeScientificAssurance({ components: [component({ uncertainty: { kind: "calculation-quality", quality } })] });
    expect(quantified.uncertainty).toMatchObject({ kind: "not-propagated", componentIds: ["a"] });
    const notApplicable = composeScientificAssurance({ components: [component({ basisKind: "not-applicable", evidenceRequirement: "not-required",
      evidence: [], uncertainty: { kind: "not-applicable", reason: "exact definition" } })] });
    expect(notApplicable.uncertainty).toMatchObject({ kind: "not-applicable", componentIds: ["a"] });
  });

  const cases: RejectionCase[] = [
    ["an empty component list", (i): void => { i.components = []; }, "components must be a non-empty array."],
    ["a blank role", (i): void => { i.components[0].role = " "; }, "components[0].role must be a non-empty string."],
    ["a negative absolute uncertainty", (i): void => { i.components[0].uncertainty = { kind: "absolute", plusMinus: -1, unit: "mm" }; },
      ".plusMinus must be finite and greater than or equal to zero."],
    ["an unknown source kind", (i): void => { i.components[0].sourceIdentity.kind = "rumour"; }, ".sourceIdentity.kind is invalid."],
    ["calculation quality without uncertainty", (i): void => { i.components[0].uncertainty = { kind: "calculation-quality", quality: { notes: ["n"] } }; },
      ".quality must include quantified uncertainty components"],
    ["an unknown uncertainty kind", (i): void => { i.components[0].uncertainty = { kind: "interval" }; }, ".uncertainty.kind is invalid."],
    ["non-array limitations", (i): void => { i.components[0].limitations = "none"; }, ".limitations must be an array."],
    ["duplicate limitations", (i): void => { i.components[0].limitations = ["x", "x"]; }, ".limitations must not contain duplicates."],
    ["a non-boolean required flag", (i): void => { i.components[0].required = "yes"; }, ".required must be boolean."],
    ["an unknown basis kind", (i): void => { i.components[0].basisKind = "intuition"; }, ".basisKind is invalid."],
    ["an unknown scientific status", (i): void => { i.components[0].scientificStatus = "verified"; }, ".scientificStatus is invalid."],
    ["an evidence-backed fact without required evidence", (i): void => { i.components[0].evidenceRequirement = "not-required"; },
      'requires evidenceRequirement "required".'],
    ["an unknown evidence requirement", (i): void => { i.components[0].basisKind = "photivra-model-assumption"; i.components[0].evidenceRequirement = "maybe"; },
      ".evidenceRequirement is invalid."],
    ["non-array evidence", (i): void => { i.components[0].evidence = {}; }, ".evidence must be an array."]
  ];
  it.each(cases)("rejects %s", (_name, mutate, message) => {
    expectRejection(base, compose, InvalidScientificInputError, mutate, message);
  });
});

describe("sensor color-sampling profile rejection branches", () => {
  const base = (): Json => ({ schemaVersion: "0.1.0", profileId: "cfa", evidence, coordinateSystem: "native-sensor-color-sampling-site-index",
    layout: { kind: "periodic-mosaic", repeatWidthSites: 2, repeatHeightSites: 2, siteChannelIds: ["red", "green", "green", "blue"],
      anchor: "native-sensor-top-left-site" } });
  const layered = (i: Json): void => {
    i.coordinateSystem = "native-sensor-layered-spatial-relationship-not-resolved";
    i.layout = { kind: "layered", layerChannelIds: ["blue", "green", "red"], spatialSamplingRelationship: "not-resolved" };
  };
  it("accepts mosaic, monochrome and layered layouts and resolves a mosaic tile phase (x mod 2, y mod 2)", () => {
    expect(resolveColorSamplingSite({ profile: base(), site: { x: 5, y: 2 } }).mapping).toMatchObject({ channelId: "green" });
    const mono = base(); mono.layout = { kind: "monochrome", channelId: "luma" };
    expect(resolveColorSamplingSite({ profile: mono, site: { x: 7, y: 9 } }).mapping).toEqual({ kind: "monochrome", channelId: "luma" });
    const layer = base(); layered(layer);
    expect(parseSensorColorSamplingProfile(layer).layout.kind).toBe("layered");
  });
  const cases: RejectionCase[] = [
    ["a non-object layout", (i): void => { i.layout = "bayer"; }, "sensorColorSampling.layout must be an object."],
    ["a blank profile id", (i): void => { i.profileId = ""; }, "sensorColorSampling.profileId must be a non-empty string."],
    ["a fractional repeat width", (i): void => { i.layout.repeatWidthSites = 1.5; }, ".repeatWidthSites must be a positive safe integer."],
    ["empty site channels", (i): void => { i.layout.siteChannelIds = []; }, ".siteChannelIds must be a non-empty array."],
    ["a monochrome layout with mosaic fields", (i): void => { i.layout.kind = "monochrome"; i.layout.channelId = "luma"; },
      " monochrome layout must omit mosaic/layered fields."],
    ["a mosaic layout with a monochrome channel", (i): void => { i.layout.channelId = "luma"; }, " periodic-mosaic layout must omit monochrome/layered fields."],
    ["a repeating tile whose site count overflows", (i): void => { i.layout.repeatWidthSites = 2 ** 30; i.layout.repeatHeightSites = 2 ** 30; },
      " repeating-tile site count must be a safe integer."],
    ["a layered layout with mosaic fields", (i): void => { layered(i); i.layout.anchor = "native-sensor-top-left-site"; },
      " layered layout must omit monochrome/mosaic fields."],
    ["an unknown layout kind", (i): void => { i.layout = { kind: "foveon-like" }; }, "sensorColorSampling.layout.kind is invalid."],
    ["a layered layout on the site-index coordinate system", (i): void => { layered(i); i.coordinateSystem = "native-sensor-color-sampling-site-index"; },
      "coordinateSystem does not match the declared layout kind."]
  ];
  it.each(cases)("rejects %s", (_name, mutate, message) => {
    expectRejection(base, parseSensorColorSamplingProfile, InvalidConfigurationError, mutate, message);
  });
  it("rejects a non-object site and per-site resolution of a layered layout", () => {
    expectRejection(() => ({ profile: base(), site: null }), (i: Json) => resolveColorSamplingSite(i), InvalidScientificInputError, () => undefined,
      "site must be an object.");
    const layer = base(); layered(layer);
    expect(() => resolveColorSamplingSite({ profile: layer, site: { x: 0, y: 0 } })).toThrow(InvalidScientificInputError);
  });
});

describe("generic body metering capability rejection branches", () => {
  const base = (): Json => ({ schemaVersion: "0.1.0", profileId: "body-metering", profileVersion: "1.0.0", scientificStatus: "approximation", evidence,
    supportedMeteringProfiles: [{ meteringProfileId: "multi", policyKind: "multi-zone-uniform", evidence },
      { meteringProfileId: "spot", policyKind: "spot", evidence }],
    spotFocusPointLinkage: { availability: "supported", evidence } });
  const cases: RejectionCase[] = [
    ["a non-object metering entry", (i): void => { i.supportedMeteringProfiles[0] = 1; }, "supportedMeteringProfiles[0] must be an object."],
    ["a blank metering profile id", (i): void => { i.supportedMeteringProfiles[0].meteringProfileId = ""; }, ".meteringProfileId must be a non-empty string."],
    ["an unknown spot-link availability", (i): void => { i.spotFocusPointLinkage.availability = "sometimes"; }, ".spotFocusPointLinkage.availability is invalid."],
    ["an unknown policy kind", (i): void => { i.supportedMeteringProfiles[1].policyKind = "matrix-ai"; }, ".policyKind is invalid."],
    ["an unsupported schema version", (i): void => { i.schemaVersion = "0.2.0"; }, "genericBodyMeteringCapabilityProfile.schemaVersion must be"],
    ["a calibrated status", (i): void => { i.scientificStatus = "calibrated"; }, 'scientificStatus must be "approximation".'],
    ["no supported metering profiles", (i): void => { i.supportedMeteringProfiles = []; }, ".supportedMeteringProfiles must be a non-empty array."],
    ["duplicate metering profile ids", (i): void => { i.supportedMeteringProfiles[1].meteringProfileId = "multi"; },
      "must not contain duplicate meteringProfileId values."]
  ];
  it("accepts the valid base profile", () => {
    expect(parseGenericBodyMeteringCapabilityProfile(base()).supportedMeteringProfiles).toHaveLength(2);
  });
  it.each(cases)("rejects %s", (_name, mutate, message) => {
    expectRejection(base, parseGenericBodyMeteringCapabilityProfile, InvalidConfigurationError, mutate, message);
  });
});
