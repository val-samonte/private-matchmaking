"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/ui";
import type { Address } from "@solana/kit";
import { createWalletBridge, type KitWallet } from "@/lib/utils/wallet-bridge";
import { walletAtom, kitWalletAtom, walletConnectedAtom } from "@/lib/atoms/wallet";
import { sessionSignerAtom } from "@/lib/atoms/session";

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
  // wallet/account kept local — wallet-standard UI objects, not needed in global state
  const [wallet, setWallet] = useState<UiWallet | null>(null);
  const [account, setAccount] = useState<UiWalletAccount | null>(null);

  // On-chain state lives in atoms so any component can react to it
  const setWalletAtom = useSetAtom(walletAtom);
  const setKitWalletAtom = useSetAtom(kitWalletAtom);
  const setSessionSigner = useSetAtom(sessionSignerAtom);
  const publicKey = useAtomValue(walletAtom);
  const kitWallet = useAtomValue(kitWalletAtom);
  const connected = useAtomValue(walletConnectedAtom);

  const connect = useCallback((w: UiWallet, a: UiWalletAccount) => {
    const addr = a.address as Address;
    setWallet(w);
    setAccount(a);
    setWalletAtom(addr);
    setKitWalletAtom(createWalletBridge(w, a));
  }, [setWalletAtom, setKitWalletAtom]);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAccount(null);
    setWalletAtom(null);
    setKitWalletAtom(null);
    setSessionSigner(null); // auto-invalidate session key on wallet disconnect
  }, [setWalletAtom, setKitWalletAtom, setSessionSigner]);

  return (
    <WalletContext.Provider
      value={{ wallet, account, publicKey, connected, kitWallet, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}
