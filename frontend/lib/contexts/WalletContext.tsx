"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/ui";
import { PublicKey } from "@solana/web3.js";
import {
  createWalletBridge,
  type AnchorCompatWallet,
} from "@/lib/utils/wallet-bridge";

interface WalletContextType {
  wallet: UiWallet | null;
  account: UiWalletAccount | null;
  publicKey: PublicKey | null;
  connected: boolean;
  anchorWallet: AnchorCompatWallet | null;
  connect: (wallet: UiWallet, account: UiWalletAccount) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  wallet: null,
  account: null,
  publicKey: null,
  connected: false,
  anchorWallet: null,
  connect: () => {},
  disconnect: () => {},
});

export function useWalletContext() {
  return useContext(WalletContext);
}

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<UiWallet | null>(null);
  const [account, setAccount] = useState<UiWalletAccount | null>(null);
  const [anchorWallet, setAnchorWallet] = useState<AnchorCompatWallet | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);

  const connect = useCallback((w: UiWallet, a: UiWalletAccount) => {
    setWallet(w);
    setAccount(a);
    setPublicKey(new PublicKey(a.address));
    setAnchorWallet(createWalletBridge(w, a));
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAccount(null);
    setPublicKey(null);
    setAnchorWallet(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ wallet, account, publicKey, connected: !!account, anchorWallet, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}
