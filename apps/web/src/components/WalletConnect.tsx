'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { LogOut, Copy, Check, ChevronDown, Wallet } from 'lucide-react';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  projectIdMissing: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  executeWithPayment: (url: string, init?: RequestInit) => Promise<Response>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connector, setConnector] = useState<
    import('@hashgraph/hedera-wallet-connect').DAppConnector | null
  >(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [projectIdMissing, setProjectIdMissing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
      if (!projectId) {
        setProjectIdMissing(true);
        return;
      }

      const { LedgerId } = await import('@hashgraph/sdk');
      const { DAppConnector } = await import('@hashgraph/hedera-wallet-connect');

      const network = (process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? 'testnet').toLowerCase();
      const ledger = LedgerId.fromString(network);

      const dc = new DAppConnector(
        {
          name: 'LENITNES',
          description: 'Proof-chained signal monitoring',
          icons: [],
          url: typeof window !== 'undefined' ? window.location.origin : '',
        },
        ledger,
        projectId,
      );
      await dc.init({ logger: 'error' });
      if (!mounted) return;
      setConnector(dc);

      if (dc.signers.length > 0) {
        const signer = dc.signers[0];
        const addr = signer.getAccountId().toString();
        setAccountId(addr);
        try {
          const message = `lenitnes:auth:${Date.now()}`;
          const sigs = await signer.sign([new TextEncoder().encode(message)]);
          if (sigs && sigs.length > 0) {
            const pk = sigs[0].publicKey.toStringRaw();
            const sig = bytesToHex(sigs[0].signature);
            await api.login({
              walletAddress: addr,
              publicKey: pk,
              message,
              signature: sig,
            });
            window.dispatchEvent(new Event('auth-changed'));
          }
        } catch {
          // auto-login failed — user can still use the app unauthenticated
        }
      }

      dc.walletConnectClient?.on('session_delete', () => {
        setAccountId(null);
        api.logout().catch(() => {});
        window.dispatchEvent(new Event('auth-changed'));
      });
    };
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const connect = async () => {
    if (!connector) return;
    setIsLoading(true);
    try {
      await connector.openModal();

      if (connector.signers.length > 0) {
        const signer = connector.signers[0];
        const addr = signer.getAccountId().toString();
        setAccountId(addr);

        try {
          const message = `lenitnes:auth:${Date.now()}`;
          const sigs = await signer.sign([new TextEncoder().encode(message)]);
          if (sigs && sigs.length > 0) {
            const pk = sigs[0].publicKey.toStringRaw();
            const sig = bytesToHex(sigs[0].signature);
            await api.login({
              walletAddress: addr,
              publicKey: pk,
              message,
              signature: sig,
            });
            window.dispatchEvent(new Event('auth-changed'));
          }
        } catch {
          // auto-login failed
        }
      }
    } catch {
      // User rejected or modal error
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    if (connector) {
      try {
        await connector.disconnectAll();
      } catch {
        // session may already be disconnected
      }
      setAccountId(null);
      api.logout().catch(() => {});
      window.dispatchEvent(new Event('auth-changed'));
    }
  };

  const executeWithPayment = async (url: string, init?: RequestInit) => {
    if (!connector || !accountId) {
      throw new Error('Wallet not connected');
    }

    const { AccountId, TransferTransaction, Hbar } = await import('@hashgraph/sdk');
    const { wrapFetchWithPayment, x402Client } = await import('@x402/fetch');
    const { ExactHederaScheme } = await import('@x402/hedera/exact/client');

    const signer = connector.getSigner(AccountId.fromString(accountId));

    const wcSigner = {
      accountId,
      async createPartiallySignedTransferTransaction(requirements: any) {
        const { amount, payTo } = requirements;
        const tinybars = Number(amount);
        const tx = new TransferTransaction()
          .addHbarTransfer(AccountId.fromString(accountId), Hbar.fromTinybars(-tinybars))
          .addHbarTransfer(AccountId.fromString(payTo), Hbar.fromTinybars(tinybars));

        const signed = await signer.signTransaction(tx);
        const bytes = signed.toBytes();
        return Buffer.from(bytes).toString('base64');
      },
    };

    const client = new x402Client();
    client.register('hedera:testnet', new ExactHederaScheme(wcSigner));

    const fetchWithPay = wrapFetchWithPayment(fetch, client);
    return fetchWithPay(url, init);
  };

  return (
    <WalletContext.Provider
      value={{
        accountId,
        isConnected: !!accountId,
        isLoading,
        projectIdMissing,
        connect,
        disconnect,
        executeWithPayment,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function WalletConnectButton() {
  const { isConnected, accountId, connect, disconnect, projectIdMissing } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleConnect() {
    await connect();
  }

  async function handleCopy() {
    if (!accountId) return;
    await navigator.clipboard.writeText(accountId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleDisconnect() {
    setOpen(false);
    await disconnect();
  }

  if (isConnected) {
    return (
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={`Wallet menu for ${accountId ?? ''}`}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-xl border border-signal/20 bg-signal/5 px-3 py-2 text-xs font-medium text-signal transition-all hover:border-signal/40 hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
          <span className="font-mono">
            {accountId?.slice(0, 8)}…{accountId?.slice(-4)}
          </span>
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-edge/60 bg-panel/95 p-2 shadow-card backdrop-blur-md animate-fade-in z-50">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal/10">
                <Wallet className="h-4 w-4 text-signal" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-200">Connected</p>
                <p className="truncate font-mono text-[10px] text-slate-500">{accountId}</p>
              </div>
            </div>
            <div className="my-1 h-px bg-edge/40" />
            <button
              onClick={handleCopy}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-ink-light/50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-signal" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
              {copied ? 'Copied!' : 'Copy address'}
            </button>
            <button
              onClick={handleDisconnect}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-danger transition-colors hover:bg-danger/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  if (projectIdMissing) {
    return (
      <span
        className="flex items-center gap-2 rounded-xl border border-edge bg-ink-light/50 px-3 py-2 text-xs font-medium text-slate-500 cursor-help"
        title="WalletConnect project ID not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env and rebuild."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
        Unavailable
      </span>
    );
  }

  return (
    <button
      onClick={handleConnect}
      aria-label="Connect Hedera wallet"
      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-signal px-4 py-2 text-xs font-bold text-ink shadow-glow-sm transition-all hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      Connect Wallet
    </button>
  );
}
