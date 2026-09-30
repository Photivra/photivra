import { describe, expect, it } from "vitest";

import {
  parseSpectralWavelengthBasis,
  parseSpectralWavelengthRangeNanometers,
  parseSpectralWavelengthSample
} from "../src/index.js";

describe("shared spectral foundation", () => {
  it("parses renderer-neutral wavelength primitives", () => {
    expect(parseSpectralWavelengthBasis("vacuum")).toBe("vacuum");
    expect(
      parseSpectralWavelengthRangeNanometers({
        minimum: 400,
        maximum: 700
      })
    ).toEqual({ minimum: 400, maximum: 700 });
    expect(
      parseSpectralWavelengthSample({
        wavelengthNanometers: 550
      })
    ).toEqual({ wavelengthNanometers: 550 });
  });

  it("fails closed on unresolved enum values and invalid ranges", () => {
    expect(() =>
      parseSpectralWavelengthBasis("water")
    ).toThrow("wavelengthBasis is invalid.");

    expect(() =>
      parseSpectralWavelengthRangeNanometers({
        minimum: 700,
        maximum: 400
      })
    ).toThrow(
      "wavelengthRangeNanometers.minimum must be less than maximum."
    );

    expect(() =>
      parseSpectralWavelengthSample({
        wavelengthNanometers: 0
      })
    ).toThrow(
      "spectralSample.wavelengthNanometers must be finite and greater than zero."
    );
  });
});
