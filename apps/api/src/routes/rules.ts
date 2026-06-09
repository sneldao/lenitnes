import { Router, type Request, type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Rule } from '@lenitnes/types';
import { createRuleSchema } from '../validation/index.js';
import { validate } from '../middleware/validate.js';
import {
  createRule as createRuleSvc,
  listRules as listRulesSvc,
} from '../services/domain/rule.service.js';

export const rulesRouter = Router();

// POST /rules — connect a monitor to an action.
rulesRouter.post('/', validate(createRuleSchema), async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const b = req.body as {
    monitorId: string;
    actionType: 'trade' | 'webhook' | 'email' | 'telegram';
    actionConfig: Record<string, unknown>;
    conditions: Record<string, unknown>;
    isActive: boolean;
  };

  const rule = await createRuleSvc(authReq.user.id, b);
  if (!rule) return res.status(404).json({ error: 'monitor not found' });
  res.status(201).json(rule);
});

// GET /rules?monitorId=...  (own monitors only)
rulesRouter.get('/', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const monitorId = req.query.monitorId ? String(req.query.monitorId) : undefined;
  const rules: Rule[] = await listRulesSvc(authReq.user.id, monitorId);
  res.json(rules);
});
