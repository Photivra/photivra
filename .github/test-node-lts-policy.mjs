// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { lookAheadFailures, newestRelease } from "./node-lts-lookahead.mjs";
import { assertMaintainedLts, assertSupportedRuntime, assertSupportedTypes, ltsMarkerGraceDays, supportedNodeMajors } from "./node-lts-policy.mjs";

const reviewedAt = new Date("2026-10-02T12:00:00Z");

test("both Active LTS and Maintenance LTS are eligible", () => {
  assertMaintainedLts(22, reviewedAt);
  assertMaintainedLts(24, reviewedAt);
});
test("approved repository runtime majors pass", () => {
  for (const major of supportedNodeMajors) assertSupportedRuntime(`${major}.13.0`, major === 26 ? undefined : "LTS", reviewedAt);
});
test("Current is not maintained LTS; unknown and EOL majors fail", () => {
  for (const major of [20, 23, 25, 26, 28]) assert.throws(() => assertMaintainedLts(major, reviewedAt));
});
test("pre-LTS dates and the EOL boundary fail", () => {
  assert.throws(() => assertMaintainedLts(22, new Date("2024-10-28T23:59:59Z")));
  assert.throws(() => assertMaintainedLts(22, new Date("2027-04-30T00:00:00Z")));
  assertMaintainedLts(22, new Date("2027-04-29T23:59:59Z"));
});
test("legacy LTS marker cannot admit an expired runtime", () => {
  assert.throws(() => assertSupportedRuntime("24.13.0", "Krypton", new Date("2028-04-30T00:00:00Z")));
});
test("non-LTS builds and prereleases fail", () => {
  assert.throws(() => assertSupportedRuntime("24.0.0", undefined, reviewedAt));
  assert.throws(() => assertSupportedRuntime("24.13.0-rc.1", "Krypton", reviewedAt));
});
test("typings cannot silently advance to another major", () => {
  assertSupportedTypes("24.13.6", reviewedAt);
  assert.throws(() => assertSupportedTypes("26.6.2", reviewedAt));
  assert.throws(() => assertSupportedTypes("^24.0.0", reviewedAt));
});
test("invalid dates fail closed", () => {
  assert.throws(() => assertMaintainedLts(24, new Date("invalid")));
});


test("Current is admitted only within its reviewed stable window", () => {
  assert.throws(() => assertSupportedRuntime("26.0.0", undefined, new Date("2026-05-04T23:59:59Z")));
  assertSupportedRuntime("26.0.0", undefined, new Date("2026-05-05T00:00:00Z"));
  assertSupportedRuntime("26.8.1", undefined, new Date("2026-10-27T23:59:59Z"));
  assert.throws(() => assertSupportedRuntime("26.8.1", "LTS", reviewedAt));
});
test("Current transitions to LTS without losing support or admitting non-LTS builds", () => {
  const transition = new Date("2026-10-28T00:00:00Z");
  assertSupportedRuntime("26.13.0", "LTS", transition);
  assert.throws(() => assertSupportedRuntime("26.13.0", undefined, new Date("2026-11-04T00:00:00Z")));
  assert.throws(() => assertSupportedRuntime("26.13.0", "LTS", new Date("2029-04-30T00:00:00Z")));
});
test("stable Current does not admit prereleases, unknown majors or EOL lines", () => {
  for (const version of ["26.0.0-rc.1", "26.0.0-nightly20261002", "27.0.0", "25.0.0", "20.0.0"])
    assert.throws(() => assertSupportedRuntime(version, undefined, reviewedAt));
});
test("invalid evaluation dates also reject Current", () => {
  assert.throws(() => assertSupportedRuntime("26.8.1", undefined, new Date("invalid")));
});

// Recorded from https://nodejs.org/dist/index.json on 2026-10-28 (02:48 UTC): the newest build of
// each supported major. Node 26 had no LTS build yet on its scheduled LTS date, 2026-10-28.
const recordedReleases = Object.freeze([
  { version: "v26.12.1", date: "2026-10-21", lts: false },
  { version: "v26.12.0", date: "2026-10-14", lts: false },
  { version: "v22.23.4", date: "2026-10-20", lts: "Jod" },
  { version: "v24.22.1", date: "2026-10-20", lts: "Krypton" },
  { version: "v24.22.0", date: "2026-10-14", lts: "Krypton" },
  { version: "v22.23.3", date: "2026-09-23", lts: "Jod" }
]);

test("an LTS start without a published LTS build passes only within the grace period", () => {
  assert.equal(ltsMarkerGraceDays, 7);
  assertSupportedRuntime("26.12.1", undefined, new Date("2026-10-28T00:00:00Z"));
  assertSupportedRuntime("26.12.1", undefined, new Date("2026-11-03T23:59:59Z"));
  assert.throws(() => assertSupportedRuntime("26.12.1", undefined, new Date("2026-11-04T00:00:00Z")), /must carry its LTS marker/);
});
test("the grace period admits no other major and keeps the Current and EOL rules", () => {
  assert.throws(() => assertSupportedRuntime("24.0.0", undefined, new Date("2026-10-28T00:00:00Z")));
  assert.throws(() => assertSupportedRuntime("26.12.1", "LTS", new Date("2026-10-27T23:59:59Z")), /must not claim/);
  assert.throws(() => assertSupportedRuntime("26.12.1", undefined, new Date("2029-04-30T00:00:00Z")));
  assert.throws(() => assertSupportedRuntime("26.12.1-rc.1", undefined, new Date("2026-10-28T00:00:00Z")));
});
test("an LTS-marked build passes through and after the grace period as before", () => {
  for (const at of ["2026-10-28T00:00:00Z", "2026-11-04T00:00:00Z", "2029-04-29T23:59:59Z"])
    assertSupportedRuntime("26.13.0", "LTS", new Date(at));
});
test("the look-ahead picks the newest build of each major by version number", () => {
  assert.deepEqual(newestRelease(recordedReleases, 22), { version: "22.23.4", parts: [22, 23, 4], lts: "Jod" });
  assert.deepEqual(newestRelease([{ version: "v26.9.0", lts: false }, { version: "v26.12.1", lts: false }, { version: "v26.12.0", lts: false }], 26)?.version, "26.12.1");
  assert.equal(newestRelease(recordedReleases, 28), undefined);
});
test("the look-ahead reports the end of the grace period 14 days ahead", () => {
  assert.deepEqual(lookAheadFailures(recordedReleases, new Date("2026-10-20T06:17:00Z")), []);
  assert.deepEqual(lookAheadFailures(recordedReleases, new Date("2026-10-21T06:17:00Z")), [
    { major: 26, date: "2026-11-04", version: "26.12.1", reason: "An LTS Node build must carry its LTS marker." }
  ]);
  assert.equal(lookAheadFailures(recordedReleases, new Date("2026-10-28T06:17:00Z"))[0].date, "2026-11-04");
});
test("the look-ahead passes once the line publishes an LTS-marked build", () => {
  const published = [{ version: "v26.13.0", date: "2026-10-28", lts: "LTS" }, ...recordedReleases];
  assert.deepEqual(lookAheadFailures(published, new Date("2026-10-28T06:17:00Z")), []);
});
test("the look-ahead reports a supported major with no published build", () => {
  const without22 = recordedReleases.filter(({ version }) => !version.startsWith("v22."));
  assert.deepEqual(lookAheadFailures(without22, new Date("2026-10-20T00:00:00Z")).map(({ major, date }) => ({ major, date })), [{ major: 22, date: "2026-10-20" }]);
});
test("the look-ahead fails closed on malformed input", () => {
  assert.throws(() => lookAheadFailures({}, new Date("2026-10-20T00:00:00Z")));
  assert.throws(() => lookAheadFailures(recordedReleases, new Date("invalid")));
});
