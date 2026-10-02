// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Parses descriptive sensor optical-stack metadata plus an optional explicitly declared effective
 * anti-aliasing spatial response. Unknown facts are omitted instead of inferred. Physical component
 * presence is intentionally separate from effective anti-aliasing response so the schema can represent
 * cancellation/neutralization designs without claiming the physical assembly is absent.
 * Cover/filter-stack and microlens presence do not create optical effects in schema 0.1.0. Thickness,
 * refractive index, spectral transmission, angular acceptance, focus shift and microlens collection
 * behavior require later explicit models/calibration.
 * Resolves only the effective anti-aliasing spatial kernel. This is not a whole optical-stack PSF.
 * Cover/filter transmission, refraction, microlens behavior, field/wavelength/polarization dependence,
 * and total throughput remain excluded. A documented absent effective anti-aliasing response resolves
 * to an identity component at zero offset. An unknown response (field omitted) or a
 * present-but-unresolved response fails closed.
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

export type SensorOpticalStackComponentRole =
  | "cover-glass"
  | "infrared-cut"
  | "ultraviolet-cut"
  | "anti-reflection"
  | "birefringent-low-pass"
  | "wave-plate"
  | "other-optical-filter";

export interface SensorOpticalStackComponent {
  componentId: string;
  /**
   * Roles may be combined because one physical element can provide multiple
   * optical/filter functions.
   */
  roles: readonly SensorOpticalStackComponentRole[];
  evidence: readonly EvidenceProvenance[];
}

export interface SensorMicrolensDeclaration {
  presence: "present" | "absent";
  evidence: readonly EvidenceProvenance[];
  /**
   * Presence alone does not establish an angular, spectral, fill-factor, or
   * collection-efficiency model.
   */
  opticalEffectModel: "unresolved";
}

export interface AntiAliasingPointSplitComponent {
  /**
   * Native sensor physical offset from the nominal landing point.
   * +X right, +Y down. Units: micrometres.
   */
  offsetMicrometers: {
    x: number;
    y: number;
  };
  /**
   * Dimensionless normalized spatial weight. Point-splitting kernels describe
   * spatial redistribution only; total stack throughput is outside this field.
   */
  normalizedWeight: number;
}

export type SensorEffectiveAntiAliasingSpatialResponse =
  | {
      /**
       * Documented absence/cancellation of intentional anti-aliasing spatial
       * splitting. This does not mean the whole sensor stack is optically
       * identity.
       */
      kind: "absent";
      evidence: readonly EvidenceProvenance[];
    }
  | {
      /**
       * An effective anti-aliasing response is known to exist, but its spatial
       * response is not defensibly specified.
       */
      kind: "present-unresolved";
      evidence: readonly EvidenceProvenance[];
    }
  | {
      /**
       * Generic normalized point-splitting approximation in native sensor
       * physical coordinates.
       */
      kind: "normalized-point-splitting-kernel";
      evidence: readonly EvidenceProvenance[];
      coordinateSystem: "native-sensor-physical";
      scope:
        "field-wavelength-polarization-invariant-approximation";
      components: readonly AntiAliasingPointSplitComponent[];
    };

export interface SensorOpticalStackProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  evidence: readonly EvidenceProvenance[];
  /**
   * Ordered from incident-light side toward the sensor.
   *
   * These components are descriptive metadata only. Their presence does not
   * create transmission, focus-shift, aberration, or spectral effects.
   */
  orderedComponents?: readonly SensorOpticalStackComponent[];
  /**
   * Omitted means unknown/unasserted.
   *
   * This is intentionally separate from physical component presence so a
   * stack can contain low-pass-related hardware while its net effective
   * anti-aliasing response is absent/cancelled.
   */
  effectiveAntiAliasingSpatialResponse?: SensorEffectiveAntiAliasingSpatialResponse;
  /**
   * Omitted means unknown/unasserted.
   */
  microlens?: SensorMicrolensDeclaration;
}

export interface ResolvedAntiAliasingSpatialKernel {
  profileId: string;
  effectiveResponse:
    | "absent"
    | "normalized-point-splitting-kernel";
  coordinateSystem: "native-sensor-physical";
  components: readonly AntiAliasingPointSplitComponent[];
  normalizedWeightSum: number;
  throughputIncluded: false;
  spectralTransmissionIncluded: false;
  fieldDependenceIncluded: false;
  wavelengthDependenceIncluded: false;
  polarizationDependenceIncluded: false;
  microlensResponseIncluded: false;
  coverFilterStackEffectsIncluded: false;
  wholeSensorOpticalStackResponse: false;
  provenance: {
    profile: readonly EvidenceProvenance[];
    antiAliasingResponse: readonly EvidenceProvenance[];
  };
}

const COMPONENT_ROLES = new Set<SensorOpticalStackComponentRole>([
  "cover-glass",
  "infrared-cut",
  "ultraviolet-cut",
  "anti-reflection",
  "birefringent-low-pass",
  "wave-plate",
  "other-optical-filter"
]);

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

function parseComponentRoles(
  value: unknown,
  path: string
): readonly SensorOpticalStackComponentRole[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidConfigurationError(
      path + " must be a non-empty array."
    );
  }

  const roles = value.map((entry, index) => {
    if (
      typeof entry !== "string" ||
      !COMPONENT_ROLES.has(
        entry as SensorOpticalStackComponentRole
      )
    ) {
      throw new InvalidConfigurationError(
        path + "[" + index + "] is invalid."
      );
    }
    return entry as SensorOpticalStackComponentRole;
  });

  if (new Set(roles).size !== roles.length) {
    throw new InvalidConfigurationError(
      path + " must not contain duplicate roles."
    );
  }

  return roles;
}

function parseOrderedComponents(
  value: unknown,
  path: string
): readonly SensorOpticalStackComponent[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidConfigurationError(
      path + " must be a non-empty array."
    );
  }

  const components = value.map((entry, index) => {
    const record = requireRecord(
      entry,
      path + "[" + index + "]"
    );

    return {
      componentId: requireNonEmptyString(
        record.componentId,
        path + "[" + index + "].componentId"
      ),
      roles: parseComponentRoles(
        record.roles,
        path + "[" + index + "].roles"
      ),
      evidence: parseEvidenceList(
        record.evidence,
        path + "[" + index + "].evidence"
      )
    };
  });

  const ids = components.map(
    (component) => component.componentId
  );
  if (new Set(ids).size !== ids.length) {
    throw new InvalidConfigurationError(
      path + " must not contain duplicate componentId values."
    );
  }

  return components;
}

function requireFiniteNumber(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be a finite number."
    );
  }
  return value;
}

function parsePointSplitComponents(
  value: unknown,
  path: string
): readonly AntiAliasingPointSplitComponent[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidConfigurationError(
      path + " must be a non-empty array."
    );
  }

  const components = value.map((entry, index) => {
    const record = requireRecord(
      entry,
      path + "[" + index + "]"
    );
    const offset = requireRecord(
      record.offsetMicrometers,
      path + "[" + index + "].offsetMicrometers"
    );
    const normalizedWeight = requireFiniteNumber(
      record.normalizedWeight,
      path + "[" + index + "].normalizedWeight"
    );

    if (normalizedWeight <= 0) {
      throw new InvalidConfigurationError(
        path +
          "[" +
          index +
          "].normalizedWeight must be greater than zero."
      );
    }

    return {
      offsetMicrometers: {
        x: requireFiniteNumber(
          offset.x,
          path +
            "[" +
            index +
            "].offsetMicrometers.x"
        ),
        y: requireFiniteNumber(
          offset.y,
          path +
            "[" +
            index +
            "].offsetMicrometers.y"
        )
      },
      normalizedWeight
    };
  });

  const weightSum = components.reduce(
    (sum, component) =>
      sum + component.normalizedWeight,
    0
  );

  if (
    !Number.isFinite(weightSum) ||
    Math.abs(weightSum - 1) > 1e-12
  ) {
    throw new InvalidConfigurationError(
      path +
        " normalizedWeight values must sum to 1 within 1e-12."
    );
  }

  return components;
}

function parseAntiAliasingResponse(
  value: unknown,
  path: string
): SensorEffectiveAntiAliasingSpatialResponse {
  const record = requireRecord(value, path);

  if (
    record.kind === "absent" ||
    record.kind === "present-unresolved"
  ) {
    if (
      record.coordinateSystem !== undefined ||
      record.scope !== undefined ||
      record.components !== undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " absent/present-unresolved responses must omit kernel fields."
      );
    }
    return {
      kind: record.kind,
      evidence: parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
    };
  }

  if (
    record.kind ===
    "normalized-point-splitting-kernel"
  ) {
    if (
      record.coordinateSystem !==
      "native-sensor-physical"
    ) {
      throw new InvalidConfigurationError(
        path +
          '.coordinateSystem must be "native-sensor-physical".'
      );
    }
    if (
      record.scope !==
      "field-wavelength-polarization-invariant-approximation"
    ) {
      throw new InvalidConfigurationError(
        path + ".scope is invalid."
      );
    }

    return {
      kind:
        "normalized-point-splitting-kernel",
      evidence: parseEvidenceList(
        record.evidence,
        path + ".evidence"
      ),
      coordinateSystem:
        "native-sensor-physical",
      scope:
        "field-wavelength-polarization-invariant-approximation",
      components: parsePointSplitComponents(
        record.components,
        path + ".components"
      )
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

function parseMicrolens(
  value: unknown,
  path: string
): SensorMicrolensDeclaration {
  const record = requireRecord(value, path);

  if (
    record.presence !== "present" &&
    record.presence !== "absent"
  ) {
    throw new InvalidConfigurationError(
      path + ".presence is invalid."
    );
  }

  if (record.opticalEffectModel !== "unresolved") {
    throw new InvalidConfigurationError(
      path +
        '.opticalEffectModel must be "unresolved" in schema 0.1.0.'
    );
  }

  return {
    presence: record.presence,
    evidence: parseEvidenceList(
      record.evidence,
      path + ".evidence"
    ),
    opticalEffectModel: "unresolved"
  };
}

/**
 * Parses descriptive sensor optical-stack metadata plus an optional explicitly
 * declared effective anti-aliasing spatial response.
 *
 * Unknown facts are omitted instead of inferred. Physical component presence
 * is intentionally separate from effective anti-aliasing response so the
 * schema can represent cancellation/neutralization designs without claiming
 * the physical assembly is absent.
 *
 * Cover/filter-stack and microlens presence do not create optical effects in
 * schema 0.1.0. Thickness, refractive index, spectral transmission, angular
 * acceptance, focus shift and microlens collection behavior require later
 * explicit models/calibration.
 */
export function parseSensorOpticalStackProfile(
  value: unknown
): SensorOpticalStackProfile {
  const profile = requireRecord(
    value,
    "sensorOpticalStack"
  );

  if (profile.schemaVersion !== "0.1.0") {
    throw new InvalidConfigurationError(
      'sensorOpticalStack.schemaVersion must be "0.1.0".'
    );
  }

  const orderedComponents =
    profile.orderedComponents === undefined
      ? undefined
      : parseOrderedComponents(
          profile.orderedComponents,
          "sensorOpticalStack.orderedComponents"
        );

  const effectiveAntiAliasingSpatialResponse =
    profile.effectiveAntiAliasingSpatialResponse ===
    undefined
      ? undefined
      : parseAntiAliasingResponse(
          profile.effectiveAntiAliasingSpatialResponse,
          "sensorOpticalStack.effectiveAntiAliasingSpatialResponse"
        );

  const microlens =
    profile.microlens === undefined
      ? undefined
      : parseMicrolens(
          profile.microlens,
          "sensorOpticalStack.microlens"
        );

  if (
    orderedComponents === undefined &&
    effectiveAntiAliasingSpatialResponse ===
      undefined &&
    microlens === undefined
  ) {
    throw new InvalidConfigurationError(
      "sensorOpticalStack must assert at least one optical-stack fact."
    );
  }

  return {
    schemaVersion: "0.1.0",
    profileId: requireNonEmptyString(
      profile.profileId,
      "sensorOpticalStack.profileId"
    ),
    evidence: parseEvidenceList(
      profile.evidence,
      "sensorOpticalStack.evidence"
    ),
    ...(orderedComponents === undefined
      ? {}
      : { orderedComponents }),
    ...(effectiveAntiAliasingSpatialResponse ===
    undefined
      ? {}
      : {
          effectiveAntiAliasingSpatialResponse
        }),
    ...(microlens === undefined
      ? {}
      : { microlens })
  };
}

/**
 * Resolves only the effective anti-aliasing spatial kernel.
 *
 * This is not a whole optical-stack PSF. Cover/filter transmission, refraction,
 * microlens behavior, field/wavelength/polarization dependence, and total
 * throughput remain excluded.
 *
 * A documented absent effective anti-aliasing response resolves to an identity
 * component at zero offset. An unknown response (field omitted) or a
 * present-but-unresolved response fails closed.
 */
export function resolveAntiAliasingSpatialKernel(
  profileInput: SensorOpticalStackProfile
): ResolvedAntiAliasingSpatialKernel {
  const profile =
    parseSensorOpticalStackProfile(
      profileInput
    );
  const response =
    profile.effectiveAntiAliasingSpatialResponse;

  if (response === undefined) {
    throw new InvalidScientificInputError(
      "Effective anti-aliasing spatial response is unknown/unasserted for this optical-stack profile."
    );
  }

  if (response.kind === "present-unresolved") {
    throw new InvalidScientificInputError(
      "Effective anti-aliasing spatial response is present but unresolved; a spatial kernel cannot be produced."
    );
  }

  if (response.kind === "absent") {
    return {
      profileId: profile.profileId,
      effectiveResponse: "absent",
      coordinateSystem:
        "native-sensor-physical",
      components: [
        {
          offsetMicrometers: {
            x: 0,
            y: 0
          },
          normalizedWeight: 1
        }
      ],
      normalizedWeightSum: 1,
      throughputIncluded: false,
      spectralTransmissionIncluded: false,
      fieldDependenceIncluded: false,
      wavelengthDependenceIncluded: false,
      polarizationDependenceIncluded: false,
      microlensResponseIncluded: false,
      coverFilterStackEffectsIncluded: false,
      wholeSensorOpticalStackResponse: false,
      provenance: {
        profile: profile.evidence,
        antiAliasingResponse:
          response.evidence
      }
    };
  }

  const normalizedWeightSum =
    response.components.reduce(
      (sum, component) =>
        sum + component.normalizedWeight,
      0
    );

  return {
    profileId: profile.profileId,
    effectiveResponse:
      "normalized-point-splitting-kernel",
    coordinateSystem:
      "native-sensor-physical",
    components: response.components.map(
      (component) => ({
        offsetMicrometers: {
          ...component.offsetMicrometers
        },
        normalizedWeight:
          component.normalizedWeight
      })
    ),
    normalizedWeightSum,
    throughputIncluded: false,
    spectralTransmissionIncluded: false,
    fieldDependenceIncluded: false,
    wavelengthDependenceIncluded: false,
    polarizationDependenceIncluded: false,
    microlensResponseIncluded: false,
    coverFilterStackEffectsIncluded: false,
    wholeSensorOpticalStackResponse: false,
    provenance: {
      profile: profile.evidence,
      antiAliasingResponse:
        response.evidence
    }
  };
}
