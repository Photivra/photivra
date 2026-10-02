// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { assertMaintainedLts, assertSupportedRuntime, assertSupportedTypes, supportedNodeMajors } from "./node-lts-policy.mjs";

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
  assert.throws(() => assertSupportedRuntime("26.13.0", undefined, transition));
  assert.throws(() => assertSupportedRuntime("26.13.0", "LTS", new Date("2029-04-30T00:00:00Z")));
});
test("stable Current does not admit prereleases, unknown majors or EOL lines", () => {
  for (const version of ["26.0.0-rc.1", "26.0.0-nightly20261002", "27.0.0", "25.0.0", "20.0.0"])
    assert.throws(() => assertSupportedRuntime(version, undefined, reviewedAt));
});
test("invalid evaluation dates also reject Current", () => {
  assert.throws(() => assertSupportedRuntime("26.8.1", undefined, new Date("invalid")));
});
