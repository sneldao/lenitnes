import type { ProofService } from './proof-interface.js';
import { hederaProofService } from './proof-hedera.js';
import { nullProofService } from './proof-null.js';
import { config } from '../config.js';

let _service: ProofService | null = null;

export function getProofService(): ProofService {
  if (_service) return _service;
  _service = config.proofMode === 'none' ? nullProofService : hederaProofService;
  return _service;
}
