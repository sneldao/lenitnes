import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock pg BEFORE any module that imports it. Factory bodies cannot reference
// top-level variables, so the mock client and Pool are inlined.
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return {
    default: {
      Pool: class {
        connect = vi.fn().mockResolvedValue(mockClient);
        query = vi.fn();
        end = vi.fn();
      },
      types: { setTypeParser: vi.fn() },
    },
  };
});

import { withTransaction } from '../src/db/pool.js';
import pg from 'pg';

const mockPool = new (
  pg as unknown as {
    Pool: new () => {
      connect: () => Promise<{
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
      }>;
    };
  }
).Pool();
const mockClient = await mockPool.connect();

describe('withTransaction', () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('commits on success', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: '1' }] }); // user query
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>('SELECT 1');
      return rows[0]?.id;
    });

    expect(result).toBe('1');
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back on error', async () => {
    mockClient.query.mockReset();
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(
      withTransaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('releases the client even when rollback fails', async () => {
    mockClient.query.mockReset();
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockRejectedValueOnce(new Error('connection broken')); // ROLLBACK fails

    await expect(
      withTransaction(async () => {
        throw new Error('original');
      }),
    ).rejects.toThrow('original');

    expect(mockClient.release).toHaveBeenCalled();
  });
});
