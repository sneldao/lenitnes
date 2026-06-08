'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { Shield, Key, Eye, EyeOff, Check, X, AlertTriangle, Loader } from 'lucide-react';

export default function AccountPage() {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: krakenStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['krakenStatus'],
    queryFn: () => api.krakenStatus(),
    enabled: isAuthenticated,
  });

  async function handleSave() {
    if (!apiKey || !apiSecret) return;
    setSaving(true);
    setError(null);
    try {
      await api.krakenConfigure({ apiKey, apiSecret });
      toast.success('Kraken API keys saved');
      setApiKey('');
      setApiSecret('');
      queryClient.invalidateQueries({ queryKey: ['krakenStatus'] });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteKeys() {
    if (!confirm('Remove your Kraken API keys? They will be permanently deleted.')) return;
    try {
      await api.krakenDeleteConfigure();
      toast.success('Kraken API keys removed');
      setApiKey('');
      setApiSecret('');
      queryClient.invalidateQueries({ queryKey: ['krakenStatus'] });
    } catch (e) {
      setError(String(e));
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="text-sm text-slate-500">Connect your wallet to manage settings.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your Kraken API keys and account settings
        </p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 border-b border-edge/40 pb-4">
          <Key className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-slate-200">Kraken API Keys</h2>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-ink-light/60 px-4 py-3">
          <Shield className="h-4 w-4 text-slate-500" />
          <p className="text-xs text-slate-400">
            Keys are encrypted at rest using AES-256-GCM and used only for executing trades you
            configure via Rules. Test with a paper trade before enabling real trading.
          </p>
        </div>

        {statusLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader className="h-4 w-4 animate-spin" />
            Checking key status…
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ${
                krakenStatus?.configured
                  ? 'bg-signal/15 text-signal'
                  : 'bg-slate-500/15 text-slate-400'
              }`}
            >
              {krakenStatus?.configured ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              {krakenStatus?.configured ? 'Keys configured' : 'No keys configured'}
            </div>
          </div>
        )}

        <div>
          <label className="label">API Key</label>
          <input
            className="input font-mono text-xs"
            type="text"
            placeholder="Enter your Kraken API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="label">API Secret</label>
          <div className="relative">
            <input
              className="input pr-10 font-mono text-xs"
              type={showSecret ? 'text' : 'password'}
              placeholder="Enter your Kraken API secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            className="btn flex-1"
            disabled={!apiKey || !apiSecret || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save Keys'}
          </button>
          {krakenStatus?.configured && (
            <button className="btn-danger" onClick={handleDeleteKeys}>
              Remove Keys
            </button>
          )}
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="section-title flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" />
          Wallet
        </h2>
        <div className="space-y-2 text-sm text-slate-400">
          <div className="flex justify-between">
            <span>Wallet address</span>
            <span className="font-mono text-xs text-slate-300">{user?.wallet_address ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>User ID</span>
            <span className="font-mono text-xs text-slate-300">{user?.id ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-ink-light/40 p-4 text-xs text-slate-500 leading-relaxed">
        <p className="font-semibold text-slate-400 mb-1">About Kraken API Keys</p>
        <p>
          Create a Kraken API key with <strong className="text-slate-300">Query funds</strong> and{' '}
          <strong className="text-slate-300">Create & cancel orders</strong> permissions at{' '}
          <a
            href="https://kraken.com/settings/api"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            kraken.com/settings/api
          </a>
          . Use a key with <strong className="text-slate-300">no withdrawal</strong> permissions for
          safety. Always test with a paper trade first.
        </p>
      </div>
    </div>
  );
}
