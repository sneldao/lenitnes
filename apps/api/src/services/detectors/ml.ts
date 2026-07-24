import type { SignalClassification } from '@lenitnes/types';
import { config } from '../../config.js';
import type { DetectorInput, SignalDetector } from './types.js';

const REPO_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/.*)?$/i;

function parseRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(REPO_RE);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

async function callModel(input: DetectorInput): Promise<Record<string, unknown> | null> {
  if (!config.ml.enabled || !config.ml.modelUrl) return null;

  const repo = parseRepo(input.monitorUrl);
  const payload = {
    repo: repo ? `${repo.owner}/${repo.repo}` : undefined,
    monitor_url: input.monitorUrl,
    condition_text: input.monitorCondition,
    evidence: input.result.evidence,
    asset: config.ml.assetOverride,
  };

  try {
    const res = await fetch(`${config.ml.modelUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.ml.timeoutMs),
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const mlDetector: SignalDetector = {
  type: 'generic',
  label: 'ML Code Signal',
  description: 'Fine-tuned Qwen2.5-Coder model over commit evidence',

  async detect(input: DetectorInput): Promise<SignalClassification | null> {
    const output = await callModel(input);
    if (!output) return null;

    const labels = Array.isArray(output.detector_labels) ? output.detector_labels : [];
    const action = typeof output.recommended_action === 'string' ? output.recommended_action : 'none';
    const direction = typeof output.price_direction_24h === 'string' ? output.price_direction_24h : 'flat';
    const confidence = typeof output.confidence === 'number' ? output.confidence : 0;

    if (labels.length === 0 && confidence < 30) return null;

    return {
      type: 'generic',
      score: Math.min(100, Math.round(confidence)),
      confidence: Math.min(100, Math.round(confidence)),
      label: `ML: ${action} ${direction} (${labels.slice(0, 3).join(', ') || 'no label'})`,
      metadata: {
        source: 'ml_detector',
        model_url: config.ml.modelUrl,
        detector_labels: labels,
        recommended_action: action,
        price_direction_24h: direction,
        raw_output: output,
      },
    };
  },
};
