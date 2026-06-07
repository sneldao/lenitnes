'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { HashConnect } from 'hashconnect';
import { api } from '@/lib/api';

// Heavy wallet/crypto libraries (@hashgraph/sdk, hashconnect, @x402/*) are
// imported dynamically inside browser-only code paths. Importing them at module
// scope pulls Node's `crypto` into the server bundle and breaks Next's
// SSR/prerender pass. Dynamic import() keeps them out of the server graph.

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  pairingString: string | null;
  isLoading: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
  executeWithPayment: (url: string, init?: RequestInit) => Promise<Response>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [hashconnect, setHashconnect] = useState<HashConnect | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pairingString, setPairingString] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const projectId = process.env.NEXT_PUBLIC_HASHCONNECT_PROJECT_ID;
      if (!projectId) {
        console.warn('NEXT_PUBLIC_HASHCONNECT_PROJECT_ID not set');
        return;
      }
      const { HashConnect } = await import('hashconnect');
      const { LedgerId, AccountId } = await import('@hashgraph/sdk');
      const hc = new HashConnect(
        LedgerId.TESTNET,
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
        // Auto-login on initial load if wallet is already paired.
        try {
          const message = `lenitnes:auth:${Date.now()}`;
          const sigs = await hc.signMessages(AccountId.fromString(addr), message);
          if (sigs && sigs.length > 0) {
            const pk = sigs[0].publicKey.toStringRaw();
            const sig = Buffer.from(sigs[0].signature).toString('hex');
            await api.login({
              walletAddress: addr,
              publicKey: pk,
              message,
              signature: sig,
            });
          }
        } catch (e) {
          console.warn('[WalletConnect] initial auto-login failed:', e);
        }
      }

      hc.pairingEvent.on(async () => {
        const connected = hc.connectedAccountIds;
        if (connected.length > 0) {
          const addr = connected[0].toString();
          setAccountId(addr);

          // Sign an auth nonce and exchange it for a JWT.
          try {
            const message = `lenitnes:auth:${Date.now()}`;
            const sigs = await hc.signMessages(AccountId.fromString(addr), message);
            if (sigs && sigs.length > 0) {
              const pk = sigs[0].publicKey.toStringRaw();
              const sig = Buffer.from(sigs[0].signature).toString('hex');
              await api.login({
                walletAddress: addr,
                publicKey: pk,
                message,
                signature: sig,
              });
            }
          } catch (e) {
            console.warn('[WalletConnect] auto-login failed:', e);
          }
        }
      });

      hc.disconnectionEvent.on(() => {
        setAccountId(null);
        api.logout();
      });
    };
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const connect = () => {
    setIsLoading(true);
    if (hashconnect?.pairingString) {
      navigator.clipboard
        ?.writeText(hashconnect.pairingString)
        .then(() => {
          alert('Pairing string copied! Paste it into HashPack to connect.');
        })
        .catch(() => {
          alert(`Copy this pairing string into HashPack:\n${hashconnect.pairingString}`);
        });
    }
    setIsLoading(false);
  };

  const disconnect = async () => {
    if (hashconnect) {
      await hashconnect.disconnect();
      setAccountId(null);
      api.logout();
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
  const { isConnected, accountId, connect, disconnect } = useWallet();

  if (isConnected) {
    return (
      <button
        onClick={disconnect}
        aria-label={`Disconnect wallet ${accountId ?? ''}`}
        className="rounded bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        {accountId?.slice(0, 8)}...{accountId?.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      aria-label="Connect Hedera wallet via HashConnect"
      className="rounded bg-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      Connect Wallet
    </button>
  );
}
