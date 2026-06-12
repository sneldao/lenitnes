import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
process.env.JWT_SECRET ??= 'test-jwt-secret-must-be-long-enough';
process.env.WEBHOOK_SECRET ??= 'test-webhook-secret';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const mockPing = vi.fn<() => Promise<string>>();
const mockConnect = vi.fn<() => Promise<void>>();
const mockQuit = vi.fn<() => Promise<void>>();

vi.mock('redis', () => ({
  createClient: () => ({
    on: vi.fn(),
    connect: mockConnect,
    ping: mockPing,
    quit: mockQuit,
  }),
}));

const { pingRedis } = await import('../src/queue/connection.js');

describe('pingRedis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when PING responds with PONG', async () => {
    mockConnect.mockResolvedValue();
    mockPing.mockResolvedValue('PONG');
    mockQuit.mockResolvedValue();

    expect(await pingRedis()).toBe(true);
    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockPing).toHaveBeenCalledOnce();
    expect(mockQuit).toHaveBeenCalledOnce();
  });

  it('returns false when connect fails', async () => {
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));
    mockQuit.mockResolvedValue();

    expect(await pingRedis()).toBe(false);
  });

  it('returns false when PING times out', async () => {
    mockConnect.mockResolvedValue();
    mockPing.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 5000)),
    );
    mockQuit.mockResolvedValue();

    expect(await pingRedis(50)).toBe(false);
    expect(mockQuit).toHaveBeenCalledOnce();
  });

  it('returns false when PING returns non-PONG response', async () => {
    mockConnect.mockResolvedValue();
    mockPing.mockResolvedValue('NOAUTH');
    mockQuit.mockResolvedValue();

    expect(await pingRedis()).toBe(false);
  });

  it('always calls quit even on failure', async () => {
    mockConnect.mockRejectedValue(new Error('boom'));
    mockQuit.mockResolvedValue();

    await pingRedis();
    expect(mockQuit).toHaveBeenCalledOnce();
  });
});
