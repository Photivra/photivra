// SPDX-License-Identifier: Apache-2.0

/**
 * Command-line entry point for the local proof-of-concept (POC) HTTP server. Node only, for this
 * repository; it is not part of the published package. Request validation here adds no new
 * scientific equations.
 * @see docs/POC_API.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { startPocApiServer } from "./server.js";

startPocApiServer();
