// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-internal #249 engine-owned source-radiance contract.
 *
 * The #224 qualification source is self-contained: geometry selects the visible
 * opaque primitive and that primitive owns explicit outgoing spectral-radiance
 * values at the committed wavelength nodes. No arbitrary source callback is part
 * of this optimized reference path.
 */
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { freezeOwnedData } from "../core/owned-data.js";
import {
  requireAllowlistedRecord,
  requirePublicOpaqueId
} from "../core/record-validation.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  parseSceneRadianceEvaluationResult,
  type SceneRadianceEvaluationRequest,
  type SceneRadianceEvaluationResult
} from "../schema/scene-radiance.js";
import type {
  BrowserNativeReferenceHitResult,
  PreparedBrowserNativeReferenceGeometry
} from "./browser-native-reference-geometry.js";

export const BROWSER_NATIVE_REFERENCE_SOURCE_VERSION = "0.1.0" as const;

export interface BrowserNativeReferenceSpectralRadianceSample {
  wavelengthNanometers: number;
  spectralRadianceWattsPerSquareMeterSteradianNanometer: number;
}

export interface BrowserNativeReferencePrimitiveRadiance {
  primitiveId: string;
  evidence: readonly EvidenceProvenance[];
  limitation: string;
  spectrum: readonly BrowserNativeReferenceSpectralRadianceSample[];
}

export interface PrepareBrowserNativeReferenceSourceInput {
  version: typeof BROWSER_NATIVE_REFERENCE_SOURCE_VERSION;
  sourceStateId: string;
  providerSceneId: string;
  sourceRevision: string;
  wavelengthBasis: "air" | "vacuum";
  primitives: readonly BrowserNativeReferencePrimitiveRadiance[];
}

export interface PreparedBrowserNativeReferenceSource {
  version: typeof BROWSER_NATIVE_REFERENCE_SOURCE_VERSION;
  sourceStateId: string;
  providerSceneId: string;
  sourceRevision: string;
  wavelengthBasis: "air" | "vacuum";
  missBehavior: "unsupported-no-background-radiance-contract";
  primitives: readonly BrowserNativeReferencePrimitiveRadiance[];
  identityJson: string;
}

function canonical(value: unknown): string {
  return stringifyCanonicalJson(value, {
    undefinedObjectProperties: "omit",
    nonFiniteNumberMessage:
      "Browser-native reference source identity requires finite numbers.",
    unsupportedValueMessage:
      "Browser-native reference source identity requires plain serializable data."
  });
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidScientificInputError(label + " must be a non-empty string.");
  }
  return value.trim();
}

export function prepareBrowserNativeReferenceSource(
  geometry: PreparedBrowserNativeReferenceGeometry,
  input: PrepareBrowserNativeReferenceSourceInput
): PreparedBrowserNativeReferenceSource {
  requireAllowlistedRecord(
    input,
    [
      "version",
      "sourceStateId",
      "providerSceneId",
      "sourceRevision",
      "wavelengthBasis",
      "primitives"
    ],
    "Invalid browser-native reference source fields."
  );
  if (
    input.version !== BROWSER_NATIVE_REFERENCE_SOURCE_VERSION ||
    (input.wavelengthBasis !== "air" && input.wavelengthBasis !== "vacuum") ||
    !Array.isArray(input.primitives) ||
    input.primitives.length !== geometry.primitives.length
  ) {
    throw new InvalidScientificInputError(
      "Browser-native reference source requires version 0.1.0, an explicit wavelength basis, and one radiance declaration per geometry primitive."
    );
  }

  const sourceStateId = requirePublicOpaqueId(
    input.sourceStateId,
    "Browser-native reference source requires a public source-state ID."
  );
  const providerSceneId = requirePublicOpaqueId(
    input.providerSceneId,
    "Browser-native reference source requires a public provider-scene ID."
  );
  const sourceRevision = nonEmpty(
    input.sourceRevision,
    "Browser-native reference source revision"
  );
  if (
    sourceStateId !== geometry.sourceStateId ||
    providerSceneId !== geometry.providerSceneId ||
    sourceRevision !== geometry.sourceRevision
  ) {
    throw new InvalidScientificInputError(
      "Browser-native reference source radiance and geometry must identify the same exact source revision."
    );
  }

  const geometryIds = geometry.primitives
    .map((primitive) => primitive.primitiveId)
    .sort();
  const seen = new Set<string>();
  const primitives = input.primitives.map((value) => {
    requireAllowlistedRecord(
      value,
      ["primitiveId", "evidence", "limitation", "spectrum"],
      "Invalid browser-native primitive radiance fields."
    );
    const primitiveId = requirePublicOpaqueId(
      value.primitiveId,
      "Browser-native primitive radiance requires a public primitive ID."
    );
    if (seen.has(primitiveId)) {
      throw new InvalidScientificInputError(
        "Browser-native primitive radiance IDs must be unique."
      );
    }
    seen.add(primitiveId);
    const evidence = parseEvidenceList(
      value.evidence,
      "browserNativeReferencePrimitiveRadiance.evidence"
    );
    const limitation = nonEmpty(
      value.limitation,
      "Browser-native primitive radiance limitation"
    );
    if (!Array.isArray(value.spectrum) || value.spectrum.length < 1) {
      throw new InvalidScientificInputError(
        "Browser-native primitive radiance requires at least one explicit wavelength sample."
      );
    }
    let previous = Number.NEGATIVE_INFINITY;
    const spectrum = value.spectrum.map((sample) => {
      requireAllowlistedRecord(
        sample,
        [
          "wavelengthNanometers",
          "spectralRadianceWattsPerSquareMeterSteradianNanometer"
        ],
        "Invalid browser-native primitive spectrum sample."
      );
      if (
        !Number.isFinite(sample.wavelengthNanometers) ||
        sample.wavelengthNanometers <= previous ||
        !Number.isFinite(
          sample.spectralRadianceWattsPerSquareMeterSteradianNanometer
        ) ||
        sample.spectralRadianceWattsPerSquareMeterSteradianNanometer < 0
      ) {
        throw new InvalidScientificInputError(
          "Browser-native primitive spectrum must be finite, nonnegative, and strictly wavelength ordered."
        );
      }
      previous = sample.wavelengthNanometers;
      return {
        wavelengthNanometers: sample.wavelengthNanometers,
        spectralRadianceWattsPerSquareMeterSteradianNanometer:
          sample.spectralRadianceWattsPerSquareMeterSteradianNanometer
      };
    });
    return {
      primitiveId,
      evidence,
      limitation,
      spectrum
    };
  });
  primitives.sort((first, second) =>
    first.primitiveId < second.primitiveId
      ? -1
      : first.primitiveId > second.primitiveId
        ? 1
        : 0
  );
  if (
    primitives.length !== geometryIds.length ||
    primitives.some(
      (primitive, index) => primitive.primitiveId !== geometryIds[index]
    )
  ) {
    throw new InvalidScientificInputError(
      "Browser-native reference source must declare radiance for exactly the prepared geometry primitive set."
    );
  }

  const prepared = {
    version: BROWSER_NATIVE_REFERENCE_SOURCE_VERSION,
    sourceStateId,
    providerSceneId,
    sourceRevision,
    wavelengthBasis: input.wavelengthBasis,
    missBehavior: "unsupported-no-background-radiance-contract" as const,
    primitives
  };
  return freezeOwnedData({
    ...prepared,
    identityJson: canonical(prepared)
  });
}

/**
 * Resolve visible-primitive radiance at an exact committed wavelength node.
 *
 * No interpolation is performed in this first source contract. If a future
 * source representation requires interpolation, its mathematical semantics and
 * error contract must be governed explicitly rather than inferred here.
 */
export function evaluateBrowserNativeReferenceSource(
  source: PreparedBrowserNativeReferenceSource,
  request: Readonly<SceneRadianceEvaluationRequest>,
  visibility: Readonly<BrowserNativeReferenceHitResult>
): SceneRadianceEvaluationResult {
  if (visibility.kind === "unsupported") {
    throw new InvalidScientificInputError(
      "Browser-native reference source cannot evaluate unsupported geometry."
    );
  }
  if (visibility.kind === "miss") {
    throw new InvalidScientificInputError(
      "Browser-native reference source miss is unsupported because no background-radiance contract is declared."
    );
  }
  if (
    request.sceneId !== source.providerSceneId ||
    request.wavelengthBasis !== source.wavelengthBasis
  ) {
    throw new InvalidScientificInputError(
      "Browser-native reference source request does not match the prepared scene/wavelength basis."
    );
  }

  const primitive = source.primitives.find(
    (candidate) => candidate.primitiveId === visibility.primitiveId
  );
  if (primitive === undefined) {
    throw new InvalidScientificInputError(
      "Browser-native reference source visible primitive has no prepared radiance."
    );
  }
  const sample = primitive.spectrum.find(
    (candidate) =>
      candidate.wavelengthNanometers === request.wavelengthNanometers
  );
  if (sample === undefined) {
    throw new InvalidScientificInputError(
      "Browser-native reference source requires an exact radiance sample at every committed wavelength node."
    );
  }

  return parseSceneRadianceEvaluationResult({
    schemaVersion: "0.1.0",
    sampleId: request.sampleId,
    providerProfileId: request.providerProfileId,
    sceneId: request.sceneId,
    wavelengthNanometers: request.wavelengthNanometers,
    wavelengthBasis: request.wavelengthBasis,
    quantity: "outgoing-spectral-radiance",
    unit: "W/m^2/sr/nm",
    spectralRadianceWattsPerSquareMeterSteradianNanometer:
      sample.spectralRadianceWattsPerSquareMeterSteradianNanometer,
    scientificStatus: "approximation",
    uncertainty: {
      kind: "not-quantified",
      limitation: primitive.limitation
    },
    evidence: primitive.evidence,
    limitations: [primitive.limitation]
  });
}
