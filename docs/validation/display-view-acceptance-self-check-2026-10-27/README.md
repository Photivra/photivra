# Preview acceptance self-check, October 27, 2026 (cpu-reference against cpu-reference)

`node scripts/accept-display-view-gpu.mjs --workers 1 --timing` (#480; 20 cases; raw lines in [results.jsonl](results.jsonl)), on commit
`5c6ea9f` plus the working tree of the pull request that added the harness (#480). The self-check: the candidate is the CPU display view itself (`scripts/lib/display-view-cpu-producer.mjs`), so every difference must be exactly zero and every pixel identical.
Each case renders the whole view with both producers in the app's request shape (24 MP 6 µm, 2 × 2 box, caller material scene with the stand-in label, f/8, ISO 100) and compares
the noise-free expected images per pixel: ΔE2000 (Sharma, Wu and Dalal 2005) between the sRGB display colours, and the expected-value difference of each component in units of the
reference's noise σ. Method and thresholds: [Display view](../../DISPLAY_VIEW.md#preview-acceptance) and [WebGPU](../../WEBGPU.md#preview-acceptance).

Node v24.21.0, 4-vCPU Intel(R) Xeon(R) Processor, linux, one process per case, 1 at a time, load average 4.2 at the start; the run took about 22.0 minutes.

**Status: every case passes every threshold** (thresholds: at least 99.00 % within ΔE2000 1, none above 2.3, no pixel beyond 1 σ).
Every expected value, noise σ and drawn sample is identical between the two renders of every case (exact equality, as the self-check requires).

**Visual review.** The "no structured difference at 1:1" check is the owner's review of the difference images (|Δ| in 8-bit codes × 16, black is no difference; each PNG carries "Difference image, not a capture" in its text metadata):

- `00-slanted-edge-speed-2028x1352-difference.png`: slanted-edge, speed, 2028 × 1352 (all black: identical expected images)
- `01-slanted-edge-quality-2028x1352-difference.png`: slanted-edge, quality, 2028 × 1352 (all black: identical expected images)
- `02-slanted-edge-speed-2800x1867-difference.png`: slanted-edge, speed, 2800 × 1867 (all black: identical expected images)
- `03-slanted-edge-quality-2800x1867-difference.png`: slanted-edge, quality, 2800 × 1867 (all black: identical expected images)
- `04-siemens-star-speed-2028x1352-difference.png`: siemens-star, speed, 2028 × 1352 (all black: identical expected images)
- `05-siemens-star-quality-2028x1352-difference.png`: siemens-star, quality, 2028 × 1352 (all black: identical expected images)
- `06-siemens-star-speed-2800x1867-difference.png`: siemens-star, speed, 2800 × 1867 (all black: identical expected images)
- `07-siemens-star-quality-2800x1867-difference.png`: siemens-star, quality, 2800 × 1867 (all black: identical expected images)
- `08-bar-groups-speed-2028x1352-difference.png`: bar-groups, speed, 2028 × 1352 (all black: identical expected images)
- `09-bar-groups-quality-2028x1352-difference.png`: bar-groups, quality, 2028 × 1352 (all black: identical expected images)
- `10-bar-groups-speed-2800x1867-difference.png`: bar-groups, speed, 2800 × 1867 (all black: identical expected images)
- `11-bar-groups-quality-2800x1867-difference.png`: bar-groups, quality, 2800 × 1867 (all black: identical expected images)
- `12-dead-leaves-speed-2028x1352-difference.png`: dead-leaves, speed, 2028 × 1352 (all black: identical expected images)
- `13-dead-leaves-quality-2028x1352-difference.png`: dead-leaves, quality, 2028 × 1352 (all black: identical expected images)
- `14-dead-leaves-speed-2800x1867-difference.png`: dead-leaves, speed, 2800 × 1867 (all black: identical expected images)
- `15-dead-leaves-quality-2800x1867-difference.png`: dead-leaves, quality, 2800 × 1867 (all black: identical expected images)
- `16-step-wedge-speed-2028x1352-difference.png`: step-wedge, speed, 2028 × 1352 (all black: identical expected images)
- `17-step-wedge-quality-2028x1352-difference.png`: step-wedge, quality, 2028 × 1352 (all black: identical expected images)
- `18-step-wedge-speed-2800x1867-difference.png`: step-wedge, speed, 2800 × 1867 (all black: identical expected images)
- `19-step-wedge-quality-2800x1867-difference.png`: step-wedge, quality, 2800 × 1867 (all black: identical expected images)

The images were written to the run's `--out` directory, not into this folder (`--record-images` copies them; an all-black PNG of a whole view is several megabytes).

## Every case

| Chart | Options | View | Within ΔE 1 | Max ΔE2000 | Mean ΔE2000 | Max \|Δ\| / σ | Max codes | Identical pixels | Samples identical | σ identical | Reference s | Candidate s | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| slanted-edge | speed | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 16.7 | 17.5 | pass |
| slanted-edge | quality | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 31.6 | 34.6 | pass |
| slanted-edge | speed | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 19.5 | 21.1 | pass |
| slanted-edge | quality | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 34.2 | 35.0 | pass |
| siemens-star | speed | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 17.9 | 18.6 | pass |
| siemens-star | quality | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 35.0 | 38.8 | pass |
| siemens-star | speed | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 21.8 | 22.0 | pass |
| siemens-star | quality | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 39.7 | 40.3 | pass |
| bar-groups | speed | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 20.1 | 20.1 | pass |
| bar-groups | quality | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 34.1 | 39.9 | pass |
| bar-groups | speed | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 22.7 | 23.7 | pass |
| bar-groups | quality | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 44.7 | 43.4 | pass |
| dead-leaves | speed | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 18.6 | 19.6 | pass |
| dead-leaves | quality | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 41.2 | 48.0 | pass |
| dead-leaves | speed | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 22.4 | 23.8 | pass |
| dead-leaves | quality | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 46.2 | 48.8 | pass |
| step-wedge | speed | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 19.1 | 20.5 | pass |
| step-wedge | quality | 2028 × 1352 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 35.8 | 35.4 | pass |
| step-wedge | speed | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 20.6 | 21.8 | pass |
| step-wedge | quality | 2800 × 1867 | 100.00 % | 0.0000 | 0.0000 | 0.000 | 0.00 | 100.00 % | yes | yes | 39.7 | 42.9 | pass |

## Timing

Reference parts as `scripts/benchmark-display-view.mjs --app` times them (prepare once, sampled 96 × 96 parts, centre first; the whole view's CPU time is extrapolated from the sampled parts, not measured). The CPU pool's wall time to fully sharp with 4 and 12 workers is measured in the app, not here.

| Chart | Options | View | Prepare | Part median | Part max | Reference whole view, CPU extrapolated | Reference whole view, one process | Candidate whole view |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| slanted-edge | speed | 2028 × 1352 | 8 ms | 64 ms | 136 ms | 20.4 s from 30 of 294 parts | 16.7 s | 17.5 s |
| slanted-edge | quality | 2028 × 1352 | 10 ms | 103 ms | 189 ms | 32.8 s from 30 of 294 parts | 31.6 s | 34.6 s |
| slanted-edge | speed | 2800 × 1867 | 8 ms | 37 ms | 95 ms | 23.7 s from 30 of 551 parts | 19.5 s | 21.1 s |
| slanted-edge | quality | 2800 × 1867 | 20 ms | 64 ms | 161 ms | 39.6 s from 30 of 551 parts | 34.2 s | 35.0 s |
| siemens-star | speed | 2028 × 1352 | 29 ms | 71 ms | 272 ms | 25.3 s from 30 of 294 parts | 17.9 s | 18.6 s |
| siemens-star | quality | 2028 × 1352 | 14 ms | 123 ms | 408 ms | 40.2 s from 30 of 294 parts | 35.0 s | 38.8 s |
| siemens-star | speed | 2800 × 1867 | 8 ms | 44 ms | 126 ms | 27.7 s from 30 of 551 parts | 21.8 s | 22.0 s |
| siemens-star | quality | 2800 × 1867 | 33 ms | 93 ms | 301 ms | 59.1 s from 30 of 551 parts | 39.7 s | 40.3 s |
| bar-groups | speed | 2028 × 1352 | 9 ms | 73 ms | 119 ms | 23.7 s from 30 of 294 parts | 20.1 s | 20.1 s |
| bar-groups | quality | 2028 × 1352 | 10 ms | 147 ms | 446 ms | 45.2 s from 30 of 294 parts | 34.1 s | 39.9 s |
| bar-groups | speed | 2800 × 1867 | 8 ms | 47 ms | 168 ms | 34.0 s from 30 of 551 parts | 22.7 s | 23.7 s |
| bar-groups | quality | 2800 × 1867 | 35 ms | 81 ms | 196 ms | 49.8 s from 30 of 551 parts | 44.7 s | 43.4 s |
| dead-leaves | speed | 2028 × 1352 | 8 ms | 68 ms | 170 ms | 22.4 s from 30 of 294 parts | 18.6 s | 19.6 s |
| dead-leaves | quality | 2028 × 1352 | 40 ms | 163 ms | 837 ms | 58.0 s from 30 of 294 parts | 41.2 s | 48.0 s |
| dead-leaves | speed | 2800 × 1867 | 11 ms | 44 ms | 105 ms | 28.1 s from 30 of 551 parts | 22.4 s | 23.8 s |
| dead-leaves | quality | 2800 × 1867 | 42 ms | 107 ms | 382 ms | 73.4 s from 30 of 551 parts | 46.2 s | 48.8 s |
| step-wedge | speed | 2028 × 1352 | 35 ms | 90 ms | 374 ms | 35.3 s from 30 of 294 parts | 19.1 s | 20.5 s |
| step-wedge | quality | 2028 × 1352 | 14 ms | 115 ms | 306 ms | 38.3 s from 30 of 294 parts | 35.8 s | 35.4 s |
| step-wedge | speed | 2800 × 1867 | 14 ms | 42 ms | 150 ms | 29.6 s from 30 of 551 parts | 20.6 s | 21.8 s |
| step-wedge | quality | 2800 × 1867 | 36 ms | 70 ms | 317 ms | 50.6 s from 30 of 551 parts | 39.7 s | 42.9 s |
