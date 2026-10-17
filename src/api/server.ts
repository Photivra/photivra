// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal, dependency-free HTTP server for the proof-of-concept (POC) API, for local
 * integration testing only. It is not a production hosting recommendation.
 * @see docs/POC_API.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  InvalidScientificInputError,
  InvalidScientificResultError
} from "../core/validation.js";
import {
  InvalidPocRequestError,
  parsePocSimulationRequest
} from "./poc-request.js";
import {
  POC_SIMULATION_API_VERSION,
  simulatePocCamera
} from "../simulation/poc-simulation.js";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 64 * 1024;
const INTERNAL_ERROR_MESSAGE = "Internal simulation error.";

/** Request body exceeded MAX_BODY_BYTES; mapped to 413, never to 400. */
class RequestBodyTooLargeError extends RangeError {}

/** Request body was not parseable JSON; the parser's text is not echoed. */
class MalformedJsonBodyError extends SyntaxError {}

function corsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store"
  };
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  allowedOrigin: string,
  extraHeaders: Record<string, string> = {}
): void {
  response.writeHead(statusCode, {
    ...corsHeaders(allowedOrigin),
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function writeError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  allowedOrigin: string,
  extraHeaders: Record<string, string> = {}
): void {
  writeJson(
    response,
    statusCode,
    { error: { code, message } },
    allowedOrigin,
    extraHeaders
  );
}

/**
 * Only request and validation failures the caller can fix are client errors. Their
 * messages are written by the engine. Anything else is an internal fault, and its
 * text is never sent to the client.
 */
function isClientRequestError(error: unknown): error is Error {
  return (
    error instanceof MalformedJsonBodyError ||
    error instanceof InvalidPocRequestError ||
    error instanceof InvalidConfigurationError ||
    error instanceof InvalidScientificInputError
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestBodyTooLargeError("Request body exceeds 64 KiB.");
  }

  let totalBytes = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new RequestBodyTooLargeError("Request body exceeds 64 KiB.");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MalformedJsonBodyError("Request body is not valid JSON.");
  }
}

export interface PocApiServerOptions {
  allowedOrigin?: string;
}

/**
 * Creates the minimal POC HTTP server without opening a network port.
 *
 * Keeping these separate means importing the module has no side effects, and
 * tests or trusted development hosts can choose how to listen.
 */
export function createPocApiServer(
  options: PocApiServerOptions = {}
): Server {
  const allowedOrigin =
    options.allowedOrigin ?? "http://localhost:5173";

  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      // 204 No Content carries no body and therefore no Content-Type.
      response.writeHead(204, corsHeaders(allowedOrigin));
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      writeJson(
        response,
        200,
        {
          ok: true,
          service: "photivra-engine",
          apiVersion: POC_SIMULATION_API_VERSION
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

      let parsed = false;
      try {
        const body = parsePocSimulationRequest(await readJsonBody(request));
        parsed = true;
        const result = simulatePocCamera(body);
        writeJson(response, 200, result, allowedOrigin);
      } catch (error) {
        if (parsed && error instanceof InvalidScientificResultError) {
          // The request is well formed, but its finite values push a result out of the finite
          // number range. The caller caused it, but it is not a shape or validation failure.
          writeError(
            response,
            422,
            "SIMULATION_RESULT_OUT_OF_RANGE",
            error.message,
            allowedOrigin
          );
        } else if (error instanceof RequestBodyTooLargeError) {
          // The unread remainder of the body is abandoned, so close the connection.
          writeError(
            response,
            413,
            "PAYLOAD_TOO_LARGE",
            error.message,
            allowedOrigin,
            { Connection: "close" }
          );
        } else if (isClientRequestError(error)) {
          writeError(
            response,
            400,
            "INVALID_SIMULATION_REQUEST",
            error.message,
            allowedOrigin
          );
        } else {
          writeError(
            response,
            500,
            "INTERNAL_ERROR",
            INTERNAL_ERROR_MESSAGE,
            allowedOrigin
          );
        }
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
 * Starts the minimal POC HTTP API with local settings from environment variables.
 *
 * The server has no dependencies by design and is not a production hosting
 * recommendation. It exists for local integration testing.
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
