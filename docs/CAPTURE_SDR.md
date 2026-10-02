# Capture-to-SDR adapter

Current integration: [processed camera output](PROCESSED_OUTPUT.md) documents
the shared preview/export path and explicit plan 0.6.0 post-RAW activation.
The historical slice descriptions below retain their original scope.


`calculateCaptureSdr()` connects the authoritative SimulatedCapture/color contracts to the existing SDR renderer. Adapter schema is `0.1.0`; root API advances to `0.98.0`. Existing capture/color/SDR schemas, production plan, package and POC versions are unchanged.

Choose `already-transformed` for an exact `linear-srgb-d65` profile/version, RGB channel order and D65 encoding white. Choose `transform` to delegate an explicitly selected XYZ/ideal-camera color and WB operation to `calculateCaptureColorTransform()`. Derived plane/state IDs must be new. No WB estimator runs. Intent-only WB is rejected; an already applied state cannot be transformed again. Applied RGB gains and adopted-white adaptation remain distinct; XYZ diagonal adaptation remains approximation, including the adapter envelope.

Input is an inline co-sited three-channel plane, no more than 262,144 samples. Its raster binding, dimensions, reference-white value and source identity are retained. External/oversized planes fail rather than being loaded, truncated, downsampled or silently tiled. The adapter performs no geometric resampling.

The result exposes optional color and SDR calculation envelopes separately, with original capture saturation, dynamic-range history and noise realization identity. Rendering exposure/tone/gamut clipping cannot rewrite physical capture. SDR's own saturation field remains `not-consumed`; original capture saturation is a separate upstream diagnostic, never an output-code inference. Display adaptation remains external/unknown.

This is #112B, not full #112 closure. It does not execute correction profiles or activate production stages. Corrected planes may retain their explicit upstream transform history; no correction is inferred. #117/#118 execution and #111 ordered production integration require their own bound handoff. #16 remains the serializer owner and must not invent color/WB/quantization semantics.

Implementation and fixtures are independently authored orchestration of existing Photivra APIs; no new equation, calibration, third-party material, dependency, service, IO or cost is introduced.
