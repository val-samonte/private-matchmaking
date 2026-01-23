"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Navbar } from "@/components/layout/Navbar";
import { useEffect, useState } from "react";
import { useRpsProgram } from "@/hooks/useRpsProgram";
import { derivePlayerProfilePda } from "@/lib/game-utils";
import { PlayerProfile } from "@/lib/types";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lobby } from "@/components/game/Lobby";
import { GameRoom } from "@/components/game/GameRoom";
import { useAtomValue } from "jotai";
import { matchInfoAtom } from "@/atoms/matchmaking";
import { useMatchmakingListener } from "@/hooks/useMatchmakingListener";

export default function Home() {
  const { publicKey } = useWallet();
  const program = useRpsProgram();

  // Matchmaking State
  const matchInfo = useAtomValue(matchInfoAtom);
  useMatchmakingListener();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!publicKey || !program) {
      setProfile(null);
      setInitialized(false);
      return;
    }

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const pda = derivePlayerProfilePda(publicKey);
        const acc = await program.account.playerProfile.fetch(pda);
        setProfile(acc);
        setInitialized(true);
      } catch (e) {
        // Account not found or other error
        console.log("Profile not found or error:", e);
        setProfile(null);
        setInitialized(true); // Initialized check, but no profile
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [publicKey, program]);

  const handleCreateProfile = async () => {
    if (!program || !publicKey) return;
    try {
      setLoading(true);
      const tx = await program.methods
        .initializePlayer(new BN(1200)) // Starting ELO
        .accounts({
            // @ts-ignore
            payer: publicKey
          // other accounts inferred by Anchor
        })
        .rpc();
      console.log("Profile created:", tx);
      
      // Refresh
      const pda = derivePlayerProfilePda(publicKey);
      const acc = await program.account.playerProfile.fetch(pda);
      setProfile(acc);
    } catch (e) {
      console.error("Failed to create profile:", e);
      alert("Failed to create profile. See console.");
    } finally {
        setLoading(false);
    }
  };

  if (matchInfo) {
    return (
        <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center justify-center">
            <Navbar />
            <GameRoom gameId={matchInfo.gameId} opponent={matchInfo.opponent} />
        </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        {!publicKey ? (
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold">Welcome to RPS Arena</h1>
                <p className="text-gray-500">Connect your wallet to enter the arena.</p>
            </div>
        ) : loading ? (
            <div>Loading Profile...</div>
        ) : !profile ? (
            <div className="text-center space-y-4 max-w-md border border-zinc-200 dark:border-zinc-800 p-8 rounded-xl">
                <h2 className="text-2xl font-bold">Create Your Fighter</h2>
                <p className="text-zinc-500">
                    You need a registered profile to join the matchmaking queue.
                    Starting ELO: 1200.
                </p>
                <button 
                    onClick={handleCreateProfile}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors cursor-pointer"
                >
                    Initialize Profile
                </button>
            </div>
        ) : (
            <div className="text-center space-y-6">
                 <div className="space-y-2">
                    <h1 className="text-3xl font-bold">Ready for Battle</h1>
                    <div className="inline-flex items-center gap-4 bg-zinc-100 dark:bg-zinc-900 px-6 py-3 rounded-full">
                        <div className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Current Rating</div>
                        <div className="text-2xl font-mono font-bold text-blue-600">{profile.elo.toString()}</div>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                        <div className="text-green-600 font-bold text-xl">{profile.wins.toString()}</div>
                        <div className="text-xs text-green-700 uppercase">Wins</div>
                    </div>
                    <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                        <div className="text-red-600 font-bold text-xl">{profile.losses.toString()}</div>
                        <div className="text-xs text-red-700 uppercase">Losses</div>
                    </div>
                 </div>

                 <div className="pt-8 w-full max-w-md mx-auto">
                     <Lobby profile={profile} />
                 </div>
            </div>
        )}
      </main>
    </div>
  );
}
