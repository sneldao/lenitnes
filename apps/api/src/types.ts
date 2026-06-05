// Re-export shared domain types.
export type {
  Monitor,
  MonitorStatus,
  Signal,
  SignalDetail,
  Rule,
  ActionType,
  Order,
  OrderStatus,
  User,
  CreateMonitorInput,
  UpdateMonitorInput,
  CreateRuleInput,
  ApiError,
  ApiOk,
  HealthStatus,
} from '@lenitnes/types';

// API-only: TinyFish result is produced by the API service layer.
export type { TinyFishResult } from '@lenitnes/types';
