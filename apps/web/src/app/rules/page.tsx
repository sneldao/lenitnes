'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Monitor, type Rule } from '@/lib/api';
import {
  Workflow,
  Eye,
  Zap,
  Webhook,
  Mail,
  MessageCircle,
  Clock,
  Play,
  Check,
  X,
  Plus,
  AlertTriangle,
} from 'lucide-react';

const ACTION_META: Record<string, { icon: typeof Zap; label: string; color: string }> = {
  trade: { icon: Zap, label: 'Kraken Trade', color: 'text-warn' },
  webhook: { icon: Webhook, label: 'Webhook', color: 'text-accent' },
  telegram: { icon: MessageCircle, label: 'Telegram', color: 'text-cyan-400' },
  email: { icon: Mail, label: 'Email', color: 'text-signal' },
};

// Simple dropdown-based Rules builder (V1).
export default function RulesPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    monitorId: '',
    actionType: 'webhook' as 'trade' | 'webhook' | 'email' | 'telegram',
    config: '',
    fromHour: '',
    toHour: '',
  });
  const [testingTrade, setTestingTrade] = useState(false);
  const [paperTradeResult, setPaperTradeResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const { data: monitors = [], isLoading: monitorsLoading } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => api.listMonitors(),
  });
  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: () => api.listRules(),
  });
  const { data: krakenStatus } = useQuery({
    queryKey: ['krakenStatus'],
    queryFn: () => api.krakenStatus(),
    retry: 1,
  });

  const createRule = useMutation({
    mutationFn: api.createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setForm((f) => ({ ...f, config: '' }));
    },
  });

  async function runPaperTrade() {
    setTestingTrade(true);
    setPaperTradeResult(null);
    try {
      const res = await api.krakenTestTrade({ pair: 'XBTUSD', type: 'buy', volume: '0.0001' });
      setPaperTradeResult({
        ok: true,
        message: `Paper trade OK. Order ID: ${res.krakenOrderId ?? 'n/a'}`,
      });
    } catch (e) {
      setPaperTradeResult({ ok: false, message: String(e) });
    } finally {
      setTestingTrade(false);
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
        actionConfig: form.config ? JSON.parse(form.config) : {},
        conditions,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const placeholder: Record<string, string> = {
    trade: '{"pair":"XBTUSD","type":"buy","ordertype":"market","volume":"0.001","validate":true}',
    webhook: '{"url":"https://example.com/hook"}',
    telegram: '{"chatId":"123456789"}',
    email: '{"to":"you@example.com"}',
  };

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
          <button onClick={runPaperTrade} disabled={testingTrade} className="btn text-xs">
            {testingTrade ? (
              <span className="animate-pulse">Testing…</span>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Paper Trade
              </>
            )}
          </button>
        </div>
      </div>

      {paperTradeResult && (
        <div
          className={`card ${paperTradeResult.ok ? 'border-signal/30 bg-signal/5' : 'border-danger/30 bg-danger/5'}`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${paperTradeResult.ok ? 'bg-signal/20' : 'bg-danger/20'}`}
            >
              {paperTradeResult.ok ? (
                <Check className="h-4 w-4 text-signal" />
              ) : (
                <X className="h-4 w-4 text-danger" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                {paperTradeResult.ok ? 'Paper trade succeeded' : 'Paper trade failed'}
              </p>
              <p className="text-xs text-slate-500">{paperTradeResult.message}</p>
            </div>
          </div>
        </div>
      )}

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

        <div>
          <label className="label">
            <Workflow className="mr-1 inline h-3 w-3" />
            Config (JSON)
          </label>
          <textarea
            className="input min-h-[80px] font-mono text-xs"
            placeholder={placeholder[form.actionType]}
            value={form.config}
            onChange={(e) => setForm((f) => ({ ...f, config: e.target.value }))}
          />
        </div>

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
            </div>
          );
        })}
      </div>
    </div>
  );
}
