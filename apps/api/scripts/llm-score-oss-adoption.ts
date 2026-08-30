#!/usr/bin/env node
/**
 * LLM-scored events: call Qwen3.8 for each unique commit message, score it
 * as strategic (1) or routine (0), and produce a run JSON with llmScore fields.
 *
 * Usage:
 *   GITHUB_TOKEN=xxx npx tsx scripts/llm-score-oss-adoption.ts \
 *     --input /tmp/oss-adoption-v4/oss-adoption-*.enriched.json \
 *     --out /tmp/oss-adoption-v4
 */
import fs from 'node:fs';
import path from 'node:path';

const HF_BASE =
  process.env.HF_QWEN_BASE_URL || process.env.HF_BASE || 'https://api.tokenrouter.com/v1';
const HF_MODEL = process.env.HF_QWEN_MODEL || process.env.HF_MODEL || 'qwen/qwen3.8-max-free';
const API_KEY = process.env.TOKENROUTER_API_KEY || '';
// TokenRouter fallback: OpenAI-compatible channel confirmed live when the
// free HF Qwen endpoint is paused. Set LLM_FALLBACK_* to override.
const FALLBACK_BASE = process.env.LLM_FALLBACK_BASE || 'https://api.tokenrouter.com/v1';
const FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL || 'openai/gpt-4o-mini';

interface Args {
  input: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let input = '';
  let out = '';
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--input' && value) input = value;
    else if (key === '--out' && value) out = value;
    else if (key === '--help') {
      console.log(
        'Usage: npx tsx scripts/llm-score-oss-adoption.ts --input <enriched.json> [--out <dir>]',
      );
      process.exit(0);
    }
  }
  if (!input) {
    console.error('Provide --input <enriched.json>');
    process.exit(1);
  }
  return { input, out: out || path.dirname(path.resolve(input)) };
}

/** Try the primary endpoint, then fall back to a confirmed live model. */
async function callLLM(prompt: string): Promise<{ score: number; rationale: string }> {
  // Primary: HF Qwen3.8 or TokenRouter default
  let res: Response | null = null;
  try {
    res = await fetch(`${HF_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 80,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    res = null; // primary timed out — fall through to fallback
  }

  // Fallback: TokenRouter with a confirmed-live model
  if (!res || !res.ok) {
    const body = JSON.stringify({
      model: FALLBACK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 80,
    });
    try {
      res = await fetch(`${FALLBACK_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body,
        signal: AbortSignal.timeout(15000),
      });
      // One retry with backoff
      if (!res.ok && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 2000));
        res = await fetch(`${FALLBACK_BASE}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body,
          signal: AbortSignal.timeout(15000),
        });
      }
    } catch {
      return { score: 0.5, rationale: 'fallback timeout' };
    }
  }

  if (!res || !res.ok) {
    console.log(`    [llm] fallback → ${res?.status ?? 'timeout'}`);
    return { score: 0.5, rationale: `llm error ${res?.status ?? 'timeout'}` };
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '';
  const m = content.match(/\{[^}]*\}/);
  if (!m) return { score: 0.5, rationale: 'unparseable' };
  try {
    const p = JSON.parse(m[0]) as { score?: number; rationale?: string };
    return {
      score: Math.max(0, Math.min(1, p.score ?? 0.5)),
      rationale: (p.rationale ?? 'llm').slice(0, 200),
    };
  } catch {
    return { score: 0.5, rationale: 'parse error' };
  }
}

async function scoreLLM(
  msg: string,
  sample: {
    repository: string;
    packageName: string;
    change: string;
    versionBefore: string | null;
    versionAfter: string | null;
  },
): Promise<{ score: number; rationale: string }> {
  const prompt = [
    'You are an analyst scoring OSS dependency changes for strategic importance.',
    'A dependency change is STRATEGIC if it represents a deliberate adoption decision:',
    '- Migrating to a new SDK, cloud provider, or platform',
    "- Adopting a new vendor's service",
    '- Replacing one vendor with another',
    "- Adding a new integration with a vendor's product",
    '- Deprecating a vendor in favor of a competitor',
    '',
    'A change is ROUTINE if it is:',
    '- Automated version bump (Renovate, Dependabot, bot)',
    '- Security patch or CVE fix',
    '- Chore, maintenance, or housekeeping',
    '- Version pin or lock',
    '- Minor/patch version update',
    '- Revert or rollback',
    '',
    'Respond with ONLY a JSON object: {"score": 0.0-1.0, "rationale": "..."}',
    '',
    `Repository: ${sample.repository}`,
    `Package: ${sample.packageName}`,
    `Change: ${sample.change}`,
    `Version: ${sample.versionBefore || '?'} → ${sample.versionAfter || '?'}`,
    `Commit message: ${msg.slice(0, 600)}`,
  ].join('\n');

  return callLLM(prompt);
}

async function main(): Promise<void> {
  const { input, out } = parseArgs(process.argv.slice(2));
  const run = JSON.parse(fs.readFileSync(input, 'utf8')) as {
    events: Array<Record<string, unknown>>;
    runManifest: Record<string, unknown>;
    qualityReport: unknown;
  };

  const mapped = run.events.filter((e) => e.companyTicker);
  console.log(`LLM scoring ${mapped.length} mapped events`);

  // Dedu by commit message
  const byMsg = new Map<
    string,
    { msg: string; events: Array<Record<string, unknown>>; sample: Record<string, unknown> }
  >();
  for (const e of mapped) {
    const msg = ((e.commitMessage as string) ?? '').trim().slice(0, 400) || 'no-message';
    if (!byMsg.has(msg)) byMsg.set(msg, { msg, events: [], sample: e });
    byMsg.get(msg)!.events.push(e);
  }
  const unique = [...byMsg.values()];
  console.log(`  dedup to ${unique.length} unique commit messages`);

  const results: Array<{ score: number; rationale: string }> = [];
  for (let i = 0; i < unique.length; i++) {
    const u = unique[i];
    const r = await scoreLLM(
      u.msg,
      u.sample as {
        repository: string;
        packageName: string;
        change: string;
        versionBefore: string | null;
        versionAfter: string | null;
      },
    );
    for (const e of u.events) {
      e.llmScore = r.score;
      e.llmRationale = r.rationale;
    }
    results.push(r);
    if ((i + 1) % 10 === 0 || i === unique.length - 1) {
      const mean = results.reduce((s, r) => s + r.score, 0) / results.length;
      console.log(`  ${i + 1}/${unique.length} | mean: ${mean.toFixed(3)}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const outFile = path.join(path.resolve(out), `llm-scored.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        runManifest: {
          ...run.runManifest,
          llmScoredAt: new Date().toISOString(),
          llmScoredCommits: unique.length,
          llmModel: HF_MODEL,
        },
        events: run.events,
        qualityReport: run.qualityReport,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`\n✓ written → ${outFile}`);

  const dist: Record<string, number> = {};
  for (const e of run.events.filter((e: Record<string, unknown>) => e.companyTicker)) {
    const s = Math.round((e.llmScore as number) * 10) / 10;
    dist[s] = (dist[s] || 0) + 1;
  }
  console.log('score distribution:');
  for (const k of Object.keys(dist).sort()) console.log(`  ${k} → ${dist[k]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
