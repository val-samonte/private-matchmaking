"use client";

import { useEffect, useState, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useWalletContext } from "@/lib/contexts/WalletContext";
import { rpcAtom } from "@/lib/atoms/program";
import { playerProfileAtom, playerProfilePdaAtom, hasProfileAtom } from "@/lib/atoms/player";
import { walletToSigner } from "@/lib/utils/wallet-bridge";
import { sendInstruction } from "@/lib/utils/transaction";
import type { PlayerProfile } from "@/lib/types/rps";
import {
  fetchMaybePlayerProfile,
  getInitializePlayerInstructionAsync,
} from "@sdk/generated/rps-game";

export function usePlayerProfile() {
  const { publicKey, kitWallet } = useWalletContext();
  const rpc = useAtomValue(rpcAtom);
  const profilePda = useAtomValue(playerProfilePdaAtom);
  const [profile, setProfile] = useAtom(playerProfileAtom);
  const hasProfile = useAtomValue(hasProfileAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile data
  useEffect(() => {
    if (!profilePda || !publicKey) {
      setProfile(null);
      return;
    }

    let isMounted = true;

    const fetchProfile = async () => {
      try {
        const maybeAccount = await fetchMaybePlayerProfile(rpc, profilePda);
        if (isMounted) {
          if (maybeAccount.exists) {
            setProfile({
              player: maybeAccount.data.player,
              elo: maybeAccount.data.elo,
              gamesPlayed: maybeAccount.data.gamesPlayed,
              gamesWon: maybeAccount.data.gamesWon,
            } satisfies PlayerProfile);
          } else {
            setProfile(null);
          }
        }
      } catch {
        if (isMounted) setProfile(null);
      }
    };

    fetchProfile();
    return () => { isMounted = false; };
  }, [profilePda, publicKey, rpc, setProfile]);

  // Initialize profile
  const initializeProfile = useCallback(async () => {
    if (!publicKey || !kitWallet || !profilePda) {
      throw new Error("Wallet not connected");
    }

    setLoading(true);
    setError(null);

    try {
      const signer = walletToSigner(kitWallet);
      const ix = await getInitializePlayerInstructionAsync({
        player: signer,
        payer: signer,
      });

      await sendInstruction(rpc, ix, kitWallet);

      // Refresh profile
      const account = await fetchMaybePlayerProfile(rpc, profilePda);
      if (account.exists) {
        setProfile({
          player: account.data.player,
          elo: account.data.elo,
          gamesPlayed: account.data.gamesPlayed,
          gamesWon: account.data.gamesWon,
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to create profile");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [publicKey, kitWallet, profilePda, rpc, setProfile]);

  return {
    profile,
    hasProfile,
    loading,
    error,
    initializeProfile,
  };
}
