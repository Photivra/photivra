// SPDX-License-Identifier: Apache-2.0

/**
 * The defocus cases of the display view (#492, step 2b), shared by `test/display-view-defocus.test.ts` and
 * `scripts/accept-display-view-defocus.mjs`.
 *
 * Each case renders one block of a display view twice:
 *
 * - the candidate: a sharp material scene with `lens.defocus` out of focus, which the display view blurs in its
 *   expected-signal tables;
 * - the reference: the same request without `lens.defocus` (same focus distance, so the same framing, exposure and
 *   diffraction kernels) of a reflectance-function scene whose reflectance at a plane point is the sharp scene blurred
 *   by the defocus disc on the site lattice: Σ_t D(t)·ρ(p − t), computed here in plain JavaScript. That is the radiance
 *   the capture's defocus (an object-space convolution on the site lattice, #492 step 2a) gives each site query, so
 *   the reference is the in-focus display view, which the #480 harness and docs/DISPLAY_VIEW.md validate against the
 *   capture, of the capture's own defocused radiance.
 *
 * The two agree when the display view applies the disc, and with `lens.diffraction` its combination with each node's
 * diffraction kernel, exactly as a convolution of the radiance: their noise-free expected images are compared with the
 * #480 thresholds (`display-view-acceptance.mjs`).
 */

/** Neutral reflectances of the test scene's materials: dark and light sides of the edge, two bar shades. */
export const DEFOCUS_SCENE_REFLECTANCES = Object.freeze([0.08, 0.62, 0.3, 0.45]);

const TAN_5 = Math.tan(5 * Math.PI / 180);
/**
 * The test scene's material at a point in sites from the frame centre (x right, y down): an edge slanted by 5°, and a
 * group of six bars 4.9 sites wide to its right. No boundary falls on a lattice point (offsets of 0.13 and 3.3 sites),
 * so the two renders, whose lattice arithmetic rounds differently, read the same material at every point.
 */
export function defocusSceneMaterial(x, y) {
  if (x > 12.13 && x < 41.13 && y > -22.13 && y < 20.13) return Math.floor((x - 12.13) / 4.9) % 2 === 0 ? 2 : 3;
  return x - 3.3 > y * TAN_5 ? 1 : 0;
}

/** The sensors: a 24 MP full frame at 6 µm with the 50 mm-equivalent prime, a 12 MP phone at 1.4 µm with the 300 mm-equivalent (about 48 mm). */
export const DEFOCUS_SENSORS = Object.freeze({
  "6": Object.freeze({ width: 6000, height: 4000, pitch: 6, prime: 50 }),
  "1.4": Object.freeze({ width: 4000, height: 3000, pitch: 1.4, prime: 300 })
});

/** Subject at 2 m; focus at 0.8× and 1.25× of it (1× is in focus: byte-identical to the request without the option). */
export const DEFOCUS_SUBJECT_DISTANCE_M = 2;
export const DEFOCUS_CASES = Object.freeze((() => {
  const cases = [];
  for (const pitch of ["6", "1.4"]) for (const fNumber of [2.8, 8, 16]) for (const focusFactor of [0.8, 1.25]) for (const quality of [false, true])
    cases.push(Object.freeze({ id: cases.length, pitch, fNumber, focusFactor, quality }));
  return cases;
})());

/**
 * A case's candidate request, the view block at display scale `k` (about k × k real pixels per display pixel), `block`
 * real pixels wide and high at the frame centre, and `referenceFor(kernel)`, the reference request for the case's disc
 * on the site lattice (`createDefocusDiscSiteKernel` of the diameter the candidate's `lens.defocus` assumption records).
 * Speed: the 2 × 2 box pixel aperture; Quality: diffraction, the four-spot anti-aliasing filter and AHD.
 */
export function defocusCaseRequests(c, { k = 1, block = { width: 64, height: 48 } } = {}) {
  const sensor = DEFOCUS_SENSORS[c.pitch], g = 2 / sensor.width;
  const materialAt = (p) => defocusSceneMaterial(p.u / g, -p.v / g);
  const sharp = { kind: "material-function", sceneId: "test:defocus-sharp", materials: [...DEFOCUS_SCENE_REFLECTANCES], materialAt };
  /** Σ_t D(t)·ρ(p − t) at plane point p: the site offset t = (i, j) is (+x right, +y down), u = x·g, v = −y·g. */
  const blurredScene = (kernel) => {
    const R = kernel.radius, w = kernel.width, weights = kernel.weights, memo = new Map();
    return { kind: "reflectance-function", sceneId: "test:defocus-preblurred", evaluate: (p) => {
      const key = p.u + "," + p.v;
      let value = memo.get(key);
      if (value === undefined) {
        value = 0;
        for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
          const weight = weights[(j + R) * w + i + R];
          if (weight !== 0) value += weight * DEFOCUS_SCENE_REFLECTANCES[defocusSceneMaterial((p.u - i * g) / g, -(p.v + j * g) / g)];
        }
        // The display view asks for the same point once per spectral node; the memo spares the repeated sums.
        if (memo.size > 1 << 20) memo.clear();
        memo.set(key, value);
      }
      return Math.min(1, Math.max(0, value));
    } };
  };
  const lens = { prime: sensor.prime, fNumber: c.fNumber, focusDistanceM: DEFOCUS_SUBJECT_DISTANCE_M * c.focusFactor, ...(c.quality ? { diffraction: "circular-aperture" } : {}) };
  const base = { subjectDistanceM: DEFOCUS_SUBJECT_DISTANCE_M, exposure: { mode: "manual", iso: 100, shutterSeconds: (1 / 125) * (c.fNumber / 8) ** 2 },
    sensor: { pixelPitchMicrometers: sensor.pitch, ...(c.quality ? { antiAliasing: { kind: "four-spot" } } : { pixelAperture: { kind: "box", samplesPerAxis: 2 } }) },
    output: { width: sensor.width, height: sensor.height, maximumPixels: sensor.width * sensor.height * 2, ...(c.quality ? { demosaic: "ahd" } : {}) } };
  const vw = Math.round(sensor.width / k), vh = Math.round(sensor.height / k), rw = Math.max(1, Math.round(block.width / k)), rh = Math.max(1, Math.round(block.height / k));
  const view = { width: vw, height: vh, region: { x: Math.floor((vw - rw) / 2), y: Math.floor((vh - rh) / 2), width: rw, height: rh } };
  return { candidate: { ...base, scene: sharp, lens: { ...lens, defocus: { model: "geometric-disc" } } }, referenceFor: (kernel) => ({ ...base, scene: blurredScene(kernel), lens }), view };
}
