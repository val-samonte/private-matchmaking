"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useSetAtom } from "jotai";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/ui";
import type { Address } from "@solana/kit";
import {
  createWalletBridge,
  type KitWallet,
} from "@/lib/utils/wallet-bridge";
import { walletAtom } from "@/lib/atoms/wallet";

interface WalletContextType {
  wallet: UiWallet | null;
  account: UiWalletAccount | null;
  publicKey: Address | null;
  connected: boolean;
  kitWallet: KitWallet | null;
  connect: (wallet: UiWallet, account: UiWalletAccount) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  wallet: null,
  account: null,
  publicKey: null,
  connected: false,
  kitWallet: null,
  connect: () => {},
  disconnect: () => {},
});

export function useWalletContext() {
  return useContext(WalletContext);
}

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<UiWallet | null>(null);
  const [account, setAccount] = useState<UiWalletAccount | null>(null);
  const [kitWallet, setKitWallet] = useState<KitWallet | null>(null);
  const [publicKey, setPublicKey] = useState<Address | null>(null);
  const setWalletAtom = useSetAtom(walletAtom);

  const connect = useCallback((w: UiWallet, a: UiWalletAccount) => {
    const addr = a.address as Address;
    setWallet(w);
    setAccount(a);
    setPublicKey(addr);
    setWalletAtom(addr);
    setKitWallet(createWalletBridge(w, a));
  }, [setWalletAtom]);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAccount(null);
    setPublicKey(null);
    setWalletAtom(null);
    setKitWallet(null);
  }, [setWalletAtom]);

  return (
    <WalletContext.Provider
      value={{ wallet, account, publicKey, connected: !!account, kitWallet, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}
