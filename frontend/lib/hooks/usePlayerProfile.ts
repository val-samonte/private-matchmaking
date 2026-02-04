"use client";

import { useEffect, useState, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { playerProfileAtom, playerProfilePdaAtom, hasProfileAtom } from "@/lib/atoms/player";
import { RPS_GAME_PROGRAM_ID } from "@/lib/constants";
import type { RpsGame } from "@/lib/types/rps_game_idl";
import IDL from "@/lib/types/rps_game.json";

export function usePlayerProfile() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const profilePda = useAtomValue(playerProfilePdaAtom);
  const [profile, setProfile] = useAtom(playerProfileAtom);
  const hasProfile = useAtomValue(hasProfileAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile data
  useEffect(() => {
    if (!profilePda || !wallet.publicKey) {
      setProfile(null);
      return;
    }

    let isMounted = true;

    const fetchProfile = async () => {
      try {
        const provider = new AnchorProvider(connection, wallet as any, {
          commitment: "confirmed",
        });
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
  }, [profilePda, wallet.publicKey, connection]);

  // Initialize profile
  const initializeProfile = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error("Wallet not connected");
    }

    setLoading(true);
    setError(null);

    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
      });
      const program = new Program(IDL as any, provider) as Program<RpsGame>;

      await program.methods
        .initializePlayer()
        .accounts({
          player: wallet.publicKey,
          payer: wallet.publicKey,
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

