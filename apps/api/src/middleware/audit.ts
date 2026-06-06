import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool.js';

interface AuditLogEntry {
  id: string;
  user_id: string | null;
  wallet_address: string | null;
  method: string;
  path: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  meta: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function extractResource(path: string): { type: string | null; id: string | null } {
  const segments = path.replace(/^\//, '').split('/');
  if (segments.length >= 2) {
    // e.g. /monitors/abc-123 → type=monitors, id=abc-123
    return { type: segments[0], id: segments[1] };
  }
  if (segments.length === 1) {
    return { type: segments[0], id: null };
  }
  return { type: null, id: null };
}

export async function logAudit(entry: Omit<AuditLogEntry, 'id' | 'created_at'>): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, wallet_address, method, path, action, resource_type, resource_id, meta, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        entry.user_id,
        entry.wallet_address,
        entry.method,
        entry.path,
        entry.action,
        entry.resource_type,
        entry.resource_id,
        entry.meta ? JSON.stringify(entry.meta) : null,
        entry.ip_address,
        entry.user_agent,
      ],
    );
  } catch (e) {
    // Never fail the request because of audit logging.
    console.error('[audit] failed to persist audit log:', e);
  }
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) {
    next();
    return;
  }

  const user = (req as unknown as { user?: { id: string; wallet_address: string } }).user;
  const resource = extractResource(req.path);

  // Defer logging until after the response is sent so we know the status.
  res.on('finish', () => {
    const meta: Record<string, unknown> = { statusCode: res.statusCode };
    if (res.statusCode >= 400) {
      meta.error = true;
    }

    const entry: Omit<AuditLogEntry, 'id' | 'created_at'> = {
      user_id: user?.id ?? null,
      wallet_address: user?.wallet_address ?? null,
      method: req.method,
      path: req.path,
      action: `${req.method} ${resource.type ?? 'unknown'}`,
      resource_type: resource.type,
      resource_id: resource.id,
      meta,
      ip_address: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
    };

    // Structured JSON log for container log aggregation (Azure Log Analytics, Datadog, etc.)
    console.log(JSON.stringify({ level: 'AUDIT', ...entry }));

    // Async DB persist — fire and forget.
    logAudit(entry).catch(() => {});
  });

  next();
}
