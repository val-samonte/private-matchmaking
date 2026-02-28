import { atom } from "jotai";
import { createSolanaRpc } from "@solana/kit";
import { rpcEndpointAtom } from "./cluster";

/**
 * L1 RPC atom
 */
export const rpcAtom = atom((get) => {
  const endpoint = get(rpcEndpointAtom);
  return createSolanaRpc(endpoint);
});
