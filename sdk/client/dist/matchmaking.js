"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingClient = void 0;
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const private_matchmaking_json_1 = __importDefault(require("./private_matchmaking.json"));
class MatchmakingClient {
    constructor(provider, programId) {
        this.provider = provider;
        const PROGRAM_ID = programId || new web3_js_1.PublicKey("sUcFSbEig6ydu7ddNhb1dvRksqmC5eRuLxg77wK4PDz");
        // Override address in IDL
        const modifiedIdl = { ...private_matchmaking_json_1.default };
        modifiedIdl.address = PROGRAM_ID.toBase58();
        this.program = new anchor_1.Program(modifiedIdl, this.provider);
    }
    /**
     * Derive the Queue PDA
     */
    getQueuePda(authority) {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("queue"), authority.toBuffer()], this.program.programId);
        return pda;
    }
    /**
     * Derive the Tenant PDA
     */
    getTenantPda(authority) {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("tenant"), authority.toBuffer()], this.program.programId);
        return pda;
    }
    /**
     * Initialize a Tenant
     */
    async initializeTenant(authority, tenantProgramId, eloWindow = 100, eloOffset = 8 + 32, confirmOptions, signers = []) {
        const tenantPda = this.getTenantPda(authority);
        return await this.program.methods
            .initializeTenant(tenantProgramId, eloOffset, new anchor.BN(eloWindow))
            .accountsPartial({
            tenant: tenantPda,
            authority: authority,
        })
            .signers(signers)
            .rpc(confirmOptions);
    }
    /**
     * Initialize a Queue
     */
    async initializeQueue(authority, tenant, confirmOptions, signers = []) {
        const queuePda = this.getQueuePda(authority);
        return await this.program.methods
            .initializeQueue()
            .accountsPartial({
            queue: queuePda,
            tenant: tenant,
            authority: authority,
        })
            .signers(signers)
            .rpc(confirmOptions);
    }
    /**
     * Delegate Queue to TEE
     */
    async delegateQueue(authority, validator = new web3_js_1.PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"), // Default Reference Validator
    confirmOptions, signers = []) {
        const queuePda = this.getQueuePda(authority);
        // Construct manual accounts for delegation if IDL doesn't fully support delegate macro typing in old versions
        // But typically it should.
        return await this.program.methods
            .delegateQueue({ queue: { authority } }) // enum argument
            .accounts({
            pda: queuePda,
            payer: authority,
            validator: validator,
        })
            .signers(signers)
            .rpc(confirmOptions);
    }
    /**
     * Join Queue (TEE Aware)
     */
    async joinQueue(queue, tenant, playerData, confirmOptions) {
        return await this.program.methods
            .joinQueue()
            .accountsPartial({
            queue: queue,
            tenant: tenant,
            playerData: playerData,
            signer: this.provider.publicKey, // Explicit signer from provider
        })
            .rpc(confirmOptions);
    }
    /**
     * Process Match
     */
    async processMatch(queue, tenant, confirmOptions) {
        return await this.program.methods
            .processMatch()
            .accountsPartial({
            queue: queue,
            tenant: tenant,
        })
            .rpc(confirmOptions);
    }
}
exports.MatchmakingClient = MatchmakingClient;
