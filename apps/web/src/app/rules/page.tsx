'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import {
  Workflow,
  Eye,
  Zap,
  Webhook,
  Mail,
  MessageCircle,
  Clock,
  Check,
  X,
  Plus,
  AlertTriangle,
  Wallet,
} from 'lucide-react';

const ACTION_META: Record<string, { icon: typeof Zap; label: string; color: string }> = {
  trade: { icon: Zap, label: 'Kraken Trade', color: 'text-warn' },
  webhook: { icon: Webhook, label: 'Webhook', color: 'text-accent' },
  telegram: { icon: MessageCircle, label: 'Telegram', color: 'text-cyan-400' },
  email: { icon: Mail, label: 'Email', color: 'text-signal' },
};

// Simple dropdown-based Rules builder (V1).
export default function RulesPage() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fundMonitorId, setFundMonitorId] = useState('');
  const [fundAmount, setFundAmount] = useState(10);
  const [funding, setFunding] = useState(false);

  const [form, setForm] = useState({
    monitorId: '',
    actionType: 'webhook' as 'trade' | 'webhook' | 'email' | 'telegram',
    config: {} as Record<string, unknown>,
    fromHour: '',
    toHour: '',
  });

  const setConfig = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  };
  const { data: monitors = [], isLoading: _monitorsLoading } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => api.listMonitors(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  const { data: rules = [], isLoading: _rulesLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: () => api.listRules(),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });
  const { data: krakenStatus } = useQuery({
    queryKey: ['krakenStatus'],
    queryFn: () => api.krakenStatus(),
    retry: 1,
    enabled: isAuthenticated,
  });

  const createRule = useMutation({
    mutationFn: api.createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setForm((f) => ({ ...f, config: {} }));
    },
  });

  async function deleteRule(ruleId: string) {
    if (!confirm('Delete this rule?')) return;
    try {
      await api.deleteRule(ruleId);
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    } catch (e) {
      setError(String(e));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const conditions =
        form.fromHour && form.toHour
          ? { utcHours: { from: Number(form.fromHour), to: Number(form.toHour) } }
          : {};
      await createRule.mutateAsync({
        monitorId: form.monitorId,
        actionType: form.actionType,
        actionConfig: form.config,
        conditions,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Rules</h1>
          <p className="mt-1 text-sm text-slate-500">
            Connect a signal detection to an automated action
          </p>
        </div>
        <div className="flex items-center gap-3">
          {krakenStatus && (
            <span
              className={`badge ${
                krakenStatus.configured ? 'bg-signal/15 text-signal' : 'bg-danger/15 text-danger'
              }`}
            >
              {krakenStatus.configured ? (
                <>
                  <Check className="h-3 w-3" /> Kraken ready
                </>
              ) : (
                <>
                  <X className="h-3 w-3" /> Keys missing
                </>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 border-b border-edge/40 pb-4">
          <Wallet className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-slate-200">Fund Monitor</h2>
        </div>
        <p className="text-xs text-slate-400">
          Pre-fund your monitor escrow so background checks run automatically without per-execute
          x402 payments.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Monitor</label>
            <select
              className="input"
              value={fundMonitorId}
              onChange={(e) => setFundMonitorId(e.target.value)}
            >
              <option value="">Select…</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.url.replace(/^https?:\/\//, '').slice(0, 30)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount (ℏ)</label>
            <input
              className="input"
              type="number"
              min={1}
              value={fundAmount}
              onChange={(e) => setFundAmount(Number(e.target.value))}
            />
          </div>
        </div>
        <button
          className="btn w-full"
          disabled={!fundMonitorId || fundAmount < 1 || funding}
          onClick={async () => {
            setFunding(true);
            try {
              await api.topUpMonitor(fundMonitorId, fundAmount);
              queryClient.invalidateQueries({ queryKey: ['monitors'] });
              setFundMonitorId('');
              setFundAmount(10);
            } catch (e) {
              setError(String(e));
            } finally {
              setFunding(false);
            }
          }}
        >
          {funding ? 'Funding…' : 'Add Funds'}
        </button>
      </div>

      <div className="card space-y-5">
        <div className="flex items-center gap-2 border-b border-edge/40 pb-4">
          <Plus className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-slate-200">Create Rule</h2>
        </div>

        <div>
          <label className="label">
            <Eye className="mr-1 inline h-3 w-3" />
            Monitor
          </label>
          <select
            className="input"
            value={form.monitorId}
            onChange={(e) => setForm((f) => ({ ...f, monitorId: e.target.value }))}
          >
            <option value="">Select a monitor…</option>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.url}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">
            <Zap className="mr-1 inline h-3 w-3" />
            Action
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['webhook', 'telegram', 'trade', 'email'] as const).map((t) => {
              const meta = ACTION_META[t];
              const isActive = form.actionType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, actionType: t }))}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                    isActive
                      ? 'border-accent/40 bg-accent/5 shadow-glow-sm'
                      : 'border-edge/40 hover:border-edge-light'
                  }`}
                >
                  <meta.icon className={`h-4 w-4 ${isActive ? meta.color : 'text-slate-500'}`} />
                  <span
                    className={`text-[10px] font-semibold ${isActive ? 'text-slate-200' : 'text-slate-500'}`}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {form.actionType === 'trade' && (
          <div className="space-y-3">
            <label className="label">
              <Workflow className="mr-1 inline h-3 w-3" />
              Trade Config
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500">Pair</label>
                <input
                  className="input mt-1 font-mono text-xs"
                  placeholder="XBTUSD"
                  value={(form.config.pair as string) ?? ''}
                  onChange={(e) => setConfig('pair', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Type</label>
                <select
                  className="input mt-1"
                  value={(form.config.type as string) ?? 'buy'}
                  onChange={(e) => setConfig('type', e.target.value)}
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Order Type</label>
                <select
                  className="input mt-1"
                  value={(form.config.ordertype as string) ?? 'market'}
                  onChange={(e) => setConfig('ordertype', e.target.value)}
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop-loss">Stop Loss</option>
                  <option value="take-profit">Take Profit</option>
                  <option value="stop-loss-limit">Stop Loss Limit</option>
                  <option value="take-profit-limit">Take Profit Limit</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Volume</label>
                <input
                  className="input mt-1 font-mono text-xs"
                  placeholder="0.001"
                  value={(form.config.volume as string) ?? ''}
                  onChange={(e) => setConfig('volume', e.target.value)}
                />
              </div>
              {(form.config.ordertype as string) &&
                (form.config.ordertype as string) !== 'market' && (
                  <div>
                    <label className="text-[10px] text-slate-500">
                      {(form.config.ordertype as string).includes('-') ? 'Trigger Price' : 'Price'}
                    </label>
                    <input
                      className="input mt-1 font-mono text-xs"
                      placeholder="0.00"
                      value={(form.config.price as string) ?? ''}
                      onChange={(e) => setConfig('price', e.target.value)}
                    />
                  </div>
                )}
              {['stop-loss-limit', 'take-profit-limit'].includes(
                form.config.ordertype as string,
              ) && (
                <div>
                  <label className="text-[10px] text-slate-500">Limit Price</label>
                  <input
                    className="input mt-1 font-mono text-xs"
                    placeholder="0.00"
                    value={(form.config.price2 as string) ?? ''}
                    onChange={(e) => setConfig('price2', e.target.value)}
                  />
                </div>
              )}
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded border-edge/40 bg-ink-light text-accent"
                checked={(form.config.validate as boolean) !== false}
                onChange={(e) => setConfig('validate', e.target.checked)}
              />
              <span className="text-xs text-slate-400">
                Paper trade — tests against live prices, no Kraken credentials required
              </span>
            </label>
          </div>
        )}

        {form.actionType === 'webhook' && (
          <div>
            <label className="label">
              <Webhook className="mr-1 inline h-3 w-3" />
              Webhook URL
            </label>
            <input
              className="input font-mono text-xs"
              placeholder="https://example.com/hook"
              value={(form.config.url as string) ?? ''}
              onChange={(e) => setConfig('url', e.target.value)}
            />
          </div>
        )}

        {form.actionType === 'telegram' && (
          <div>
            <label className="label">
              <MessageCircle className="mr-1 inline h-3 w-3" />
              Chat ID
            </label>
            <input
              className="input font-mono text-xs"
              placeholder="123456789"
              value={(form.config.chatId as string) ?? ''}
              onChange={(e) => setConfig('chatId', e.target.value)}
            />
          </div>
        )}

        {form.actionType === 'email' && (
          <div>
            <label className="label">
              <Mail className="mr-1 inline h-3 w-3" />
              Recipient Email
            </label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={(form.config.to as string) ?? ''}
              onChange={(e) => setConfig('to', e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label">
            <Clock className="mr-1 inline h-3 w-3" />
            Time window (optional)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <input
                className="input pr-16"
                type="number"
                min={0}
                max={23}
                placeholder="0"
                value={form.fromHour}
                onChange={(e) => setForm((f) => ({ ...f, fromHour: e.target.value }))}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-600">
                UTC from
              </span>
            </div>
            <div className="relative">
              <input
                className="input pr-16"
                type="number"
                min={0}
                max={24}
                placeholder="24"
                value={form.toHour}
                onChange={(e) => setForm((f) => ({ ...f, toHour: e.target.value }))}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-600">
                UTC to
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}
        <button className="btn w-full" disabled={!form.monitorId || saving} onClick={save}>
          {saving ? 'Saving…' : 'Create Rule'}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="section-title flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5" />
          Active Rules ({rules.length})
        </h2>
        {rules.length === 0 && (
          <div className="stat-card p-6 text-center">
            <p className="text-sm text-slate-500">No rules configured yet</p>
          </div>
        )}
        {rules.map((r) => {
          const meta = ACTION_META[r.action_type] ?? ACTION_META.webhook;
          return (
            <div key={r.id} className="card flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-edge/40`}>
                  <meta.icon className={`h-4 w-4 ${meta.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">{meta.label}</p>
                  <p className="text-[10px] text-slate-500">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`badge ${
                    r.is_active ? 'bg-signal/15 text-signal' : 'bg-slate-500/15 text-slate-500'
                  }`}
                >
                  {r.is_active ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" /> Active
                    </>
                  ) : (
                    'Disabled'
                  )}
                </span>
                <button
                  onClick={() => deleteRule(r.id)}
                  className="text-[10px] font-medium text-slate-500 transition-colors hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
