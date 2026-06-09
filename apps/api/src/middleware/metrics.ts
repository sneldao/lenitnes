// Lightweight Prometheus-compatible metrics for LENITNES.
// For production, swap this for the `prom-client` npm package.

interface Counter {
  value: number;
  labels: Record<string, string>;
}

interface Histogram {
  buckets: Map<number, number>;
  sum: number;
  count: number;
  labels: Record<string, string>;
}

const counters = new Map<string, Counter[]>();
const histograms = new Map<string, Histogram[]>();

function key(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

export function incCounter(name: string, labels: Record<string, string>, amount = 1): void {
  const list = counters.get(name) ?? [];
  const k = key(labels);
  const existing = list.find((c) => key(c.labels) === k);
  if (existing) {
    existing.value += amount;
  } else {
    list.push({ value: amount, labels });
  }
  counters.set(name, list);
}

export function observeHistogram(
  name: string,
  labels: Record<string, string>,
  valueMs: number,
): void {
  const list = histograms.get(name) ?? [];
  const k = key(labels);
  const existing = list.find((h) => key(h.labels) === k);
  if (existing) {
    existing.count++;
    existing.sum += valueMs;
    for (const [bucket] of existing.buckets) {
      if (valueMs <= bucket) existing.buckets.set(bucket, (existing.buckets.get(bucket) ?? 0) + 1);
    }
  } else {
    const buckets = new Map<number, number>([
      [50, 0],
      [100, 0],
      [250, 0],
      [500, 0],
      [1000, 0],
      [2500, 0],
      [5000, 0],
      [10000, 0],
    ]);
    for (const [bucket] of buckets) {
      if (valueMs <= bucket) buckets.set(bucket, 1);
    }
    list.push({ buckets, sum: valueMs, count: 1, labels });
  }
  histograms.set(name, list);
}

function renderCounter(name: string, help: string, list: Counter[]): string {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
  for (const c of list) {
    const labelStr = Object.entries(c.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    lines.push(`${name}{${labelStr}} ${c.value}`);
  }
  return lines.join('\n');
}

function renderHistogram(name: string, help: string, list: Histogram[]): string {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
  for (const h of list) {
    const labelStr = Object.entries(h.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    for (const [bucket, count] of h.buckets) {
      lines.push(`${name}_bucket{le="${bucket}",${labelStr}} ${count}`);
    }
    lines.push(`${name}_bucket{le="+Inf",${labelStr}} ${h.count}`);
    lines.push(`${name}_sum{${labelStr}} ${h.sum}`);
    lines.push(`${name}_count{${labelStr}} ${h.count}`);
  }
  return lines.join('\n');
}

export function renderMetrics(): string {
  const parts: string[] = [];

  const httpReqs = counters.get('http_requests_total') ?? [];
  if (httpReqs.length) {
    parts.push(renderCounter('http_requests_total', 'Total HTTP requests', httpReqs));
  }

  const httpErrors = counters.get('http_errors_total') ?? [];
  if (httpErrors.length) {
    parts.push(renderCounter('http_errors_total', 'Total HTTP error responses', httpErrors));
  }

  const httpDurations = histograms.get('http_request_duration_ms') ?? [];
  if (httpDurations.length) {
    parts.push(
      renderHistogram('http_request_duration_ms', 'HTTP request duration in ms', httpDurations),
    );
  }

  const tinyfishDurations = histograms.get('tinyfish_inference_duration_ms') ?? [];
  if (tinyfishDurations.length) {
    parts.push(
      renderHistogram(
        'tinyfish_inference_duration_ms',
        'TinyFish inference latency in ms',
        tinyfishDurations,
      ),
    );
  }

  const tinyfishErrors = counters.get('tinyfish_errors_total') ?? [];
  if (tinyfishErrors.length) {
    parts.push(
      renderCounter('tinyfish_errors_total', 'TinyFish inference failures', tinyfishErrors),
    );
  }

  const dlqTotal = counters.get('monitor_check_dlq_total') ?? [];
  if (dlqTotal.length) {
    parts.push(
      renderCounter('monitor_check_dlq_total', 'Monitor check jobs moved to the DLQ', dlqTotal),
    );
  }

  const checkFailures = counters.get('monitor_check_failures_total') ?? [];
  if (checkFailures.length) {
    parts.push(
      renderCounter(
        'monitor_check_failures_total',
        'Total monitor check job failures',
        checkFailures,
      ),
    );
  }

  return parts.join('\n\n');
}

// ── Express middleware ────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();

  res.on('finish', () => {
    const duration = performance.now() - start;
    const route = req.route?.path ?? req.path;
    const labels = { method: req.method, route, status: String(res.statusCode) };

    incCounter('http_requests_total', labels);
    observeHistogram('http_request_duration_ms', labels, duration);

    if (res.statusCode >= 400) {
      incCounter('http_errors_total', {
        method: req.method,
        route,
        status: String(res.statusCode),
      });
    }
  });

  next();
}
