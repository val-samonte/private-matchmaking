"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSetAtom } from "jotai";
import { walletPublicKeyAtom, walletConnectedAtom } from "@/atoms/wallet";

export function WalletAtomSync() {
  const { publicKey, connected } = useWallet();
  const setPublicKey = useSetAtom(walletPublicKeyAtom);
  const setConnected = useSetAtom(walletConnectedAtom);

  useEffect(() => {
    setPublicKey(publicKey);
    setConnected(connected);
  }, [publicKey, connected, setPublicKey, setConnected]);

  return null;
}
