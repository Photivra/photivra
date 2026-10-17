// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  calculateAtmosphericHaze,
  calculateColorDifference,
  calculateFlashGuideNumber,
  calculateFlashPowerForDistance,
  calculateHighlightPriorityPlacementSignal,
  calculatePhotonEnergyFromWavelength,
  calculateShutterAngleExposureSeconds,
  calculateShutterAngleFromExposureSeconds,
  InvalidConfigurationError,
  InvalidScientificInputError,
  resolveChromaticAdaptationConeMatrix
} from "../src/index.js";
import { deriveNativeSiteStreamSeedUint32, deriveSensorFixedPatternSeedUint32 } from "../src/sensor/stochastic-seed.js";

/*
 * The documented rule (docs/API_STYLE.md, "Error classes"): a wrong shape is an
 * InvalidConfigurationError; a bad scientific value is an InvalidScientificInputError.
 * This scan finds InvalidScientificInputError messages that describe a shape problem.
 */
const SHAPE_MESSAGE = /must be an object|must be a plain object|must be an array|must be a non-empty array|must be an? (non-empty )?string|must be (a )?boolean|must be a function|is not supported|must be one of|is invalid|[Uu]nknown|Expected a profile object|unsupported fields|must be "|must contain only/;

/** Kept on purpose: well-formed requests the selected capability or model cannot serve, or numeric constraints. */
const KEPT_AS_SCIENTIFIC_INPUT = new Set([
  "src/capture/focus-control.ts: Selected focus-control mode is not supported by the profile.",
  "src/capture/focus-control.ts: Selected focus/release priority is not supported by the profile.",
  "src/capture/release-sequence.ts: Exposure bracketing is not supported by the selected release capability profile.",
  "src/capture/release-sequence.ts: The selected exposure-bracket axis is not supported by the release capability profile.",
  "src/capture/release-sequence.ts: Focus bracketing is not supported by the selected release capability profile.",
  "src/capture/release-sequence.ts: The selected drive mode is not supported by the release capability profile.",
  "src/equipment/iso-capabilities.ts: Requested standard exposure index is not supported by the selected ISO capability/mode.",
  "src/equipment/iso-capabilities.ts: Requested expanded ISO setting is not supported by the selected ISO capability/mode.",
  "src/exposure/flash.ts: Requested ordinary flash sync mode is not supported by the capability profile.",
  "src/equipment/exposure-capabilities.ts: Resolved aperture range is invalid.",
  "src/exposure/exposure-mode-resolver.ts: capabilities aperture range is invalid.",
  "src/exposure/exposure-mode-resolver.ts: capabilities shutter range is invalid.",
  "src/exposure/exposure-mode-resolver.ts: capabilities ISO range is invalid.",
  "src/output/capture-geometry.ts: outputRaster must preserve outputCropRect aspect ratio within nearest-integer raster rounding; implicit geometric stretching is not supported.",
  "src/sensor/spectral-quadrature.ts: spectralQuadrature node subdivision identity is invalid.",
  "src/sensor/optical-stack.ts: Effective anti-aliasing spatial response is unknown/unasserted for this optical-stack profile."
]);

const root = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

/** Message text of a `new X(...)` expression with string pieces joined; non-literal parts become "…". */
function messageText(node: ts.Expression): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => "…" + span.literal.text).join("");
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return messageText(node.left) + messageText(node.right);
  if (ts.isParenthesizedExpression(node)) return messageText(node.expression);
  if (ts.isConditionalExpression(node)) return messageText(node.whenTrue) + " | " + messageText(node.whenFalse);
  return "…";
}

describe("error classes follow the documented rule (2.0.0, #276)", () => {
  it("never reports a shape problem as InvalidScientificInputError, apart from the reviewed exceptions", () => {
    const found: string[] = [];
    for (const path of sourceFiles(join(root, "src"))) {
      const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2022, true);
      const visit = (node: ts.Node): void => {
        if (ts.isNewExpression(node) && node.expression.getText(file) === "InvalidScientificInputError" && node.arguments?.[0]) {
          const id = `${relative(root, path).split("\\").join("/")}: ${messageText(node.arguments[0])}`;
          if (SHAPE_MESSAGE.test(id.slice(id.indexOf(": ") + 2)) && !KEPT_AS_SCIENTIFIC_INPUT.has(id)) found.push(id);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(found).toEqual([]);
  });

  it("never throws a plain Error, TypeError or RangeError from the published source", () => {
    const found: string[] = [];
    for (const path of sourceFiles(join(root, "src"))) {
      const rel = relative(root, path).split("\\").join("/");
      if (rel.startsWith("src/api/")) continue; // repository-only POC transport, not published
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/throw new (Error|TypeError|RangeError)\(/g)) {
        found.push(`${rel}:${text.slice(0, match.index).split("\n").length}`);
      }
    }
    // The lean executor's internal "outside lean scope" signal is caught at once and never escapes.
    expect(found).toEqual([expect.stringMatching(/^src\/capture\/native-environment-lean\.ts:\d+$/)]);
  });

  it("reports wrong shapes as InvalidConfigurationError with the stable code", () => {
    const shape: readonly (() => unknown)[] = [
      (): unknown => calculateAtmosphericHaze([] as never),
      (): unknown => calculateColorDifference({ reference: null, sample: { lStar: 50, aStar: 0, bStar: 0 }, formula: "cie76" } as never),
      (): unknown => calculateColorDifference({ reference: { lStar: 50, aStar: 0, bStar: 0 }, sample: { lStar: 50, aStar: 0, bStar: 0 },
        formula: "cie3000" } as never),
      (): unknown => resolveChromaticAdaptationConeMatrix("not-a-transform" as never)
    ];
    for (const call of shape) {
      expect(call).toThrow(InvalidConfigurationError);
      try { call(); } catch (error) { expect((error as InvalidConfigurationError).code).toBe("INVALID_CONFIGURATION"); }
    }
  });

  it("reports bad scientific values of calculations as InvalidScientificInputError with the stable code", () => {
    const value: readonly (() => unknown)[] = [
      (): unknown => calculateFlashGuideNumber({ fullPowerGuideNumberMetersIso100: -1, powerFraction: 1, iso: 100 }),
      (): unknown => calculateFlashGuideNumber({ fullPowerGuideNumberMetersIso100: 40, powerFraction: 2, iso: 100 }),
      (): unknown => calculateFlashPowerForDistance({ fullPowerGuideNumberMetersIso100: 40, subjectDistanceM: 0, apertureFNumber: 4,
        iso: 100, minimumPowerFraction: 1 / 128 }),
      (): unknown => calculateShutterAngleExposureSeconds(24, 400),
      (): unknown => calculateShutterAngleExposureSeconds(0, 180),
      (): unknown => calculateShutterAngleFromExposureSeconds(24, 1),
      (): unknown => calculateHighlightPriorityPlacementSignal(-1, 1),
      (): unknown => calculatePhotonEnergyFromWavelength({ wavelengthNanometers: -500, wavelengthBasis: "vacuum" }),
      (): unknown => deriveNativeSiteStreamSeedUint32(-1, 0, 0),
      (): unknown => deriveSensorFixedPatternSeedUint32(0, 0.5, 0, 0)
    ];
    for (const call of value) {
      expect(call).toThrow(InvalidScientificInputError);
      try { call(); } catch (error) {
        expect((error as InvalidScientificInputError).code).toBe("INVALID_SCIENTIFIC_INPUT");
        expect(error).toBeInstanceOf(RangeError); // unchanged base class, so 1.x RangeError handlers still match
      }
    }
  });
});
