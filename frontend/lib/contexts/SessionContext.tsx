"use client";

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { generateKeyPairSigner } from "@solana/kit";
import { useAtomValue, useSetAtom } from "jotai";
import { rpcAtom } from "@/lib/atoms/program";
import { kitWalletAtom } from "@/lib/atoms/wallet";
import {
  sessionSignerAtom,
  duelSessionTokenPdaAtom,
  rpsSessionTokenPdaAtom,
} from "@/lib/atoms/session";
import { DUEL_PROGRAM_ID, RPS_GAME_PROGRAM_ID } from "@/lib/constants";
import { sendCreateDualSessionTx } from "@/lib/utils/session";

/** How long a session token is valid (2 hours). */
const SESSION_DURATION_SECONDS = 2 * 60 * 60;

interface SessionContextValue {
  createSession: () => Promise<void>;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const rpc = useAtomValue(rpcAtom);
  const kitWallet = useAtomValue(kitWalletAtom);
  const setSessionSigner = useSetAtom(sessionSignerAtom);
  const setDuelSessionTokenPda = useSetAtom(duelSessionTokenPdaAtom);
  const setRpsSessionTokenPda = useSetAtom(rpsSessionTokenPdaAtom);

  const createSession = useCallback(async () => {
    if (!kitWallet) throw new Error("Wallet not connected");
    const keypair = await generateKeyPairSigner();

    const { duelSessionTokenPda, rpsSessionTokenPda } =
      await sendCreateDualSessionTx(
        rpc,
        keypair,
        kitWallet,
        DUEL_PROGRAM_ID,
        RPS_GAME_PROGRAM_ID,
        SESSION_DURATION_SECONDS,
      );

    setSessionSigner(keypair);
    setDuelSessionTokenPda(duelSessionTokenPda);
    setRpsSessionTokenPda(rpsSessionTokenPda);
    console.log("Dual session created:", keypair.address);
    console.log("  duelSessionTokenPda:", duelSessionTokenPda);
    console.log("  rpsSessionTokenPda:", rpsSessionTokenPda);
  }, [rpc, kitWallet, setSessionSigner, setDuelSessionTokenPda, setRpsSessionTokenPda]);

  const clearSession = useCallback(() => {
    setSessionSigner(null);
    setDuelSessionTokenPda(null);
    setRpsSessionTokenPda(null);
    console.log("Session key cleared");
  }, [setSessionSigner, setDuelSessionTokenPda, setRpsSessionTokenPda]);

  return (
    <SessionContext.Provider value={{ createSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
