import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { emergencyPatchDetector } from './emergency-patch.js';
import { securityCriticalDetector } from './security-critical.js';
import { dependencyRotationDetector } from './dependency-rotation.js';
import { governanceShiftDetector } from './governance-shift.js';
import { maintainerDepartureDetector } from './maintainer-departure.js';
import { silentMergeDetector } from './silent-merge.js';
import { protocolUpgradeDetector } from './protocol-upgrade.js';
import { supplyChainRiskDetector } from './supply-chain-risk.js';

const detectors: SignalDetector[] = [
  emergencyPatchDetector,
  securityCriticalDetector,
  dependencyRotationDetector,
  governanceShiftDetector,
  maintainerDepartureDetector,
  silentMergeDetector,
  protocolUpgradeDetector,
  supplyChainRiskDetector,
];

export function runDetectors(input: DetectorInput): SignalClassification[] {
  const results: SignalClassification[] = [];
  for (const detector of detectors) {
    const classification = detector.detect(input);
    if (classification) results.push(classification);
  }
  return results;
}

export function getDetector(type: string): SignalDetector | undefined {
  return detectors.find((d) => d.type === type);
}
