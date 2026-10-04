# sensor/environment-photo-signal.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateEnvironmentSensorPhotoSignal

Generate, evaluate and integrate one site's actual local midpoint environment support.

```ts
export function calculateEnvironmentSensorPhotoSignal(input: CalculateEnvironmentSensorPhotoSignalInput): CalculationResult<EnvironmentSensorPhotoSignal>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateEnvironmentSensorPhotoSignalInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateEnvironmentSensorPhotoSignalInput {
  temporalIntegrationId: string;
  sensor: Omit<CalculateSensorEqeTemporalExposureInput, "samples">;
  sceneBindings: CalculateSceneToSensorIrradianceQuadratureInput["sceneBindings"];
  optics: Omit<CalculateSceneRadianceToSensorIrradianceInput,
    "sceneRadianceRequest" | "sceneRadianceResult" | "imagePointMm" | "fieldThroughput">;
  motion: Pick<CalculateSensorEnvironmentRadianceQueryInput,
    "angularVelocityRadPerSec" | "timeReference" | "environmentDirectionConvention">;
  temporalSampleCount: number;
  /** Optional ideal geometric DOF/visibility support; cannot combine with a sampled PSF. */
  pupil?: IdealCircularPupil;
  /** Explicit source-field attenuation, applied once before PSF redistribution. */
  fieldThroughput: { kind: "unity"; evidence: readonly EvidenceProvenance[]; limitation: string } | {
    kind: "radial-illumination-vignetting"; profile: IlluminationVignettingProfile;
    evidence: readonly EvidenceProvenance[]; limitation: string;
  };
  psf: { kind: "not-applied"; evidence: readonly EvidenceProvenance[]; limitation: string } | {
    kind: "sampled-local";
    configuration: Pick<CalculateSensorPsfIrradianceQuadratureInput, "psf" | "psfWavelengthBasis" | "spatialModel">;
  };
  evaluateRadiance: EnvironmentRadianceEvaluator;
  /** Required with pupil; origin-aware scene intersections cannot use direction-only code. */
  evaluateApertureRadiance?: EnvironmentApertureRadianceEvaluator;
}
```

## EnvironmentApertureRadianceEvaluator

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type EnvironmentApertureRadianceEvaluator = (request: Readonly<SceneRadianceEvaluationRequest>, apertureRay: Readonly<SensorApertureRay>) => SceneRadianceEvaluationResult;
```

## EnvironmentRadianceEvaluator

Supplied synchronous code executes locally. Invocation does not prove physical transport.

```ts
export type EnvironmentRadianceEvaluator = (request: Readonly<SceneRadianceEvaluationRequest>) => SceneRadianceEvaluationResult;
```

## EnvironmentSensorPhotoSignal

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface EnvironmentSensorPhotoSignal {
  sourceTargetProjectionCalculated: true;
  providerCallbackExecuted: true;
  providerTransportVerified: false;
  sceneVisibilityCalculated: false;
  productionPlanActivated: false;
  providerEvaluationCount: number;
  sourcePlane: "sensor-package-incident";
  fieldThroughputEvidence: readonly EvidenceProvenance[];
  fieldThroughputLimitation: string;
  psfOmission: { evidence: readonly EvidenceProvenance[]; limitation: string } | null;
  psfRedistributionApplied: boolean;
  pupilIntegrationApplied: boolean;
  pupilIntegrationProfile: IdealCircularPupil | null;
  photo: ReturnType<typeof createSensorEqeTemporalPhotoSignal>;
  instants: readonly {
    temporalSampleIndex: number;
    timeSecondsFromOpeningReference: number;
    psf: ReturnType<typeof calculateSensorPsfIrradianceQuadrature> | null;
    evaluations: readonly {
      query: ReturnType<typeof calculateSensorEnvironmentRadianceQuery>;
      result: SceneRadianceEvaluationResult;
      bindings: ReturnType<typeof validateSceneRadianceEvaluationBindings>;
      optics: ReturnType<typeof calculateSceneRadianceToSensorIrradiance>;
      apertureRay?: SensorApertureRay;
      apertureRequest?: SceneRadianceEvaluationRequest;
    }[];
  }[];
}
```
