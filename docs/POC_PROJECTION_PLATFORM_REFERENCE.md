# POC projection reference on macOS ARM64

The unchanged historical 64-case response-hash corpus has one mismatch on macOS ARM64 with Node 24.19.0 and 26.8.1: `equivalence-38`. This mismatch also occurs when executing the original pre-optimization source at `c1374c31473f893310d1ce4f0d5a737aaba43ab5`. All 64 serialized responses are byte-for-byte identical between that original source, the released 1.0.1 baseline `c89e6e83eb7d4b625e12d496bcd51c58d6c7447b`, and the Print candidate `12f304f087d5cbe41266e2a81be2d6a1d521e692` on the verified host. The difference is therefore present in the archived reference on this platform; it is not introduced by projection reuse or the Print changes. The specific floating-point operation responsible has not been isolated.

The separate `test/fixtures/poc-projection-reuse-darwin-arm64-reference.json` records the original executable's one differing SHA-256. The test selects this exact reference only for darwin/arm64 on the verified Node major lines 24 and 26. All other cases and environments retain the historical hashes. No tolerance, ignored field, regenerated candidate oracle, scientific implementation change, or historical fixture edit is introduced. A new mismatch still fails the test.

To independently reproduce the reference, check out the original commit in an isolated directory, compile its original source with TypeScript 6.0.3, and run its built `simulatePocCamera()` over the unchanged inputs in `test/fixtures/poc-projection-reuse-reference.json` under each recorded Node runtime. Compute SHA-256 over `JSON.stringify(response)` using Node crypto. Compare all outputs with the baseline and candidate on the same host. The original build used the reviewed 1.0.1 development dependency set; no runtime dependencies are added. Only `equivalence-38` differs from the historical corpus:

- Historical hash: `1135d7b57b528cbba1c1af98cd09de94d3b2dc3251ed66dcb62ea7ea8d3d32af`.
- Original-source macOS hash: `02688bd713afea5ae82da9d53675a4e63738aa45bb5f33abca1b2cfeade3d52c`.

This is test equivalence evidence, not renewed optical calibration or physical accuracy evidence. Other macOS architectures and Node lines have not been qualified by this record. Human source/scientific review and DCO certification remain pending for this AI-assisted corrective draft.
