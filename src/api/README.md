# Local POC HTTP tooling

This directory contains repository-only Node.js tooling for local integration testing.

It is intentionally **not** part of the published `@photivra/engine` package surface:

- `package.json` exports only the root scientific library;
- the npm `files` allowlist excludes `dist/api`;
- `npm run pack:check` fails if API files leak into the package tarball;
- the browser-surface CI gate prevents this Node-only code from becoming reachable from the root engine export.

The server is unauthenticated, binds to localhost by default, and is not a production hosting recommendation.

Repository contributors can build and run it with:

```sh
npm run build
node dist/api/poc-api-cli.js
```

See [Local POC Simulation API](../../docs/POC_API.md) for the development transport contract and security limitations.
