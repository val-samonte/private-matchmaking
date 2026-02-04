"use client";

import { FC, ReactNode, useEffect } from "react";
import { Provider, useSetAtom } from "jotai";
import { useWallet } from "@solana/wallet-adapter-react";
import { walletAtom, walletConnectedAtom } from "@/lib/atoms/wallet";

const WalletSync: FC = () => {
  const { publicKey, connected } = useWallet();
  const setWallet = useSetAtom(walletAtom);
  const setWalletConnected = useSetAtom(walletConnectedAtom);

  useEffect(() => {
    setWallet(publicKey);
    setWalletConnected(connected);
  }, [publicKey, connected, setWallet, setWalletConnected]);

  return null;
};

export const JotaiProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <Provider>
      <WalletSync />
      {children}
    </Provider>
  );
};
