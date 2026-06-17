import { describe, it, expect } from 'vitest';
import { createMonitorSchema, patchMonitorSchema } from '../src/validation/monitor.schema.js';

describe('createMonitorSchema', () => {
  it('accepts a valid monitor', () => {
    const result = createMonitorSchema.safeParse({
      url: 'https://github.com/owner/repo',
      conditionText: 'A new commit mentions security',
      frequencySeconds: 3600,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-http URLs', () => {
    const result = createMonitorSchema.safeParse({
      url: 'ftp://example.com',
      conditionText: 'something',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty conditions', () => {
    const result = createMonitorSchema.safeParse({
      url: 'https://github.com/owner/repo',
      conditionText: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects conditions over 500 chars', () => {
    const result = createMonitorSchema.safeParse({
      url: 'https://github.com/owner/repo',
      conditionText: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('patchMonitorSchema', () => {
  it('accepts empty patch (no fields)', () => {
    expect(patchMonitorSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a frequencySeconds patch', () => {
    expect(patchMonitorSchema.safeParse({ frequencySeconds: 7200 }).success).toBe(true);
  });

  it('accepts a status patch', () => {
    expect(patchMonitorSchema.safeParse({ status: 'paused' }).success).toBe(true);
  });
});
