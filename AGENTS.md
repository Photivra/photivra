# AGENTS.md

Photivra (/foʊˈtɪvɹə/) is `@photivra/engine`: an Apache-2.0 TypeScript library for camera
optics, exposure, sensor, RAW and image-formation science. It runs in browsers and Node.

## Rules that always apply

1. **Evidence-based.** Every change and every recommendation must be backed by evidence:
   a cited, reputable source for any scientific model or equation, and a test, measurement
   or reproduction for any bug fix, behaviour change or performance claim. Label
   approximations as approximations. Never present a guess, an unmeasured speed-up or
   uncalibrated numbers as fact. If the evidence isn't there, say so instead of changing
   the code.
2. **Free to use.** Only use information, data, code, tools and methods that are free to
   use for this project: openly published papers and specifications, permissively
   licensed code and data compatible with Apache-2.0, and methods free of patent or
   licence fees. Do not depend on paywalled sources, paid services, restricted datasets
   or encumbered algorithms. Record any third-party material and its licence in
   `THIRD_PARTY.md`.
3. **The owner approves anything that goes to production.** Get the owner's explicit approval
   before any action that reaches production: a release, a release tag (a tag publishes to npm),
   package publication, or production data, infrastructure or DNS. Ask for each such action
   separately; an earlier approval does not carry over. Everything else needs no approval.

## Setup and commands

```sh
npm ci                # install
npm test              # unit tests
npm run check         # lint, typecheck, licence/identity/browser gates, tests
npm run coverage      # tests with coverage thresholds
npm run build         # compile to dist/
npm run pack:check    # verify the published package contents
npm run docs:check    # verify docs, links and examples
```

Run the relevant tests while working and the full set above before merging.

## Code

- TypeScript, strict mode. Match the style of the surrounding code.
- The published package must stay browser-safe: no Node-only APIs in `src/`.
- Validate untrusted input and fail with a clear domain error; never let NaN or Infinity
  escape a result.
- Add deterministic tests (fixed seeds) for new behaviour and regressions.
- Update `docs/` and `docs/USAGE.md` when public behaviour changes. Examples must compile.

## Pull requests and releases

- Work on a branch and open a pull request; merge when CI is green.
- Sign off commits (`git commit -s`, DCO).
- Releasing, tagging or publishing follows rule 3: the owner approves it first.
- Never commit secrets or credentials.
