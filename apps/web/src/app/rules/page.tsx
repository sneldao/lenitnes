'use client';

import { useRef, useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

type TemplateId = 'trade' | 'webhook' | 'telegram' | 'email';

interface ActionTemplate {
  id: TemplateId;
  title: string;
  desc: string;
  icon: typeof Zap;
  color: string;
  bg: string;
  defaultConfig: Record<string, unknown>;
}

const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    id: 'trade',
    title: 'Kraken Trade',
    desc: 'Auto-execute on Kraken when a signal triggers',
    icon: Zap,
    color: 'text-warn',
    bg: 'bg-warn/10',
    defaultConfig: { validate: true, type: 'buy', ordertype: 'market', volume: '0.001' },
  },
  {
    id: 'webhook',
    title: 'Webhook',
    desc: 'POST signal data to any HTTP endpoint',
    icon: Webhook,
    color: 'text-accent',
    bg: 'bg-accent/10',
    defaultConfig: { url: '' },
  },
  {
    id: 'telegram',
    title: 'Telegram',
    desc: 'Send instant alerts to a Telegram chat',
    icon: MessageCircle,
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    defaultConfig: { chatId: '' },
  },
  {
    id: 'email',
    title: 'Email',
    desc: 'Deliver signal summaries to any inbox',
    icon: Mail,
    color: 'text-signal',
    bg: 'bg-signal/10',
    defaultConfig: { to: '' },
  },
];

const ACTION_META: Record<TemplateId, { icon: typeof Zap; label: string; color: string }> = {
  trade: { icon: Zap, label: 'Kraken Trade', color: 'text-warn' },
  webhook: { icon: Webhook, label: 'Webhook', color: 'text-accent' },
  telegram: { icon: MessageCircle, label: 'Telegram', color: 'text-cyan-400' },
  email: { icon: Mail, label: 'Email', color: 'text-signal' },
};

type Category = 'execution' | 'alerts';

const CATEGORY_META: Record<Category, { label: string; hint: string }> = {
  execution: { label: 'Execution', hint: 'Automated trading and order placement' },
  alerts: { label: 'Notifications', hint: 'Webhook, Telegram, and email channels' },
};

function getCategoryForTemplate(id: TemplateId): Category {
  return id === 'trade' ? 'execution' : 'alerts';
}

const POPULAR_TEMPLATE_ID: TemplateId = 'trade';

const SCRATCH_EXAMPLES = [
  'send webhook on every signal',
  'alert Telegram when match found',
  'buy XBTUSD 0.01 on detection',
];

export default function RulesPage() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<'choose' | 'template' | 'scratch'>('choose');
  const [activeCategory, setActiveCategory] = useState<Category>('execution');

  const [form, setForm] = useState({
    monitorId: '',
    actionType: 'webhook' as TemplateId,
    config: {} as Record<string, unknown>,
    fromHour: '',
    toHour: '',
  });

  const configFocusRef = useRef<HTMLInputElement | null>(null);

  const setConfig = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  };

  const { data: monitors = [] } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => api.listMonitors(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  const { data: rules = [] } = useQuery({
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

  const [fundMonitorId, setFundMonitorId] = useState('');
  const [fundAmount, setFundAmount] = useState(10);
  const [funding, setFunding] = useState(false);

  const createRule = useMutation({
    mutationFn: api.createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setForm((f) => ({ ...f, config: {} }));
      setMode('choose');
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

  function validate(): string | null {
    if (!form.monitorId) return 'Select a monitor to attach this rule to.';
    const cfg = form.config;
    switch (form.actionType) {
      case 'trade':
        if (!(cfg.pair as string)?.trim()) return 'Enter a trading pair (e.g. XBTUSD).';
        if (!(cfg.volume as string)?.trim()) return 'Enter a trade volume.';
        break;
      case 'webhook':
        if (!(cfg.url as string)?.trim()) return 'Enter a webhook URL.';
        break;
      case 'telegram':
        if (!(cfg.chatId as string)?.trim()) return 'Enter a Telegram chat ID.';
        break;
      case 'email':
        if (!(cfg.to as string)?.trim()) return 'Enter a recipient email.';
        break;
    }
    return null;
  }

  async function save() {
    setSaving(true);
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }
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

  function selectTemplate(t: ActionTemplate) {
    setError(null);
    setForm((f) => ({
      ...f,
      actionType: t.id,
      config: { ...t.defaultConfig },
    }));
    setMode('template');
  }

  function goBackToChoose() {
    setMode('choose');
    setError(null);
  }

  function startScratch() {
    setError(null);
    setForm((f) => ({
      ...f,
      actionType: 'webhook',
      config: { url: '' },
    }));
    setMode('scratch');
  }

  function renderConfigFields() {
    const isTrade = form.actionType === 'trade';
    const isWebhook = form.actionType === 'webhook';
    const isTelegram = form.actionType === 'telegram';
    const isEmail = form.actionType === 'email';

    return (
      <div className="space-y-3">
        {isTrade && (
          <>
            <label className="label">
              <Workflow className="mr-1 inline h-3 w-3" />
              Trade Config
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500">Pair</label>
                <input
                  ref={configFocusRef as React.Ref<HTMLInputElement>}
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
          </>
        )}

        {isWebhook && (
          <div>
            <label className="label">
              <Webhook className="mr-1 inline h-3 w-3" />
              Webhook URL
            </label>
            <input
              ref={configFocusRef as React.Ref<HTMLInputElement>}
              className="input font-mono text-xs"
              placeholder="https://example.com/hook"
              value={(form.config.url as string) ?? ''}
              onChange={(e) => setConfig('url', e.target.value)}
            />
          </div>
        )}

        {isTelegram && (
          <div>
            <label className="label">
              <MessageCircle className="mr-1 inline h-3 w-3" />
              Chat ID
            </label>
            <input
              ref={configFocusRef as React.Ref<HTMLInputElement>}
              className="input font-mono text-xs"
              placeholder="123456789"
              value={(form.config.chatId as string) ?? ''}
              onChange={(e) => setConfig('chatId', e.target.value)}
            />
          </div>
        )}

        {isEmail && (
          <div>
            <label className="label">
              <Mail className="mr-1 inline h-3 w-3" />
              Recipient Email
            </label>
            <input
              ref={configFocusRef as React.Ref<HTMLInputElement>}
              className="input"
              type="email"
              placeholder="you@example.com"
              value={(form.config.to as string) ?? ''}
              onChange={(e) => setConfig('to', e.target.value)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      {/* ── Header ── */}
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

      {/* ── Create Rule — template-first choose screen ── */}
      {mode === 'choose' && (
        <div className="card space-y-5">
          <div className="rounded-xl border border-accent/15 bg-accent/5 p-3">
            <p className="text-xs leading-relaxed text-slate-300">
              <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-accent" />
              <span className="font-semibold text-white">Most people start from a template</span>
              <span className="text-slate-400"> — every field stays editable.</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template category">
            {(Object.keys(CATEGORY_META) as Category[]).map((cat) => {
              const isActive = activeCategory === cat;
              const count = ACTION_TEMPLATES.filter(
                (t) => getCategoryForTemplate(t.id) === cat,
              ).length;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-edge/40 text-slate-400 hover:border-edge-light hover:text-slate-200'
                  }`}
                >
                  {CATEGORY_META[cat].label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                      isActive ? 'bg-accent/20 text-accent' : 'bg-edge/40 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="-mt-2 text-[11px] text-slate-500">{CATEGORY_META[activeCategory].hint}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {ACTION_TEMPLATES.filter((t) => getCategoryForTemplate(t.id) === activeCategory).map(
              (t) => {
                const popular = t.id === POPULAR_TEMPLATE_ID;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTemplate(t)}
                    className={`group relative cursor-pointer rounded-xl border p-3 text-left transition-all ${
                      popular
                        ? 'border-accent/30 bg-accent/5 hover:border-accent/50'
                        : 'border-edge/40 hover:border-accent/30'
                    }`}
                  >
                    {popular && (
                      <span className="absolute -top-1.5 right-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink shadow-glow-sm">
                        <Sparkles className="h-2.5 w-2.5" />
                        Popular
                      </span>
                    )}
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.bg}`}
                      >
                        <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-200 group-hover:text-white">
                          {t.title}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                          {t.desc}
                        </p>
                      </div>
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                    </div>
                  </button>
                );
              },
            )}
          </div>

          <button
            type="button"
            onClick={startScratch}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-edge-light bg-transparent p-3 text-left transition-all hover:border-accent/40 hover:bg-accent/5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-edge-light text-slate-500 group-hover:border-accent/40 group-hover:text-accent">
              <Plus className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 group-hover:text-white">
                Start from scratch
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                I&apos;ll choose the action type and configure everything manually
              </p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
          </button>
        </div>
      )}

      {/* ── Create Rule — edit mode (template or scratch) ── */}
      {(mode === 'template' || mode === 'scratch') && (
        <div className="card space-y-5">
          <button
            type="button"
            onClick={goBackToChoose}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-accent"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to templates
          </button>

          {/* Monitor select */}
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

          {/* Action type grid (scratch only) */}
          {mode === 'scratch' && (
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
                      onClick={() => {
                        setForm((f) => ({ ...f, actionType: t }));
                        setForm((f) => ({
                          ...f,
                          config: {},
                        }));
                      }}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                        isActive
                          ? 'border-accent/40 bg-accent/5 shadow-glow-sm'
                          : 'border-edge/40 hover:border-edge-light'
                      }`}
                    >
                      <meta.icon
                        className={`h-4 w-4 ${isActive ? meta.color : 'text-slate-500'}`}
                      />
                      <span
                        className={`text-[10px] font-semibold ${
                          isActive ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action-specific config fields */}
          {renderConfigFields()}

          {/* Time window (optional) */}
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

          {/* Scratch example chips */}
          {mode === 'scratch' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Try:
              </span>
              {SCRATCH_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    const chip = ex;
                    if (chip.startsWith('buy ')) {
                      const parts = chip.replace('buy ', '').split(' ');
                      setForm((f) => ({
                        ...f,
                        actionType: 'trade',
                        config: {
                          ...f.config,
                          pair: parts[0],
                          volume: parts[1],
                          type: 'buy',
                          validate: true,
                        },
                      }));
                    } else if (chip.startsWith('send webhook')) {
                      setForm((f) => ({
                        ...f,
                        actionType: 'webhook',
                        config: { ...f.config, url: 'https://example.com/hook' },
                      }));
                    } else if (chip.startsWith('alert Telegram')) {
                      setForm((f) => ({
                        ...f,
                        actionType: 'telegram',
                        config: { ...f.config, chatId: '123456789' },
                      }));
                    }
                  }}
                  className="rounded-full border border-edge/40 bg-ink-light/40 px-2.5 py-1 text-[10px] text-slate-300 transition-all hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

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
      )}

      {/* ── Active Rules list ── */}
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
          const meta = ACTION_META[r.action_type as TemplateId] ?? ACTION_META.webhook;
          return (
            <div key={r.id} className="card flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-edge/40">
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

      {/* ── Fund Monitor ── */}
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-300">
          <Wallet className="h-3.5 w-3.5" />
          Fund Monitor
          <span className="ml-auto text-slate-600 transition-transform group-open:rotate-180">
            <ChevronRight className="h-3 w-3" />
          </span>
        </summary>
        <div className="mt-4 card space-y-4">
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
      </details>
    </div>
  );
}
