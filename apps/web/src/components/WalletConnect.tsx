'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';

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
