// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAhdDemosaicTask, type AhdDemosaicOutput } from "../src/index.js";
import { resolveRgbColorSpace } from "../src/color/rgb-color-spaces.js";
import { reflectRawSiteIndex as reflect } from "../src/sensor/raw-reconstruction.js";
import { bayerProfile, mulberry32, ROLES, runTask } from "./helpers/processing-fixture.js";

// The AHD task reads neighbours by direct index offsets where the neighbourhood lies inside the plane and through
// reflect-101 at the border. These tests prove that the output is bit-identical to the algorithm as it was written
// before that interior fast path (a verbatim reference copy below, one reflect() read per neighbour), and lock
// SHA-256 hashes of `data` and `direction` recorded from the engine before the change.

const TILES = [["red", "green", "green", "blue"], ["green", "red", "blue", "green"], ["green", "blue", "red", "green"], ["blue", "green", "green", "red"]];
const CHANNEL = { red: 0, green: 1, blue: 2 } as Record<string, number>;
type Matrix = readonly (readonly number[])[];

/** Reference copy of the AHD body before the interior fast path (same expressions, same order, reflect() everywhere). */
function referenceAhd(s: Float32Array, W: number, H: number, siteIds: readonly string[], m: Matrix): { data: Float32Array; direction: Uint8Array } {
  const tile = siteIds.map((id) => CHANNEL[id]!), n = W * H;
  const white = [0, 1, 2].map((i) => m[i]![0]! + m[i]![1]! + m[i]![2]!);
  const roleAt = (x: number, y: number): number => tile[(y & 1) * 2 + (x & 1)]!;
  const at = (x: number, y: number): number => s[reflect(y, H) * W + reflect(x, W)]!;
  const gh = new Float32Array(n), gv = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, c = s[i]!;
      if (roleAt(x, y) === 1) { gh[i] = c; gv[i] = c; continue; }
      gh[i] = (at(x - 1, y) + at(x + 1, y)) / 2 + (2 * c - at(x - 2, y) - at(x + 2, y)) / 4;
      gv[i] = (at(x, y - 1) + at(x, y + 1)) / 2 + (2 * c - at(x, y - 2) - at(x, y + 2)) / 4;
    }
  }
  const rgb = [new Float32Array(3 * n), new Float32Array(3 * n)], greens = [gh, gv];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, own = roleAt(x, y);
      for (let d = 0; d < 2; d++) {
        const g = greens[d]!, out = rgb[d]!;
        const diff = (xx: number, yy: number): number => { const j = reflect(yy, H) * W + reflect(xx, W); return s[j]! - g[j]!; };
        out[3 * i + 1] = g[i]!;
        if (own === 1) {
          const hRole = roleAt(x + 1, y), vRole = 2 - hRole;
          out[3 * i + hRole] = g[i]! + (diff(x - 1, y) + diff(x + 1, y)) / 2;
          out[3 * i + vRole] = g[i]! + (diff(x, y - 1) + diff(x, y + 1)) / 2;
        } else {
          out[3 * i + own] = s[i]!;
          out[3 * i + 2 - own] = g[i]! + (diff(x - 1, y - 1) + diff(x + 1, y - 1) + diff(x - 1, y + 1) + diff(x + 1, y + 1)) / 4;
        }
      }
    }
  }
  const lab = [new Float32Array(3 * n), new Float32Array(3 * n)];
  const f = (t: number): number => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  for (let y = 0; y < H; y++) {
    for (let i = y * W; i < (y + 1) * W; i++) for (let d = 0; d < 2; d++) {
      const c = rgb[d]!, R = c[3 * i]!, G = c[3 * i + 1]!, B = c[3 * i + 2]!;
      const fx = f((m[0]![0]! * R + m[0]![1]! * G + m[0]![2]! * B) / white[0]!), fy = f((m[1]![0]! * R + m[1]![1]! * G + m[1]![2]! * B) / white[1]!);
      const fz = f((m[2]![0]! * R + m[2]![1]! * G + m[2]![2]! * B) / white[2]!), o = lab[d]!;
      o[3 * i] = 116 * fy - 16; o[3 * i + 1] = 500 * (fx - fy); o[3 * i + 2] = 200 * (fy - fz);
    }
  }
  const homo = [new Uint8Array(n), new Uint8Array(n)];
  const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, dL = [[0, 0, 0, 0], [0, 0, 0, 0]], dC = [[0, 0, 0, 0], [0, 0, 0, 0]];
      for (let d = 0; d < 2; d++) {
        const o = lab[d]!;
        for (let k = 0; k < 4; k++) {
          const j = reflect(y + N4[k]![1], H) * W + reflect(x + N4[k]![0], W);
          dL[d]![k] = Math.abs(o[3 * i]! - o[3 * j]!);
          dC[d]![k] = (o[3 * i + 1]! - o[3 * j + 1]!) ** 2 + (o[3 * i + 2]! - o[3 * j + 2]!) ** 2;
        }
      }
      const epsL = Math.min(Math.max(dL[0]![0]!, dL[0]![1]!), Math.max(dL[1]![2]!, dL[1]![3]!));
      const epsC = Math.min(Math.max(dC[0]![0]!, dC[0]![1]!), Math.max(dC[1]![2]!, dC[1]![3]!));
      for (let d = 0; d < 2; d++) {
        let count = 0;
        for (let k = 0; k < 4; k++) if (dL[d]![k]! <= epsL && dC[d]![k]! <= epsC) count++;
        homo[d]![i] = count;
      }
    }
  }
  const data = new Float32Array(3 * n), direction = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sh = 0, sv = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = reflect(y + dy, H) * W + reflect(x + dx, W);
        sh += homo[0]![j]!; sv += homo[1]![j]!;
      }
      const i = y * W + x, dir = sh > sv ? 0 : sv > sh ? 1 : 2;
      direction[i] = dir;
      for (let c = 0; c < 3; c++) {
        const a = rgb[0]![3 * i + c]!, b = rgb[1]![3 * i + c]!;
        data[3 * i + c] = dir === 0 ? a : dir === 1 ? b : (a + b) / 2;
      }
    }
  }
  return { data, direction };
}

/** Seeded mosaic with uniform noise, hard edges, exact 0, saturated 1, values above 1 and small negatives. */
function randomMosaic(W: number, H: number, seed: number): Float32Array {
  const rnd = mulberry32(seed), s = new Float32Array(W * H);
  for (let i = 0; i < s.length; i++) {
    const r = rnd(), x = i % W, y = Math.floor(i / W);
    s[i] = r < 0.04 ? -0.03 * rnd() : r < 0.08 ? 0 : r < 0.16 ? 1 : r < 0.2 ? 1.5 : seed % 2 ? rnd() : (((x >> 2) + (y >> 3)) & 1 ? 0.85 : 0.1) + 0.02 * rnd();
  }
  return s;
}
function window(s: Float32Array, SW: number, x0: number, y0: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) out.set(s.subarray((y0 + y) * SW + x0, (y0 + y) * SW + x0 + W), y * W);
  return out;
}
async function engineAhd(samples: Float32Array, W: number, H: number, tile: readonly string[], cameraToXyz?: Matrix): Promise<AhdDemosaicOutput> {
  return runTask((p) => createAhdDemosaicTask({ plane: { width: W, height: H, captureModeId: "native", colorSamplingProfile: bayerProfile(tile), samples },
    channelRoles: ROLES, ...(cameraToXyz === undefined ? {} : { cameraToXyz: cameraToXyz as never }) }, p));
}
const bytes = (a: ArrayBufferView): Buffer => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const sha = (a: ArrayBufferView): string => createHash("sha256").update(bytes(a)).digest("hex");
const SRGB = resolveRgbColorSpace("srgb").value.rgbToXyz as Matrix;
const CAMERA: Matrix = [[0.6, 0.3, 0.12], [0.25, 0.7, 0.05], [0.02, 0.1, 0.95]];

describe("AHD demosaic interior fast path is bit-identical to the reflect-everywhere algorithm", () => {
  const sizes: [number, number][] = [];
  for (let w = 3; w <= 7; w++) for (let h = 3; h <= 7; h++) sizes.push([w, h]);
  sizes.push([8, 8], [9, 3], [3, 9], [33, 5], [5, 33], [64, 48], [65, 47], [127, 65]);

  it("matches the reference copy on random Bayer data of every size 3×3 … 7×7 and larger odd sizes, all four CFA phases", async () => {
    let planes = 0;
    for (const [W, H] of sizes) for (let t = 0; t < 4; t++) {
      const samples = randomMosaic(W, H, 1000 * W + 10 * H + t), tile = TILES[t]!, m = t % 2 ? CAMERA : undefined;
      const got = await engineAhd(samples, W, H, tile, m), want = referenceAhd(samples, W, H, tile, m ?? SRGB);
      expect(bytes(got.data).equals(bytes(want.data)), `${W}×${H} tile ${t} data`).toBe(true);
      expect(bytes(got.direction).equals(bytes(want.direction)), `${W}×${H} tile ${t} direction`).toBe(true);
      planes++;
    }
    expect(planes).toBe(4 * sizes.length);
  });

  it("matches the reference copy on windows of one frame at even and odd offsets, including every frame border", async () => {
    const SW = 61, SH = 43, frame = randomMosaic(SW, SH, 7);
    const windows: [number, number, number, number][] = [[0, 0, 61, 43], [0, 0, 20, 14], [41, 29, 20, 14], [1, 1, 19, 13], [40, 28, 21, 15],
      [0, 30, 5, 13], [56, 0, 5, 7], [17, 11, 4, 3], [30, 20, 3, 23], [2, 3, 57, 37]];
    for (const [x0, y0, W, H] of windows) {
      // A window at (x0, y0) has the CFA phase of the frame tile shifted by the offset parity.
      const tile = TILES[(y0 & 1) * 2 + (x0 & 1)]!, samples = window(frame, SW, x0, y0, W, H);
      const got = await engineAhd(samples, W, H, tile, CAMERA), want = referenceAhd(samples, W, H, tile, CAMERA);
      expect(bytes(got.data).equals(bytes(want.data)), `window ${x0},${y0} ${W}×${H}`).toBe(true);
      expect(bytes(got.direction).equals(bytes(want.direction)), `window ${x0},${y0} ${W}×${H} direction`).toBe(true);
    }
  });

  it("still rejects planes below 3×3 (2×2, 2×3, 3×2)", async () => {
    for (const [W, H] of [[2, 2], [2, 3], [3, 2]] as const) {
      expect(() => createAhdDemosaicTask({ plane: { width: W, height: H, captureModeId: "native", colorSamplingProfile: bayerProfile(), samples: new Float32Array(W * H) }, channelRoles: ROLES },
        { yieldControl: async () => {} })).toThrow("AHD requires at least a 3×3 mosaic.");
    }
  });

  it("keeps the SHA-256 of data and direction recorded from the engine before the change", async () => {
    // Recorded from origin/main 562e23f (before the interior fast path) with this file's randomMosaic and engineAhd.
    const cases: [number, number, number, number, string, string][] = [
      [3, 3, 0, 11, "7fab2eee6246aa14f873809773a429ad7f80cbcbaaea6cbd8978d95385d20d8f", "d88c0c1117010130f86ca7720e6d1481450e28e55de50daf65b2a17cbbee86e7"],
      [7, 5, 1, 12, "9173a29526293ceea2420ae6a6322f248f93e1d2b9bb49cfc9e8c2a4fbff82c0", "151a019170b82e63a08422cfe298bb93d12c4b78de8bcab5733625e8b85cb8ed"],
      [5, 7, 2, 13, "34f5925b3040d77212dd8d68e292852261511a015ba229e8cf9ae5f3047a985c", "4a870d4f6fb2e8dbb1fb8e5a0e2eb41d3a39f59b49951dbe14c9f6f8481d1080"],
      [64, 48, 3, 14, "5566f18a716ab765e2d1c4cc5a1dd7ac693826b2b99443c3d40060c7fa5181d9", "08ef001064a05554819b2f9a0aed5d3948d05fc47cb5a6052dd67ce59fd48c27"],
      [257, 131, 0, 15, "447ad14b40a4003a85eb12b136cb7f18b5a3604c1715dc7b2a7456242759a72d", "f1c621e312f8789e9b0f5e9f9fb7e493da062ebab174262337800b2d53642247"],
      [300, 201, 1, 16, "1dd9d2a07d8432b857501523d28f1b252d41d2abc5d9c782da7e1db4f36df6dc", "2610dd85952454ce0f854ab80f226531a11798300a34c41ca96acf45100f398a"]
    ];
    for (const [W, H, t, seed, data, direction] of cases) {
      const out = await engineAhd(randomMosaic(W, H, seed), W, H, TILES[t]!, t % 2 ? CAMERA : undefined);
      expect([sha(out.data), sha(out.direction)], `${W}×${H} tile ${t}`).toEqual([data, direction]);
    }
  });
});
