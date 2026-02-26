"use client";

import { useState, useCallback } from "react";
import { useWallets, useConnect, useDisconnect } from "@wallet-standard/react";
import type { UiWallet } from "@wallet-standard/ui";
import { useWalletContext } from "@/lib/contexts/WalletContext";

export function WalletButton() {
  const { connected, publicKey, disconnect: ctxDisconnect, wallet: connectedWallet } = useWalletContext();
  const [showModal, setShowModal] = useState(false);

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground-muted">
          {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
        </span>
        <button
          onClick={ctxDisconnect}
          className="bg-gradient-primary text-white font-semibold py-2 px-4 rounded-xl text-sm hover:opacity-90 transition-all"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-gradient-primary text-white font-semibold py-3 px-8 rounded-xl hover:opacity-90 transition-all hover:scale-105"
      >
        Connect Wallet
      </button>

      {showModal && <WalletModal onClose={() => setShowModal(false)} />}
    </>
  );
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const wallets = useWallets();

  // Filter for Solana-compatible wallets
  const solanaWallets = wallets.filter((w) =>
    w.chains.some((c) => c.startsWith("solana:"))
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4 border border-glass-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-center">Connect Wallet</h2>

        {solanaWallets.length === 0 ? (
          <p className="text-center text-foreground-muted py-4">
            No Solana wallets found. Install Phantom, Solflare, or Backpack.
          </p>
        ) : (
          <div className="space-y-2">
            {solanaWallets.map((w) => (
              <WalletItem key={w.name} wallet={w} onClose={onClose} />
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full text-center text-sm text-foreground-muted hover:text-foreground transition-colors py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function WalletItem({ wallet, onClose }: { wallet: UiWallet; onClose: () => void }) {
  const [isConnecting, connect] = useConnect(wallet);
  const { connect: ctxConnect } = useWalletContext();

  const handleConnect = useCallback(async () => {
    try {
      const accounts = await connect();
      if (accounts.length > 0) {
        ctxConnect(wallet, accounts[0]);
        onClose();
      }
    } catch (err) {
      console.error("Failed to connect wallet:", err);
    }
  }, [connect, wallet, ctxConnect, onClose]);

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting}
      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-foreground/5 transition-colors disabled:opacity-50"
    >
      {wallet.icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wallet.icon} alt={wallet.name} className="w-8 h-8 rounded-lg" />
      )}
      <span className="font-medium">{wallet.name}</span>
      {isConnecting && <span className="ml-auto text-sm text-foreground-muted">Connecting...</span>}
    </button>
  );
}
