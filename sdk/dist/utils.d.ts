import * as web3 from "@solana/web3.js";
export declare const QUEUE_SEED = "queue";
export declare const TENANT_SEED = "tenant";
export declare const TICKET_SEED = "ticket";
export declare function deriveQueuePda(programId: web3.PublicKey, authority: web3.PublicKey): web3.PublicKey;
export declare function deriveTenantPda(programId: web3.PublicKey, authority: web3.PublicKey): web3.PublicKey;
export declare function deriveTicketPda(programId: web3.PublicKey, player: web3.PublicKey, tenant: web3.PublicKey): web3.PublicKey;
