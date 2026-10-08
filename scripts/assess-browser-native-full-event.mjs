// SPDX-License-Identifier: Apache-2.0
import process from 'node:process';
import { frozenFullNativeWorkObstructions } from './lib/browser-native-full-event-preflight.mjs';

if (process.argv.length !== 2) {
  throw new Error('Usage: npm run assess:native-full-event');
}
const cases = frozenFullNativeWorkObstructions();
if (cases.length !== 4 || cases.some(x =>
    x.countScreenDisposition !== 'current-path-a-count-bound-reject' ||
    !x.exceedsWholeEventWorkCeiling || x.currentExecutorRuntimeAdmitted ||
    x.fullNativeQualified || x.actualFullNativeExecutionAttempted ||
    x.actualFullNativeElapsedMilliseconds !== null ||
    x.fullNativeRuntimeProjection !== null)) {
  throw new Error('Frozen #251 work disposition changed; re-review the approved resource contracts.');
}
process.stdout.write(JSON.stringify({
  schemaVersion: '1.0.0',
  kind: 'repository-only-251-full-event-static-preflight',
  disposition: 'current-path-a-count-bound-reject',
  scientificModelOrWorkPolicyChanged: false,
  evidenceOnly: true,
  fullyExecutedEventCount: 0,
  measuredNativeBackend: null,
  measuredFullNativeRuntimeMilliseconds: null,
  measuredPeakResidentBytes: null,
  sourceOfAuthority: 'docs/BROWSER_NATIVE_CAPTURE_RESOURCE_ACCOUNTING.md',
  fullNativeQualified: false,
  nextRequiredGate: '#250 DCO+merge -> #251 exact Path-A work optimization or recorded obstruction -> #235 browser backend',
  cases
}, null, 2) + '\n');
