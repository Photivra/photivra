# Architecture

Photivra separates a reusable scientific core from optional composition and transport layers.

## Current root package

The browser-safe root package currently owns:

- unit-explicit camera, sensor, lens, exposure, focus, scene, and motion contracts;
- additive sensor-foundation contracts that separate physical imaging area from native effective image raster;
- deterministic camera/optics/exposure/crop calculations;
- the explicitly approximate stabilization-equivalent camera-shake model;
- sensor signal/noise primitives;
- schema/runtime validation;
- provenance and optional uncertainty/quality contracts;
- the composed `simulatePocCamera()` proof-of-concept calculation.

The root package has no runtime npm dependencies. CI walks the root import graph and fails if Node-only modules or the `src/api` transport layer become reachable from it.

Comparison, optimization, real-camera calibration databases, renderer effects, and full optical simulation are **not** current root-package capabilities.

The sensor foundation intentionally keeps physical image-formation geometry separate from digital sampling. `SensorImagingArea` represents the photosensitive imaging dimensions used for image formation; `NativeImageRaster` represents effective image samples and does not imply one image sample equals one physical photodiode. Derived sampling pitch is geometric spacing only, not fill factor or photon-collection area. Capture orientation, active-area transforms, output crop, sensor architecture, and calibrated radiometry remain separate follow-on layers.

## Repository-local Node POC transport

The repository contains a minimal Node-only HTTP transport under `src/api` for contributor integration testing.

It wraps `simulatePocCamera()` with an unauthenticated localhost server. The HTTP layer adds structural request validation and transport behavior; it does not define new camera-science equations.

This transport is intentionally **not** part of the public `@photivra/engine` package surface and is excluded from the npm tarball. The POC server is not the intended production architecture.

## Optional/future capability modules

Future capabilities should compose onto the scientific core rather than silently widening unrelated models. Examples include:

- more complete camera-rotation and translation models;
- panning and rolling/global shutter;
- flash;
- spectral/color modeling;
- macro/high-magnification calibration;
- non-circular diffraction PSFs;
- computational capture;
- lens calibration profiles;
- advanced/calibrated sensor profiles;
- comparison and optimization systems;
- renderer-specific effects.

Capabilities should remain discoverable and explicitly versioned rather than being assumed present for every scene or runtime.

## Repository scope

This repository contains the Apache-2.0 scientific/business-logic package together with its tests, documentation, schemas, validation, and contributor tooling.

The published npm package intentionally exposes only the browser-safe scientific root surface; repository-local development tooling such as the Node POC transport remains outside the published package.
