import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { AnchorRockPaperScissor } from "@/lib/types";
import idl from "@/lib/idl/anchor_rock_paper_scissor.json";

export function useRpsProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const program = useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    return new Program(idl as any, provider) as Program<AnchorRockPaperScissor>;
  }, [connection, wallet]);

  return program;
}
