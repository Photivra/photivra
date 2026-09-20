// SPDX-License-Identifier: Apache-2.0

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";

import { parsePocSimulationRequest } from "./poc-request.js";
import { simulatePocCamera } from "../simulation/poc-simulation.js";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 64 * 1024;

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  allowedOrigin: string
): void {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let totalBytes = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new RangeError("Request body exceeds 64 KiB.");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text.length === 0 ? null : JSON.parse(text);
}

export interface PocApiServerOptions {
  allowedOrigin?: string;
}

/**
 * Creates the minimal POC HTTP server without binding a network port.
 *
 * This separation keeps imports side-effect free and allows integration tests
 * or trusted development hosts to choose their own listening strategy.
 */
export function createPocApiServer(
  options: PocApiServerOptions = {}
): Server {
  const allowedOrigin =
    options.allowedOrigin ?? "http://localhost:5173";

  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      writeJson(response, 204, null, allowedOrigin);
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      writeJson(
        response,
        200,
        {
          ok: true,
          service: "photivra-engine",
          apiVersion: "0.17.0"
        },
        allowedOrigin
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/poc/simulate") {
      const contentType = request.headers["content-type"] ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        writeJson(
          response,
          415,
          {
            error: {
              code: "UNSUPPORTED_MEDIA_TYPE",
              message: "Content-Type must be application/json."
            }
          },
          allowedOrigin
        );
        return;
      }

      try {
        const body = parsePocSimulationRequest(await readJsonBody(request));
        const result = simulatePocCamera(body);
        writeJson(response, 200, result, allowedOrigin);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown simulation error.";
        writeJson(
          response,
          400,
          {
            error: {
              code: "INVALID_SIMULATION_REQUEST",
              message
            }
          },
          allowedOrigin
        );
      }
      return;
    }

    writeJson(
      response,
      404,
      {
        error: {
          code: "NOT_FOUND",
          message: "Route not found."
        }
      },
      allowedOrigin
    );
  });
}

/**
 * Starts the minimal POC HTTP API using environment-configured local settings.
 *
 * The server is intentionally dependency-free and is not a production hosting
 * recommendation. It exists for local integration testing during POC
 * development.
 */
export function startPocApiServer(): Server {
  const portValue = Number(process.env.PHOTIVRA_API_PORT ?? DEFAULT_PORT);
  const port =
    Number.isSafeInteger(portValue) && portValue > 0 ? portValue : DEFAULT_PORT;
  const host =
    process.env.PHOTIVRA_API_HOST?.trim() || DEFAULT_HOST;
  const allowedOrigin =
    process.env.PHOTIVRA_ALLOWED_ORIGIN ?? "http://localhost:5173";
  const server = createPocApiServer({ allowedOrigin });

  server.listen(port, host, () => {
    process.stdout.write(
      `Photivra POC API listening on http://${host}:${port}\n`
    );
  });

  return server;
}
