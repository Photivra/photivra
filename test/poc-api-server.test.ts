import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createPocApiServer } from "../src/api/server.js";

let activeServer: Server | undefined;

async function listenForTest(server: Server): Promise<string> {
  activeServer = server;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo | null;
  if (address === null) {
    throw new Error("Test server did not expose an address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  const server = activeServer;
  activeServer = undefined;
  if (server === undefined || !server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
});

describe("POC HTTP API", () => {
  it("serves health without importing a listening side effect", async () => {
    const baseUrl = await listenForTest(
      createPocApiServer({
        allowedOrigin: "http://example.test"
      })
    );

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://example.test"
    );
    expect(await response.json()).toEqual({
      ok: true,
      service: "photivra-engine",
      apiVersion: "0.18.0"
    });
  });

  it("handles CORS preflight", async () => {
    const baseUrl = await listenForTest(createPocApiServer());

    const response = await fetch(`${baseUrl}/v1/poc/simulate`, {
      method: "OPTIONS"
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST"
    );
  });

  it("returns a structured 404 for unknown routes", async () => {
    const baseUrl = await listenForTest(createPocApiServer());

    const response = await fetch(`${baseUrl}/missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found."
      }
    });
  });

  it("runs a valid simulation end to end", async () => {
    const baseUrl = await listenForTest(createPocApiServer());

    const response = await fetch(`${baseUrl}/v1/poc/simulate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sensor: {
          widthMm: 36,
          heightMm: 24,
          pixelWidth: 6000,
          pixelHeight: 4000
        },
        lens: {
          focalLengthMm: 200,
          aperture: 5.6
        },
        exposure: {
          shutterSeconds: 0.001,
          iso: 800
        },
        focus: {
          focusDistanceM: 22,
          circleOfConfusionMm: 0.03
        },
        crop: {
          factor: 1
        },
        diffraction: {
          wavelengthNm: 550
        },
        motion: {
          positionM: { x: 0, y: 0, z: 22 },
          velocityMps: { x: 0, y: 0, z: 0 }
        }
      })
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      apiVersion: string;
      provenance: { kind: string };
    };
    expect(body.apiVersion).toBe("0.18.0");
    expect(body.provenance.kind).toBe("calculated");
  });

  it("rejects malformed request structure", async () => {
    const baseUrl = await listenForTest(createPocApiServer());

    const response = await fetch(`${baseUrl}/v1/poc/simulate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sensor: "not-a-sensor"
      })
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("INVALID_SIMULATION_REQUEST");
    expect(body.error.message).toContain("sensor must be an object");
  });

  it("rejects empty JSON bodies through normal validation", async () => {
    const baseUrl = await listenForTest(createPocApiServer());

    const response = await fetch(`${baseUrl}/v1/poc/simulate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      }
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { message: string };
    };
    expect(body.error.message).toContain("request must be an object");
  });

  it("rejects malformed JSON bodies", async () => {
    const baseUrl = await listenForTest(createPocApiServer());

    const response = await fetch(`${baseUrl}/v1/poc/simulate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: "{"
    });

    expect(response.status).toBe(400);
  });

  it("rejects oversized request bodies", async () => {
    const baseUrl = await listenForTest(createPocApiServer());

    const response = await fetch(`${baseUrl}/v1/poc/simulate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        padding: "x".repeat(70 * 1024)
      })
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { message: string };
    };
    expect(body.error.message).toContain("exceeds 64 KiB");
  });

  it("rejects non-JSON simulation requests", async () => {
    const baseUrl = await listenForTest(createPocApiServer());

    const response = await fetch(`${baseUrl}/v1/poc/simulate`, {
      method: "POST",
      headers: {
        "content-type": "text/plain"
      },
      body: "{}"
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Content-Type must be application/json."
      }
    });
  });
});
