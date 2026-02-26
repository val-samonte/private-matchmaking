import { type Address } from "@solana/kit";
export declare const QUEUE_SEED = "queue";
export declare const TENANT_SEED = "tenant";
export declare const TICKET_SEED = "ticket";
export declare function deriveQueuePda(programId: Address, authority: Address): Promise<Address>;
export declare function deriveTenantPda(programId: Address, authority: Address): Promise<Address>;
export declare function deriveTicketPda(programId: Address, player: Address, tenant: Address): Promise<Address>;
