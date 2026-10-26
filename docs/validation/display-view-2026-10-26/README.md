# Display view validation, set F, October 26, 2026 (device-pixel views)

Set F of `node scripts/validate-display-view.mjs --set F` (#454; 12 cases; raw lines in [results.jsonl](results.jsonl)), on
`main` at `65decd1f0db799ddb9d0d6631d90cbc029855979` (2.9.0 plus #434). It is the first validation of the display view at
device-pixel widths on the full-frame and medium-format sensors: 2028 pixels wide on the 24 MP full frame (6 µm, about
2.96 × 2.96 real pixels per display pixel) and 4000 wide on the 100 MP medium format (3.76 µm, about 2.91 × 2.91). Every
view takes the [exact area mean](../../DISPLAY_VIEW.md#exact-area-mean). The earlier sets reach the exact area mean only on
the 12 MP phone at 800 wide (5 × 5 real pixels per display pixel). Blocks are 32 × 32 display pixels (about 95 × 95 real
pixels) at the Siemens star's centre and on a uniform 18 % grey patch at ISO 100 and 6400, f/8, Speed and Quality. Method,
metrics, limits and seven reference seeds as in [the October 19 record](../display-view-2026-10-19/README.md) and
[Display view](../../DISPLAY_VIEW.md#validation). Set F is not part of the default run.

Built `dist`, Node 24.21.0, 4-vCPU Intel Xeon 2.80 GHz, Linux, one process per case, four at a time; the run took about
2 minutes.

**Status: Speed passes every limit; Quality misses two.**

- **Speed:** every mean error, noise ratio (0.97–1.03 drawn, 0.98–1.01 predicted), expected-value RMS (0.44 and 0.71 code
  at the star centre), SSIM and false colour is within its limit.
- **Quality, noise ratio:** the predicted noise is 1.13–1.20 of the reference's on the uniform patches (limit 0.85–1.15;
  with 1024 display pixels per block the reference's own sampling error is about 2 %). Full frame ISO 100 1.13 / 1.14 /
  1.02 (within), ISO 6400 1.14 / 1.16 / 1.02; medium format ISO 100 1.16 / 1.16 / 1.01, ISO 6400 1.20 / 1.17 / 1.04. This is
  the known Quality noise limit at small footprints (#379, [Known limit](../../DISPLAY_VIEW.md#known-limit-quality-noise-at-small-footprints)),
  which the documentation recorded as within 0.89–1.08 on these two sensors because no earlier case put them at a
  footprint this small.
- **Quality, expected value at the star centre:** RMS 5.13 codes, maximum 34.4 (full frame) and 3.60 / 21.7 (medium
  format), against the limit of 2 codes in the busiest pixels. The star's false colour rises from 13.3 to 16.7 codes
  (full frame) and 12.1 to 15.1 (medium format). Over the whole block the mean error stays within 0.27 code and SSIM is
  0.9992–0.9993, so the error is local colour, not a shift of the block.

**What the expected-value miss is** (a follow-up measurement, not part of the script; same commit and host). The display
view's noise-free expected image of the full-frame star-centre block was compared with the mean of the seven reference
blocks, and the reference blocks with their own mean:

| Options | Expected view ÷ mean of 7 references, RMS / max (codes) | One reference ÷ the mean, RMS (codes) |
| --- | --- | --- |
| Speed | 0.17 / 1.1 | 0.41 |
| Quality | 5.08 / 34.4 | 0.67 |
| Quality options one at a time: AHD only | 19.31 / 153 | 3.08 |
| Diffraction only | 0.19 / 1.2 | 0.47 |
| Four-spot filter only | 0.21 / 1.3 | 0.50 |

The references barely move between noise seeds, so the miss is not the references' noise: the view's AHD result differs
from the capture's at the star's centre, where the pattern is finer than the sensor resolves. Diffraction and the four-spot
filter blur that pattern, which is why the Quality options together miss by less than AHD alone. The miss shrinks as the
footprint grows (AHD only, same block centre: 19.3 codes RMS at 2028 wide, 12.6 at 1200, 7.7 at 800), so earlier sets at
384 wide (Quality star, full frame: 1.02 codes RMS) did not see it. Its cause in the display view's AHD model is not yet
established; it is recorded as a new known limit for the owner's decision.

## Every case

| Set | Sensor | Options | Chart | f | ISO | Width | s | Mean error R / G / B (± SE) | Expected RMS / max | Noise: drawn / predicted ÷ ref | SSIM | False colour ref → view | MTF50 ref → view | View s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F | ff | speed | siemens-star | 8 | 100 | 2028 | 3.0 | 0.02 / 0.00 / 0.01 (± 0.02) | 0.44 / 2.5 | — | 0.9999 | 68.72 → 68.75 | — → — | 0.4 |
| F | ff | speed | uniform 0.18 | 8 | 100 | 2028 | 3.0 | 0.02 / -0.01 / 0.01 (± 0.03) | 0.62 / 3.1 | 0.99/0.97/1.02 · 0.98/0.99/1.00 | 0.9986 | 1.60 → 1.57 | — → — | 0.3 |
| F | ff | speed | uniform 0.18 | 8 | 6400 | 2028 | 3.0 | 0.10 / -0.10 / 0.11 (± 0.24) | 5.07 / 28.4 | 0.99/0.97/1.02 · 0.98/0.99/1.00 | 0.9183 | 12.28 → 12.05 | — → — | 0.4 |
| F | ff | quality | siemens-star | 8 | 100 | 2028 | 3.0 | 0.27 / 0.17 / 0.27 (± 0.03) | 5.13 / 34.4 | — | 0.9992 | 13.32 → 16.72 | — → — | 0.7 |
| F | ff | quality | uniform 0.18 | 8 | 100 | 2028 | 3.0 | -0.04 / 0.02 / 0.01 (± 0.03) | 0.58 / 2.8 | 1.14/1.12/1.04 · 1.13/1.14/1.02 | 0.9984 | 1.40 → 1.62 | — → — | 0.6 |
| F | ff | quality | uniform 0.18 | 8 | 6400 | 2028 | 3.0 | -0.35 / 0.20 / 0.12 (± 0.25) | 4.62 / 24.7 | 1.15/1.13/1.05 · 1.14/1.16/1.02 | 0.9073 | 10.41 → 12.43 | — → — | 0.9 |
| F | mf | speed | siemens-star | 8 | 100 | 4000 | 2.9 | 0.04 / -0.03 / 0.00 (± 0.03) | 0.71 / 3.9 | — | 0.9997 | 71.77 → 71.81 | — → — | 0.4 |
| F | mf | speed | uniform 0.18 | 8 | 100 | 4000 | 2.9 | 0.03 / -0.02 / 0.01 (± 0.05) | 0.99 / 4.7 | 1.02/1.03/0.99 · 1.01/1.01/1.00 | 0.9962 | 2.48 → 2.50 | — → — | 0.3 |
| F | mf | speed | uniform 0.18 | 8 | 6400 | 4000 | 2.9 | 0.37 / -0.20 / 0.02 (± 0.38) | 8.21 / 45.7 | 1.01/1.03/0.98 · 1.00/1.00/1.00 | 0.7958 | 19.84 → 19.92 | — → — | 0.3 |
| F | mf | quality | siemens-star | 8 | 100 | 4000 | 2.9 | 0.18 / 0.01 / 0.19 (± 0.05) | 3.60 / 21.7 | — | 0.9993 | 12.06 → 15.09 | — → — | 8.0 |
| F | mf | quality | uniform 0.18 | 8 | 100 | 4000 | 2.9 | 0.06 / -0.03 / -0.01 (± 0.05) | 0.92 / 4.9 | 1.17/1.19/1.00 · 1.16/1.16/1.01 | 0.9955 | 2.13 → 2.58 | — → — | 0.5 |
| F | mf | quality | uniform 0.18 | 8 | 6400 | 4000 | 2.9 | 0.30 / -0.18 / 0.34 (± 0.40) | 7.43 / 43.3 | 1.21/1.20/1.03 · 1.20/1.17/1.04 | 0.7719 | 16.64 → 20.63 | — → — | 0.9 |
