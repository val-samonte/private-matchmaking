import { atom } from "jotai";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { rpcEndpointAtom, teeRpcEndpointAtom, teeWsEndpointAtom } from "./cluster";

/**
 * L1 RPC atom
 */
export const rpcAtom = atom((get) => {
  const endpoint = get(rpcEndpointAtom);
  return createSolanaRpc(endpoint);
});

/**
 * L1 WebSocket subscriptions atom
 */
export const rpcSubscriptionsAtom = atom((get) => {
  const endpoint = get(rpcEndpointAtom);
  const wsEndpoint = endpoint.replace(/^https/, "wss");
  return createSolanaRpcSubscriptions(wsEndpoint);
});

/**
 * TEE RPC atom (with auth token included in URL)
 */
export const teeRpcAtom = atom((get) => {
  const endpoint = get(teeRpcEndpointAtom);
  return createSolanaRpc(endpoint);
});

/**
 * TEE WebSocket subscriptions atom
 */
export const teeRpcSubscriptionsAtom = atom((get) => {
  const wsEndpoint = get(teeWsEndpointAtom);
  return createSolanaRpcSubscriptions(wsEndpoint);
});
