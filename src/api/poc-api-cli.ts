// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Repository-only Node transport for the independent POC. It is excluded from the root public package;
 * transport validation does not define new scientific equations.
 * @see docs/POC_API.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { startPocApiServer } from "./server.js";

startPocApiServer();
