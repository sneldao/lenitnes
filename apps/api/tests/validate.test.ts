import { describe, it, expect } from 'vitest';
import { createMonitorSchema, patchMonitorSchema } from '../src/validation/monitor.schema.js';
import { createRuleSchema, tradeConfigSchema } from '../src/validation/rule.schema.js';

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
      url: 'https://example.com',
      conditionText: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects conditions over 500 chars', () => {
    const result = createMonitorSchema.safeParse({
      url: 'https://example.com',
      conditionText: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('patchMonitorSchema', () => {
  it('accepts empty patch (no fields)', () => {
    expect(patchMonitorSchema.safeParse({}).success).toBe(true);
  });

  it('accepts topUpHbar', () => {
    expect(patchMonitorSchema.safeParse({ topUpHbar: 10 }).success).toBe(true);
  });

  it('rejects negative top-up', () => {
    expect(patchMonitorSchema.safeParse({ topUpHbar: -5 }).success).toBe(false);
  });
});

describe('createRuleSchema', () => {
  it('requires a valid uuid for monitorId', () => {
    expect(
      createRuleSchema.safeParse({
        monitorId: 'not-a-uuid',
        actionType: 'webhook',
      }).success,
    ).toBe(false);
  });

  it('accepts a webhook rule', () => {
    const result = createRuleSchema.safeParse({
      monitorId: '550e8400-e29b-41d4-a716-446655440000',
      actionType: 'webhook',
      actionConfig: { url: 'https://example.com/hook' },
    });
    expect(result.success).toBe(true);
  });
});

describe('tradeConfigSchema', () => {
  it('accepts a market buy', () => {
    const result = tradeConfigSchema.safeParse({
      pair: 'XBTUSD',
      type: 'buy',
      ordertype: 'market',
      volume: '0.001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown ordertype', () => {
    const result = tradeConfigSchema.safeParse({
      pair: 'XBTUSD',
      type: 'buy',
      ordertype: 'pizza',
      volume: '0.001',
    });
    expect(result.success).toBe(false);
  });
});
