// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Parses an exact color-sampling topology declaration without binding it to NativeImageRaster,
 * physical photodiodes, spectral response, or a manufacturer-specific family enum. Periodic mosaics
 * use an abstract native sensor color-sampling-site lattice with zero-based integer indices, top-left
 * origin, +X right and +Y down. The repeat phase is anchored to the sensor lattice, so later active
 * crops or orientation transforms must preserve the original native site indices. Layered layouts are
 * structural-only in this first contract because real layered sensors may use unequal spatial sampling
 * density/registration across layers. No per-site layered resolver is exposed until that relationship
 * is modeled explicitly.
 * Resolves the semantic measurement-channel assignment at one abstract native sensor
 * color-sampling-site index for monochrome or periodic-mosaic layouts. This API intentionally has no
 * NativeImageRaster input. A later explicit binding must establish how a selected capture mode's
 * effective raster maps to this color-sampling-site lattice before RAW/CFA sampling can be simulated.
 * Layered layouts fail closed because their per-layer spatial relationship is not resolved by the
 * first structural contract.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";

type UnknownRecord = Record<string, unknown>;

export type NativeColorSamplingSiteCoordinateSystem =
  "native-sensor-color-sampling-site-index";

export type SensorColorSamplingProfileCoordinateSystem =
  | NativeColorSamplingSiteCoordinateSystem
  | "native-sensor-layered-spatial-relationship-not-resolved";

export interface NativeColorSamplingSiteIndex {
  /**
   * Zero-based integer site index from the native sensor's left edge.
   *
   * This is an abstract color-sampling-site lattice index. It is not a
   * NativeImageRaster coordinate and does not assert one site = one physical
   * photodiode.
   */
  x: number;
  /**
   * Zero-based integer site index from the native sensor's top edge.
   *
   * +Y points downward in native sensor-facing coordinates.
   */
  y: number;
}

export interface MonochromeColorSamplingLayout {
  kind: "monochrome";
  /**
   * Semantic measurement-channel identifier only. It is not a spectral
   * response curve, wavelength, colorimetric primary, or calibration.
   */
  channelId: string;
}

export interface PeriodicMosaicColorSamplingLayout {
  kind: "periodic-mosaic";
  /**
   * Number of color-sampling sites in one horizontal repeat period.
   */
  repeatWidthSites: number;
  /**
   * Number of color-sampling sites in one vertical repeat period.
   */
  repeatHeightSites: number;
  /**
   * Row-major semantic channel IDs for one repeating tile.
   *
   * Length must equal repeatWidthSites × repeatHeightSites.
   */
  siteChannelIds: readonly string[];
  /**
   * The repeat tile is anchored at native sensor sampling-site index (0, 0).
   *
   * Active crops and physical orientation must not silently reset this phase.
   */
  anchor: "native-sensor-top-left-site";
}

export interface LayeredColorSamplingLayout {
  kind: "layered";
  /**
   * Semantic layer/channel identifiers only. They do not define spectral
   * response, depth ordering, spatial sampling density, or registration.
   */
  layerChannelIds: readonly string[];
  /**
   * The first layered representation is deliberately structural only because
   * real layered sensors may use unequal per-layer spatial sampling.
   */
  spatialSamplingRelationship: "not-resolved";
}

export type SensorColorSamplingLayout =
  | MonochromeColorSamplingLayout
  | PeriodicMosaicColorSamplingLayout
  | LayeredColorSamplingLayout;

export interface SensorColorSamplingProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  /**
   * Evidence supporting this exact topology declaration.
   *
   * Descriptive architecture-family metadata remains a separate contract.
   */
  evidence: readonly EvidenceProvenance[];
  coordinateSystem: SensorColorSamplingProfileCoordinateSystem;
  layout: SensorColorSamplingLayout;
}

export interface ResolveColorSamplingSiteInput {
  profile: SensorColorSamplingProfile;
  site: NativeColorSamplingSiteIndex;
}

export interface ResolvedColorSamplingSite {
  profileId: string;
  coordinateSystem: NativeColorSamplingSiteCoordinateSystem;
  site: NativeColorSamplingSiteIndex;
  mapping:
    | {
        kind: "monochrome";
        channelId: string;
      }
    | {
        kind: "periodic-mosaic";
        channelId: string;
        repeatCoordinate: {
          x: number;
          y: number;
        };
        repeatWidthSites: number;
        repeatHeightSites: number;
      };
  /**
   * Explicit scientific boundaries for downstream consumers.
   */
  spectralResponseEstablished: false;
  nativeImageRasterBindingEstablished: false;
  physicalPhotodiodeBindingEstablished: false;
}

function requireRecord(
  value: unknown,
  path: string
): UnknownRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be an object."
    );
  }
  return value as UnknownRecord;
}

function requireNonEmptyString(
  value: unknown,
  path: string
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new InvalidConfigurationError(
      path + " must be a non-empty string."
    );
  }
  return value;
}

function requirePositiveSafeInteger(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new InvalidConfigurationError(
      path + " must be a positive safe integer."
    );
  }
  return value;
}

function parseChannelIds(
  value: unknown,
  path: string,
  options: {
    allowDuplicates: boolean;
    exactLength?: number;
  }
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidConfigurationError(
      path + " must be a non-empty array."
    );
  }

  if (
    options.exactLength !== undefined &&
    value.length !== options.exactLength
  ) {
    throw new InvalidConfigurationError(
      path +
        " length must equal the declared repeating-tile site count."
    );
  }

  const ids = value.map((entry, index) =>
    requireNonEmptyString(
      entry,
      path + "[" + index + "]"
    )
  );

  if (
    !options.allowDuplicates &&
    new Set(ids).size !== ids.length
  ) {
    throw new InvalidConfigurationError(
      path + " must not contain duplicate channel IDs."
    );
  }

  return ids;
}

function parseLayout(
  value: unknown,
  path: string
): SensorColorSamplingLayout {
  const record = requireRecord(value, path);

  if (record.kind === "monochrome") {
    if (
      record.repeatWidthSites !== undefined ||
      record.repeatHeightSites !== undefined ||
      record.siteChannelIds !== undefined ||
      record.anchor !== undefined ||
      record.layerChannelIds !== undefined ||
      record.spatialSamplingRelationship !== undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " monochrome layout must omit mosaic/layered fields."
      );
    }

    return {
      kind: "monochrome",
      channelId: requireNonEmptyString(
        record.channelId,
        path + ".channelId"
      )
    };
  }

  if (record.kind === "periodic-mosaic") {
    if (
      record.channelId !== undefined ||
      record.layerChannelIds !== undefined ||
      record.spatialSamplingRelationship !== undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " periodic-mosaic layout must omit monochrome/layered fields."
      );
    }

    const repeatWidthSites =
      requirePositiveSafeInteger(
        record.repeatWidthSites,
        path + ".repeatWidthSites"
      );
    const repeatHeightSites =
      requirePositiveSafeInteger(
        record.repeatHeightSites,
        path + ".repeatHeightSites"
      );
    const repeatSiteCount =
      repeatWidthSites * repeatHeightSites;

    if (!Number.isSafeInteger(repeatSiteCount)) {
      throw new InvalidConfigurationError(
        path +
          " repeating-tile site count must be a safe integer."
      );
    }

    if (record.anchor !== "native-sensor-top-left-site") {
      throw new InvalidConfigurationError(
        path +
          '.anchor must be "native-sensor-top-left-site".'
      );
    }

    return {
      kind: "periodic-mosaic",
      repeatWidthSites,
      repeatHeightSites,
      siteChannelIds: parseChannelIds(
        record.siteChannelIds,
        path + ".siteChannelIds",
        {
          allowDuplicates: true,
          exactLength: repeatSiteCount
        }
      ),
      anchor: "native-sensor-top-left-site"
    };
  }

  if (record.kind === "layered") {
    if (
      record.channelId !== undefined ||
      record.repeatWidthSites !== undefined ||
      record.repeatHeightSites !== undefined ||
      record.siteChannelIds !== undefined ||
      record.anchor !== undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " layered layout must omit monochrome/mosaic fields."
      );
    }

    if (
      record.spatialSamplingRelationship !==
      "not-resolved"
    ) {
      throw new InvalidConfigurationError(
        path +
          '.spatialSamplingRelationship must be "not-resolved" for the first layered contract.'
      );
    }

    return {
      kind: "layered",
      layerChannelIds: parseChannelIds(
        record.layerChannelIds,
        path + ".layerChannelIds",
        {
          allowDuplicates: false
        }
      ),
      spatialSamplingRelationship: "not-resolved"
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

/**
 * Parses an exact color-sampling topology declaration without binding it to
 * NativeImageRaster, physical photodiodes, spectral response, or a
 * manufacturer-specific family enum.
 *
 * Periodic mosaics use an abstract native sensor color-sampling-site lattice
 * with zero-based integer indices, top-left origin, +X right and +Y down.
 * The repeat phase is anchored to the sensor lattice, so later active crops or
 * orientation transforms must preserve the original native site indices.
 *
 * Layered layouts are structural-only in this first contract because real
 * layered sensors may use unequal spatial sampling density/registration across
 * layers. No per-site layered resolver is exposed until that relationship is
 * modeled explicitly.
 */
export function parseSensorColorSamplingProfile(
  value: unknown
): SensorColorSamplingProfile {
  const profile = requireRecord(
    value,
    "sensorColorSampling"
  );

  if (profile.schemaVersion !== "0.1.0") {
    throw new InvalidConfigurationError(
      'sensorColorSampling.schemaVersion must be "0.1.0".'
    );
  }

  const layout = parseLayout(
    profile.layout,
    "sensorColorSampling.layout"
  );

  const expectedCoordinateSystem =
    layout.kind === "layered"
      ? "native-sensor-layered-spatial-relationship-not-resolved"
      : "native-sensor-color-sampling-site-index";

  if (
    profile.coordinateSystem !==
    expectedCoordinateSystem
  ) {
    throw new InvalidConfigurationError(
      "sensorColorSampling.coordinateSystem does not match the declared layout kind."
    );
  }

  return {
    schemaVersion: "0.1.0",
    profileId: requireNonEmptyString(
      profile.profileId,
      "sensorColorSampling.profileId"
    ),
    evidence: parseEvidenceList(
      profile.evidence,
      "sensorColorSampling.evidence"
    ),
    coordinateSystem: expectedCoordinateSystem,
    layout
  };
}

function requireNativeSiteIndex(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be a non-negative safe integer native color-sampling-site index."
    );
  }
  return value;
}

/**
 * Resolves the semantic measurement-channel assignment at one abstract native
 * sensor color-sampling-site index for monochrome or periodic-mosaic layouts.
 *
 * This API intentionally has no NativeImageRaster input. A later explicit
 * binding must establish how a selected capture mode's effective raster maps
 * to this color-sampling-site lattice before RAW/CFA sampling can be simulated.
 *
 * Layered layouts fail closed because their per-layer spatial relationship is
 * not resolved by the first structural contract.
 */
export function resolveColorSamplingSite(
  input: ResolveColorSamplingSiteInput
): ResolvedColorSamplingSite {
  const profile =
    parseSensorColorSamplingProfile(input.profile);

  if (
    typeof input.site !== "object" ||
    input.site === null
  ) {
    throw new InvalidScientificInputError(
      "site must be an object."
    );
  }

  const x = requireNativeSiteIndex(
    input.site.x,
    "site.x"
  );
  const y = requireNativeSiteIndex(
    input.site.y,
    "site.y"
  );

  if (profile.layout.kind === "layered") {
    throw new InvalidScientificInputError(
      "Layered color sampling is structural-only in schema 0.1.0; per-site resolution requires an explicit per-layer spatial sampling relationship."
    );
  }

  if (
    profile.coordinateSystem !==
    "native-sensor-color-sampling-site-index"
  ) {
    throw new InvalidScientificInputError(
      "Resolvable color sampling requires the native sensor color-sampling-site coordinate system."
    );
  }

  if (profile.layout.kind === "monochrome") {
    return {
      profileId: profile.profileId,
      coordinateSystem: profile.coordinateSystem,
      site: { x, y },
      mapping: {
        kind: "monochrome",
        channelId: profile.layout.channelId
      },
      spectralResponseEstablished: false,
      nativeImageRasterBindingEstablished: false,
      physicalPhotodiodeBindingEstablished: false
    };
  }

  const repeatX =
    x % profile.layout.repeatWidthSites;
  const repeatY =
    y % profile.layout.repeatHeightSites;
  const index =
    repeatY * profile.layout.repeatWidthSites +
    repeatX;
  const channelId =
    profile.layout.siteChannelIds[index];

  if (channelId === undefined) {
    throw new InvalidScientificInputError(
      "Periodic color-sampling tile resolution failed."
    );
  }

  return {
    profileId: profile.profileId,
    coordinateSystem: profile.coordinateSystem,
    site: { x, y },
    mapping: {
      kind: "periodic-mosaic",
      channelId,
      repeatCoordinate: {
        x: repeatX,
        y: repeatY
      },
      repeatWidthSites:
        profile.layout.repeatWidthSites,
      repeatHeightSites:
        profile.layout.repeatHeightSites
    },
    spectralResponseEstablished: false,
    nativeImageRasterBindingEstablished: false,
    physicalPhotodiodeBindingEstablished: false
  };
}
