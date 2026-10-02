# Native sensor RAW frame attachment

See [Reference RAW frame compatibility](RAW_FRAME_ENVELOPE.md) for stage-specific
limits, full-native counting and parser preflight behavior.

`createSensorRawFrame()` commits #14 `SensorRawCaptureSample` values alongside one immutable #15 capture. `parseSensorRawFrameInput()` validates the untrusted attachment boundary. Schema `0.1.0`, proposed root API `0.98.0`; package/POC/capture/production contracts stay unchanged. Reconcile independent additive root API bumps in actual merge order.

The first slice accepts single-frame native-effective capture modes with an explicitly evidenced one-site-per-native-sample binding and periodic mosaic topology. The entire native frame must be provided in native row-major order, one sample per site. Absolute CFA phase, site/channel assignment, capture-mode/profile/readout identity and every per-site seed are preserved. RAW samples are never rotated, cropped, demosaiced, balanced or tone-mapped. Active capture/output geometry stays in the attached metadata; it never resets CFA phase.

The 16-bit container holds integer RAW codes without re-quantization. Black and digital-saturation codes remain per-site metadata, with a positive span. Codes below black are retained; their black-subtracted normalized values can be negative. A code cannot exceed its declared digital maximum. Stored codes and normalization must agree exactly with the existing #14 formula. Physical and digital saturation flags remain distinct. This does not infer ADC bit depth, physical full well, a spectral camera color matrix, or calibrated sensor behavior.

The frame's `producerBinding` is explicitly `caller-declared-capture-attachment`. Validation proves structural consistency, not that a caller actually ran the engine or that supplied linear planes were reconstructed from these RAW samples. Consumers must carry an actual same-capture producer/reconstruction handoff before claiming a paired JPEG. The attachment does not render pixels, manufacture RAW by masking RGB, or certify DNG/editor interoperability.

Structural attachment is limited to 65,536 native samples; reference producer/reconstruction/export execution is limited to 4,096. External storage, streaming/high-resolution writers, grouped/remosaiced/layered/multi-frame modes and alternate RAW packing require separately explicit contracts. A new frame copies and freezes all records; caller-owned arrays remain mutable. This conservative reference implementation performs per-site authoritative binding validation and is not a 24/45/60 MP memory/performance claim.

This is a prerequisite slice of #16. Remaining work includes canonical export metadata/pairing, DNG tag/color/WB mapping and specification/patent-notice review, an optional writer, same-RAW reconstruction through #112, standalone JPEG encoding, independent decode/Adobe acceptance and measured memory limits. TIFF/Linear DNG cannot replace the required genuine RAW DNG + standalone JPEG pair. #165 C2PA stays post-V1.

Implementation and structural fixtures are independently authored. Fixtures contain declared synthetic code records and are not a sensor calibration or evidence of RAW-to-RGB numerical agreement. No new dependency, third-party material, IO, service or cost is introduced.
