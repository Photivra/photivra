# Producer-derived Simulated Sensor RAW DNG / JPEG pairs

Owned analytic environment → executed optics/EQE/local exposure → dark/charge/
seeded shot and read noise → capacity/ADC → exact native CFA → shared #112
processing and paired files. These are synthetic bounded reference captures,
not physical photographs or measured camera calibration.

Native data are 72×48 (3,456 sites); landscape JPEG is 72×48 and portrait JPEG
48×72. All four orientations and manual WB are provided. The controlled cases
retain the same native RAW codes/noise and RAW-data identity. Capture and artifact
IDs identify separate declared events/resources, without conflating pair identity.

`manifest.json` records hashes, producer origin/model and bounded measurements.
Each case's JSON contains expected native codes and processed RGB. The independent
report records actual LibRaw/TIFF/JPEG/two-XML-reader checks. Adobe and browser
are pending; no template boolean is an acceptance result.

See [full acceptance record](../../../docs/EXPORT_ACCEPTANCE.md) for commands,
limits, provenance, closure map and the short external application checklist.
Fill `external-review.template.json` with actual application/version/hash results
before claiming external acceptance. Independently inspect source and assumptions
before DCO certification. No Adobe SDK or external engine dependency is added.
