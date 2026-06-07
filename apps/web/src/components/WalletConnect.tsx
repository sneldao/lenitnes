'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { HashConnect } from 'hashconnect';
import { api } from '@/lib/api';
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Heavy wallet/crypto libraries (@hashgraph/sdk, hashconnect, @x402/*) are
// imported dynamically inside browser-only code paths. Importing them at module
// scope pulls Node's `crypto` into the server bundle and breaks Next's
// SSR/prerender pass. Dynamic import() keeps them out of the server graph.

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  pairingString: string | null;
  isLoading: boolean;
  projectIdMissing: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  executeWithPayment: (url: string, init?: RequestInit) => Promise<Response>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [hashconnect, setHashconnect] = useState<HashConnect | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pairingString, setPairingString] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [projectIdMissing, setProjectIdMissing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const projectId = process.env.NEXT_PUBLIC_HASHCONNECT_PROJECT_ID;
      if (!projectId) {
        setProjectIdMissing(true);
        return;
      }
      const { LedgerId, AccountId } = await import('@hashgraph/sdk');
      const { HashConnect } = await import('hashconnect');
      const network = (process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? 'testnet').toLowerCase();
      const ledger = LedgerId.fromString(network);
      const hc = new HashConnect(
        ledger,
        projectId,
        {
          name: 'LENITNES',
          description: 'Proof-chained signal monitoring',
          icons: [],
          url: typeof window !== 'undefined' ? window.location.origin : '',
        },
        false,
      );
      await hc.init();
      if (!mounted) return;
      setHashconnect(hc);
      setPairingString(hc.pairingString ?? null);

      const ids = hc.connectedAccountIds;
      if (ids.length > 0) {
        const addr = ids[0].toString();
        setAccountId(addr);
        try {
          const message = `lenitnes:auth:${Date.now()}`;
          const sigs = await hc.signMessages(AccountId.fromString(addr), message);
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

      hc.pairingEvent.on(async () => {
        const connected = hc.connectedAccountIds;
        if (connected.length > 0) {
          const addr = connected[0].toString();
          setAccountId(addr);

          try {
            const message = `lenitnes:auth:${Date.now()}`;
            const sigs = await hc.signMessages(AccountId.fromString(addr), message);
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
      });

      hc.disconnectionEvent.on(() => {
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
    if (!hashconnect) return;
    setIsLoading(true);
    try {
      await hashconnect.openPairingModal();
    } catch {
      if (hashconnect.pairingString) {
        await navigator.clipboard?.writeText(hashconnect.pairingString);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    if (hashconnect) {
      await hashconnect.disconnect();
      setAccountId(null);
      api.logout().catch(() => {});
      window.dispatchEvent(new Event('auth-changed'));
    }
  };

  const executeWithPayment = async (url: string, init?: RequestInit) => {
    if (!hashconnect || !accountId) {
      throw new Error('Wallet not connected');
    }

    const { AccountId, TransferTransaction, Hbar } = await import('@hashgraph/sdk');
    const { wrapFetchWithPayment, x402Client } = await import('@x402/fetch');
    const { ExactHederaScheme } = await import('@x402/hedera/exact/client');

    const signer = {
      accountId,
      async createPartiallySignedTransferTransaction(requirements: any) {
        const { amount, payTo } = requirements;
        const tinybars = Number(amount);
        const tx = new TransferTransaction()
          .addHbarTransfer(AccountId.fromString(accountId), Hbar.fromTinybars(-tinybars))
          .addHbarTransfer(AccountId.fromString(payTo), Hbar.fromTinybars(tinybars));

        // hashconnect bundles its own @hashgraph/sdk copy. Both are
        // structurally identical but resolve from different node_modules paths.
        const signed = await hashconnect.signAndReturnTransaction(
          AccountId.fromString(accountId),
          tx as unknown as import('@hashgraph/sdk').Transaction,
        );
        const bytes = signed.toBytes();
        return Buffer.from(bytes).toString('base64');
      },
    };

    const client = new x402Client();
    client.register('hedera:testnet', new ExactHederaScheme(signer));

    const fetchWithPay = wrapFetchWithPayment(fetch, client);
    return fetchWithPay(url, init);
  };

  return (
    <WalletContext.Provider
      value={{
        accountId,
        isConnected: !!accountId,
        pairingString,
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

  async function handleConnect() {
    await connect();
  }

  if (isConnected) {
    return (
      <button
        onClick={disconnect}
        aria-label={`Disconnect wallet ${accountId ?? ''}`}
        className="flex items-center gap-2 rounded-xl border border-signal/20 bg-signal/5 px-3 py-2 text-xs font-medium text-signal transition-all hover:border-signal/40 hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
        <span className="font-mono">
          {accountId?.slice(0, 8)}…{accountId?.slice(-4)}
        </span>
      </button>
    );
  }

  if (projectIdMissing) {
    return (
      <span
        className="flex items-center gap-2 rounded-xl border border-edge bg-ink-light/50 px-3 py-2 text-xs font-medium text-slate-500 cursor-help"
        title="HashConnect project ID not configured. Set NEXT_PUBLIC_HASHCONNECT_PROJECT_ID in .env and rebuild."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
        Unavailable
      </span>
    );
  }

  return (
    <button
      onClick={handleConnect}
      aria-label="Connect Hedera wallet via HashConnect"
      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-signal px-4 py-2 text-xs font-bold text-ink shadow-glow-sm transition-all hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      Connect Wallet
    </button>
  );
}
