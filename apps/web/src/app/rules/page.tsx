'use client';

import { useEffect, useState } from 'react';
import { api, type Monitor } from '@/lib/api';

// Simple dropdown-based Rules builder (V1).
export default function RulesPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    monitorId: '',
    actionType: 'webhook' as 'trade' | 'webhook' | 'email' | 'telegram',
    config: '',
    fromHour: '',
    toHour: '',
  });
  const [krakenStatus, setKrakenStatus] = useState<{
    configured: boolean;
    cliAvailable: boolean;
  } | null>(null);
  const [testingTrade, setTestingTrade] = useState(false);
  const [paperTradeResult, setPaperTradeResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  function load() {
    api
      .listMonitors()
      .then(setMonitors)
      .catch((e) => setError(String(e)));
    api
      .listRules()
      .then(setRules)
      .catch(() => {});
    api
      .krakenStatus()
      .then(setKrakenStatus)
      .catch(() => setKrakenStatus(null));
  }
  useEffect(load, []);

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
      await api.createRule({
        monitorId: form.monitorId,
        actionType: form.actionType,
        actionConfig: form.config ? JSON.parse(form.config) : {},
        conditions,
      });
      setForm((f) => ({ ...f, config: '' }));
      load();
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rules</h1>
          <p className="text-sm text-slate-400">Connect a monitor's signal to an action.</p>
        </div>
        <div className="flex items-center gap-3">
          {krakenStatus && (
            <span
              className={`badge text-[10px] ${
                krakenStatus.configured ? 'bg-signal/15 text-signal' : 'bg-danger/15 text-danger'
              }`}
            >
              {krakenStatus.configured ? 'Kraken ready' : 'Kraken keys missing'}
            </span>
          )}
          <button onClick={runPaperTrade} disabled={testingTrade} className="btn text-xs">
            {testingTrade ? 'Testing…' : 'Paper Trade'}
          </button>
        </div>
      </div>

      {paperTradeResult && (
        <div className={`card ${paperTradeResult.ok ? 'border-signal/40' : 'border-danger/40'}`}>
          <p className="text-sm font-semibold">
            {paperTradeResult.ok ? 'Paper trade succeeded' : 'Paper trade failed'}
          </p>
          <p className="text-xs text-slate-500">{paperTradeResult.message}</p>
        </div>
      )}

      <div className="card space-y-4">
        <div>
          <label className="label">Monitor</label>
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
          <label className="label">Action</label>
          <select
            className="input"
            value={form.actionType}
            onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as any }))}
          >
            <option value="trade">Kraken trade</option>
            <option value="webhook">Webhook</option>
            <option value="telegram">Telegram</option>
            <option value="email">Email</option>
          </select>
        </div>

        <div>
          <label className="label">Action config (JSON)</label>
          <textarea
            className="input min-h-[80px] font-mono text-xs"
            placeholder={placeholder[form.actionType]}
            value={form.config}
            onChange={(e) => setForm((f) => ({ ...f, config: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Only after (UTC hour)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={23}
              value={form.fromHour}
              onChange={(e) => setForm((f) => ({ ...f, fromHour: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Only before (UTC hour)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={24}
              value={form.toHour}
              onChange={(e) => setForm((f) => ({ ...f, toHour: e.target.value }))}
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn" disabled={!form.monitorId || saving} onClick={save}>
          {saving ? 'Saving…' : 'Create rule'}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Existing rules
        </h2>
        {rules.length === 0 && <p className="text-sm text-slate-500">No rules yet.</p>}
        {rules.map((r) => (
          <div key={r.id} className="card flex items-center justify-between">
            <span className="text-sm">{r.action_type}</span>
            <span className="badge bg-slate-500/15 text-slate-400">
              {r.is_active ? 'active' : 'off'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
