"use client";

import { useEffect, useState, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Program } from "@coral-xyz/anchor";
import { useWalletContext } from "@/lib/contexts/WalletContext";
import { connectionAtom } from "@/lib/atoms/program";
import { playerProfileAtom, playerProfilePdaAtom, hasProfileAtom } from "@/lib/atoms/player";
import { RPS_GAME_PROGRAM_ID } from "@/lib/constants";
import { createL1Provider } from "@/lib/utils/tee";
import type { RpsGame } from "@/lib/types/rps_game_idl";
import IDL from "@/lib/types/rps_game.json";

export function usePlayerProfile() {
  const { publicKey, anchorWallet } = useWalletContext();
  const connection = useAtomValue(connectionAtom);
  const profilePda = useAtomValue(playerProfilePdaAtom);
  const [profile, setProfile] = useAtom(playerProfileAtom);
  const hasProfile = useAtomValue(hasProfileAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile data
  useEffect(() => {
    if (!profilePda || !publicKey || !anchorWallet) {
      setProfile(null);
      return;
    }

    let isMounted = true;

    const fetchProfile = async () => {
      try {
        const provider = createL1Provider(connection, anchorWallet);
        const program = new Program(IDL as any, provider) as Program<RpsGame>;

        const profileData = await program.account.playerProfile.fetch(profilePda);
        if (isMounted) {
          setProfile(profileData as any);
        }
      } catch (err) {
        // Profile doesn't exist yet
        if (isMounted) {
          setProfile(null);
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [profilePda, publicKey, connection, anchorWallet]);

  // Initialize profile
  const initializeProfile = async () => {
    if (!publicKey || !anchorWallet) {
      throw new Error("Wallet not connected");
    }

    setLoading(true);
    setError(null);

    try {
      const provider = createL1Provider(connection, anchorWallet);
      const program = new Program(IDL as any, provider) as Program<RpsGame>;

      await program.methods
        .initializePlayer()
        .accounts({
          player: publicKey,
          payer: publicKey,
        })
        .rpc();

      // Refresh profile
      const profileData = await program.account.playerProfile.fetch(profilePda!);
      setProfile(profileData as any);
    } catch (err: any) {
      setError(err.message || "Failed to create profile");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    profile,
    hasProfile,
    loading,
    error,
    initializeProfile,
  };
}
