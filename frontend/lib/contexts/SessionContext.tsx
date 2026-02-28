"use client";

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { generateKeyPairSigner } from "@solana/kit";
import { useAtomValue, useSetAtom } from "jotai";
import { rpcAtom } from "@/lib/atoms/program";
import { kitWalletAtom } from "@/lib/atoms/wallet";
import { sessionSignerAtom } from "@/lib/atoms/session";
import { RPS_GAME_PROGRAM_ID } from "@/lib/constants";
import { sendCreateSessionTx } from "@/lib/utils/session";

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

  const createSession = useCallback(async () => {
    if (!kitWallet) throw new Error("Wallet not connected");
    const keypair = await generateKeyPairSigner();
    await sendCreateSessionTx(rpc, keypair, kitWallet, RPS_GAME_PROGRAM_ID, SESSION_DURATION_SECONDS);
    setSessionSigner(keypair);
    console.log("Session key created:", keypair.address);
  }, [rpc, kitWallet, setSessionSigner]);

  const clearSession = useCallback(() => {
    setSessionSigner(null);
    console.log("Session key cleared");
  }, [setSessionSigner]);

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
