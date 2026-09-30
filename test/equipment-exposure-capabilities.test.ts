import { describe, expect, it } from "vitest";

import {
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  resolveGenericEquipmentExposureCapabilities,
  type GenericBodyExposureCapabilityProfile,
  type GenericLensExposureCapabilityProfile
} from "../src/index.js";

const evidence = (
  ref: string
): readonly [{
  sourceOrigin: "photivra";
  sourceReference: string;
  reuseStatus: "photivra-owned";
}] => [{
  sourceOrigin: "photivra",
  sourceReference: ref,
  reuseStatus: "photivra-owned"
}];

const bodyProfile = (
  autoIso: "supported" | "unsupported" | "unknown" = "supported"
): GenericBodyExposureCapabilityProfile =>
  parseGenericBodyExposureCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "body-prosumer",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    evidence: evidence("body"),
    shutter: {
      durationSecondsRange: {
        value: {
          minimum: 1 / 8000,
          maximum: 30
        },
        evidence: evidence("shutter-range")
      },
      settingGrid: {
        kind: "discrete-values",
        values: {
          value: [
            1 / 8000,
            1 / 4000,
            1 / 2000,
            1 / 1000,
            1 / 500,
            1 / 250,
            1 / 125,
            1 / 60,
            1 / 30,
            1 / 15,
            1 / 8,
            1 / 4,
            1 / 2,
            1,
            2,
            4,
            8,
            15,
            30
          ],
          evidence: evidence("shutter-grid")
        }
      }
    },
    iso: {
      range: {
        value: {
          minimum: 100,
          maximum: 12800
        },
        evidence: evidence("iso-range")
      },
      settingGrid: {
        kind: "discrete-values",
        values: {
          value: [
            100,
            200,
            400,
            800,
            1600,
            3200,
            6400,
            12800
          ],
          evidence: evidence("iso-grid")
        }
      },
      autoIso: {
        value: autoIso,
        evidence: evidence("auto-iso")
      }
    }
  });

const variableZoomLens = (): GenericLensExposureCapabilityProfile =>
  parseGenericLensExposureCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "lens-standard-variable-zoom",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    evidence: evidence("lens"),
    focalLengthMmRange: {
      value: {
        minimum: 24,
        maximum: 70
      },
      evidence: evidence("focal-range")
    },
    aperture: {
      widestAvailableFNumber: {
        kind: "piecewise-linear-by-focal-length",
        samples: {
          value: [
            {
              focalLengthMm: 24,
              fNumber: 2.8
            },
            {
              focalLengthMm: 50,
              fNumber: 3.5
            },
            {
              focalLengthMm: 70,
              fNumber: 4
            }
          ],
          evidence: evidence("wide-open-curve")
        }
      },
      narrowestAvailableFNumber: {
        value: 22,
        evidence: evidence("narrowest")
      },
      settingGrid: {
        kind: "discrete-values",
        values: {
          value: [
            2.8,
            3.2,
            3.5,
            4,
            4.5,
            5.6,
            8,
            11,
            16,
            22
          ],
          evidence: evidence("aperture-grid")
        }
      }
    }
  });

const constantPrimeLens = (): GenericLensExposureCapabilityProfile =>
  parseGenericLensExposureCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "lens-normal-prime",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    evidence: evidence("prime"),
    focalLengthMmRange: {
      value: {
        minimum: 50,
        maximum: 50
      },
      evidence: evidence("prime-focal")
    },
    aperture: {
      widestAvailableFNumber: {
        kind: "constant",
        fNumber: {
          value: 1.8,
          evidence: evidence("prime-wide")
        }
      },
      narrowestAvailableFNumber: {
        value: 16,
        evidence: evidence("prime-narrow")
      },
      settingGrid: {
        kind: "continuous-within-range"
      }
    }
  });

describe("generic body exposure capabilities", () => {
  it("parses evidence-backed shutter/ISO ranges, grids, and Auto ISO availability", () => {
    const body = bodyProfile();

    expect(body.profileId).toBe(
      "body-prosumer"
    );
    expect(body.shutter.settingGrid.kind)
      .toBe("discrete-values");
    expect(body.iso.settingGrid.kind)
      .toBe("discrete-values");
    expect(body.iso.autoIso.value)
      .toBe("supported");
  });

  it("preserves supported, unsupported, and unknown Auto ISO as distinct states", () => {
    expect(
      bodyProfile("supported")
        .iso.autoIso.value
    ).toBe("supported");
    expect(
      bodyProfile("unsupported")
        .iso.autoIso.value
    ).toBe("unsupported");
    expect(
      bodyProfile("unknown")
        .iso.autoIso.value
    ).toBe("unknown");
  });

  it("rejects malformed ranges and discrete grids", () => {
    expect(() =>
      parseGenericBodyExposureCapabilityProfile({
        ...bodyProfile(),
        iso: {
          ...bodyProfile().iso,
          range: {
            value: {
              minimum: 800,
              maximum: 100
            },
            evidence: evidence("bad")
          }
        }
      })
    ).toThrow(
      "minimum must be less than or equal to maximum"
    );

    const body = bodyProfile();
    expect(() =>
      parseGenericBodyExposureCapabilityProfile({
        ...body,
        iso: {
          ...body.iso,
          settingGrid: {
            kind: "discrete-values",
            values: {
              value: [
                100,
                400,
                200
              ],
              evidence: evidence("bad-grid")
            }
          }
        }
      })
    ).toThrow(
      "must be strictly increasing"
    );

    expect(() =>
      parseGenericBodyExposureCapabilityProfile({
        ...body,
        iso: {
          ...body.iso,
          autoIso: {
            value: "sometimes",
            evidence: evidence("bad-auto")
          }
        }
      })
    ).toThrow("autoIso.value is invalid");
  });
});

describe("generic lens exposure capabilities", () => {
  it("parses focal-dependent widest f-number without ambiguous max-aperture semantics", () => {
    const lens =
      variableZoomLens();

    expect(
      lens.aperture
        .widestAvailableFNumber.kind
    ).toBe(
      "piecewise-linear-by-focal-length"
    );
    expect(
      lens.aperture
        .narrowestAvailableFNumber
        .value
    ).toBe(22);
  });

  it("supports fixed-focal constant-wide-open generic lenses", () => {
    const lens =
      constantPrimeLens();
    expect(
      lens.focalLengthMmRange.value
    ).toEqual({
      minimum: 50,
      maximum: 50
    });
    expect(
      lens.aperture
        .widestAvailableFNumber
    ).toMatchObject({
      kind: "constant",
      fNumber: {
        value: 1.8
      }
    });
  });

  it("rejects incomplete focal curves and impossible aperture limits", () => {
    const lens =
      variableZoomLens();

    expect(() =>
      parseGenericLensExposureCapabilityProfile({
        ...lens,
        aperture: {
          ...lens.aperture,
          widestAvailableFNumber: {
            kind:
              "piecewise-linear-by-focal-length",
            samples: {
              value: [
                {
                  focalLengthMm: 30,
                  fNumber: 2.8
                },
                {
                  focalLengthMm: 70,
                  fNumber: 4
                }
              ],
              evidence: evidence("bad-curve")
            }
          }
        }
      })
    ).toThrow(
      "must begin at the declared minimum focal length"
    );

    expect(() =>
      parseGenericLensExposureCapabilityProfile({
        ...constantPrimeLens(),
        aperture: {
          ...constantPrimeLens().aperture,
          widestAvailableFNumber: {
            kind: "constant",
            fNumber: {
              value: 22,
              evidence: evidence("bad-wide")
            }
          },
          narrowestAvailableFNumber: {
            value: 16,
            evidence: evidence("narrow")
          }
        }
      })
    ).toThrow(
      "must not exceed narrowestAvailableFNumber"
    );
  });
});

describe("combined generic exposure capability resolution", () => {
  it("resolves variable-aperture zoom capability at the selected focal length", () => {
    const resolved =
      resolveGenericEquipmentExposureCapabilities({
        bodyProfile: bodyProfile(),
        lensProfile:
          variableZoomLens(),
        selectedFocalLengthMm: 60
      });

    expect(
      resolved.aperture
        .widestAvailableFNumber
    ).toBeCloseTo(3.75, 12);
    expect(
      resolved.aperture
        .settingGrid
    ).toEqual({
      kind: "discrete-values",
      values: [
        4,
        4.5,
        5.6,
        8,
        11,
        16,
        22
      ]
    });
    expect(
      resolved.iso
        .autoIsoAvailability
    ).toBe("supported");
    expect(
      resolved.bodyProfile
    ).toEqual({
      profileId: "body-prosumer",
      profileVersion: "1.0.0"
    });
    expect(
      resolved.lensProfile
    ).toEqual({
      profileId:
        "lens-standard-variable-zoom",
      profileVersion: "1.0.0"
    });
    expect(
      resolved.exactNamedEquipmentEmulationClaimed
    ).toBe(false);
  });

  it("keeps continuous setting grids continuous after resolution", () => {
    const body =
      parseGenericBodyExposureCapabilityProfile({
        ...bodyProfile(),
        shutter: {
          ...bodyProfile().shutter,
          settingGrid: {
            kind: "continuous-within-range"
          }
        },
        iso: {
          ...bodyProfile().iso,
          settingGrid: {
            kind: "continuous-within-range"
          }
        }
      });

    const resolved =
      resolveGenericEquipmentExposureCapabilities({
        bodyProfile: body,
        lensProfile:
          constantPrimeLens(),
        selectedFocalLengthMm: 50
      });

    expect(
      resolved.aperture.settingGrid
    ).toEqual({
      kind: "continuous-within-range"
    });
    expect(
      resolved.shutter.settingGrid
    ).toEqual({
      kind: "continuous-within-range"
    });
    expect(
      resolved.iso.settingGrid
    ).toEqual({
      kind: "continuous-within-range"
    });
  });

  it("fails closed outside focal range or when no discrete aperture setting remains valid", () => {
    expect(() =>
      resolveGenericEquipmentExposureCapabilities({
        bodyProfile: bodyProfile(),
        lensProfile:
          variableZoomLens(),
        selectedFocalLengthMm: 85
      })
    ).toThrow(
      "lies outside the lens capability range"
    );

    const lens =
      variableZoomLens();
    const narrowGrid =
      parseGenericLensExposureCapabilityProfile({
        ...lens,
        aperture: {
          ...lens.aperture,
          settingGrid: {
            kind: "discrete-values",
            values: {
              value: [2.8],
              evidence: evidence("too-narrow-grid")
            }
          }
        }
      });

    expect(() =>
      resolveGenericEquipmentExposureCapabilities({
        bodyProfile: bodyProfile(),
        lensProfile: narrowGrid,
        selectedFocalLengthMm: 70
      })
    ).toThrow(
      "has no discrete values inside the resolved capability range"
    );
  });

  it("does not mutate source profiles during resolution", () => {
    const body = bodyProfile();
    const lens =
      variableZoomLens();
    const bodyBefore =
      JSON.stringify(body);
    const lensBefore =
      JSON.stringify(lens);

    resolveGenericEquipmentExposureCapabilities({
      bodyProfile: body,
      lensProfile: lens,
      selectedFocalLengthMm: 50
    });

    expect(JSON.stringify(body))
      .toBe(bodyBefore);
    expect(JSON.stringify(lens))
      .toBe(lensBefore);
  });

  it("rejects invalid selected focal length", () => {
    expect(() =>
      resolveGenericEquipmentExposureCapabilities({
        bodyProfile: bodyProfile(),
        lensProfile:
          variableZoomLens(),
        selectedFocalLengthMm:
          Number.NaN
      })
    ).toThrow(
      "selectedFocalLengthMm must be finite and greater than zero"
    );
  });
});
