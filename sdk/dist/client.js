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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingClient = void 0;
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const utils_1 = require("./utils");
const encryption_1 = require("./encryption");
// Default Validator for Devnet (MagicBlock)
const DEFAULT_VALIDATOR = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA";
class MatchmakingClient {
    constructor(provider, programId, config = {}) {
        this.provider = provider;
        this.config = config;
        this.encryption = new encryption_1.EncryptionProvider();
        // Load the IDL (we assume it's bundled or we can require it if running in node)
        // For SDK purity, we should import the JSON.
        const idl = require("./idl/private_matchmaking.json");
        idl.address = programId.toBase58();
        this.program = new anchor_1.Program(idl, provider);
    }
    /**
     * Initialize a new matchmaking queue.
     */
    async initializeQueue(queueId, config, capacity, pageSize = 50) {
        const queuePda = (0, utils_1.deriveQueuePda)(this.program.programId, this.provider.wallet.publicKey, queueId);
        // Ensure tenant ID is set
        const tenantProgramId = config.tenantProgramId || this.provider.wallet.publicKey;
        const tx = await this.program.methods
            .initializeQueue(queueId, config, capacity, pageSize)
            .accounts({
            // queue: queuePda,
            // authority: this.provider.wallet.publicKey,
            tenantProgramId: tenantProgramId,
            // systemProgram: SystemProgram.programId,
        })
            .rpc(this.config.confirmOptions);
        console.log(`Initialized Queue: ${queuePda.toBase58()} in tx: ${tx}`);
        // Initialize Pages (Ring Buffer)
        for (let i = 0; i < capacity; i++) {
            await this.initializePage(queuePda, i);
        }
        return queuePda;
    }
    /**
     * Initialize a specific page for the queue.
     */
    async initializePage(queue, index) {
        const pagePda = (0, utils_1.derivePagePda)(this.program.programId, queue, index);
        const tx = await this.program.methods
            .initializePage(new anchor.BN(index))
            .accounts({
            queue: queue,
            // page: pagePda,
            // authority: this.provider.wallet.publicKey,
            // systemProgram: SystemProgram.programId,
        })
            .rpc(this.config.confirmOptions);
        console.log(`Initialized Page ${index}: ${pagePda.toBase58()}`);
        return pagePda;
    }
    /**
     * Delegate the queue to the Privacy Layer (Ephemeral Rollup).
     */
    async delegateQueue(queueId, validatorOverride) {
        const validator = validatorOverride || new web3_js_1.PublicKey(DEFAULT_VALIDATOR);
        const queuePda = (0, utils_1.deriveQueuePda)(this.program.programId, this.provider.wallet.publicKey, queueId);
        const tx = await this.program.methods
            .delegateQueue(queueId)
            .preInstructions([
            web3_js_1.ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 })
        ])
            .accounts({
            // pda: queuePda,
            // authority: this.provider.wallet.publicKey,
            // payer: this.provider.wallet.publicKey,
            validator: validator,
        })
            .rpc(this.config.confirmOptions);
        console.log(`Delegated Queue ${queueId}: ${tx}`);
        return tx;
    }
    /**
     * Join the queue.
     */
    async joinQueue(queue, playerGameAccount, tenantProgramId) {
        // Fetch queue to determine current WRITE index
        const queueAccount = await this.getQueue(queue);
        const capacity = queueAccount.capacity;
        const writeIndex = queueAccount.writePageIndex.toNumber();
        const currentIndex = writeIndex % capacity;
        const pagePda = (0, utils_1.derivePagePda)(this.program.programId, queue, currentIndex);
        const statusPda = (0, utils_1.derivePlayerStatusPda)(this.program.programId, playerGameAccount);
        // Encryption Handshake Integration
        let instructionData;
        if (this.config.encrypted) {
            console.log("🔒 Encrypted Queue Join Init...");
            // TODO: Fetch Validator Key from on-chain Registry or Delegate Account
            // For now, using a mock dummy key for demonstration of the flow
            // In PROD: const validatorKey = await this.getValidatorKey(queue);
            const mockValidatorKey = await this.encryption.createMockValidatorKey(); // Valid P-256 Public Key
            // Perform Encryption
            // Real payload would vary (e.g. Rock/Paper/Scissor choice)
            const payload = Buffer.from("PLAYER_CHOICE_ROCK");
            const { encrypted, clientPublicKey } = await this.encryption.encryptPayload(payload, mockValidatorKey);
            console.log("🔒 Payload Encrypted. Client PubKey:", Buffer.from(clientPublicKey).toString('hex'));
            // In a real implementation, 'encrypted' and 'clientPublicKey' would be passed 
            // as arguments to the 'joinQueue' instruction modification.
            // Since the IDL isn't updated for arguments yet, we just log it.
        }
        const tx = await this.program.methods
            .joinQueue()
            .accounts({
            queue: queue,
            // page: pagePda,
            page: pagePda,
            // playerStatus: statusPda,
            // playerAuthority: this.provider.wallet.publicKey,
            playerGameAccount: playerGameAccount,
            tenantProgram: tenantProgramId, // Added for Matchable Interface CPI
            // systemProgram: SystemProgram.programId,
        })
            .rpc(this.config.confirmOptions);
        console.log(`Joined Queue at Page ${currentIndex}: ${tx} (Lock: ${statusPda.toBase58()})`);
        // Future Logic: If SDK receives a return log/event indicating "Instant Match", parse it.
        // For now, default to "Queued".
        return {
            status: "Queued",
            tx,
            statusPda
        };
    }
    /**
     * Unlock a player manually (refund rent).
     */
    async unlockPlayer(playerGameAccount, playerWallet) {
        const statusPda = (0, utils_1.derivePlayerStatusPda)(this.program.programId, playerGameAccount);
        const statusAccount = await this.getPlayerStatus(statusPda);
        const queueAddress = statusAccount.queue;
        const tx = await this.program.methods
            .unlockPlayer()
            .accounts({
            queue: queueAddress,
            // authority: this.provider.wallet.publicKey,
            // playerStatus: statusPda,
            player: playerWallet,
            playerGameAccount: playerGameAccount
        })
            .rpc(this.config.confirmOptions);
        console.log(`Unlocked Player: ${tx}`);
        return tx;
    }
    /**
     * Process matches on a specific page.
     * Usually called by the off-chain worker or manually for testing.
     */
    async processMatch(queue, pageIndex) {
        const pagePda = (0, utils_1.derivePagePda)(this.program.programId, queue, pageIndex);
        const tx = await this.program.methods
            .processMatch(new anchor.BN(pageIndex))
            .accounts({
            queueAccount: queue,
            // page: pagePda,
        })
            .rpc(this.config.confirmOptions);
        return tx;
    }
    /**
     * Resize the queue capacity.
     */
    async resizeQueue(queue, newCapacity) {
        const tx = await this.program.methods
            .resizeQueue(newCapacity)
            .accounts({
            queue: queue,
            // authority: this.provider.wallet.publicKey,
        })
            .rpc(this.config.confirmOptions);
        console.log(`Resized Queue to ${newCapacity}: ${tx}`);
        return tx;
    }
    // --- State Fetchers ---
    async getQueue(queuePda) {
        return await this.program.account.queueHead.fetch(queuePda);
    }
    async getPage(pagePda) {
        return await this.program.account.queuePage.fetch(pagePda);
    }
    async getPlayerStatus(statusPda) {
        return await this.program.account.playerStatus.fetch(statusPda);
    }
    async getPlayerStatusForGameAccount(playerGameAccount) {
        const statusPda = (0, utils_1.derivePlayerStatusPda)(this.program.programId, playerGameAccount);
        return await this.getPlayerStatus(statusPda);
    }
    // --- Dev Helpers ---
    async createMockPlayer(playerAccount, elo) {
        const tx = await this.program.methods
            .createMockPlayer(new anchor.BN(elo))
            .accounts({
            playerAccount: playerAccount.publicKey,
            authority: this.provider.wallet.publicKey,
            // systemProgram: SystemProgram.programId,
        })
            .signers([playerAccount])
            .rpc(this.config.confirmOptions);
        return tx;
    }
    /**
     * Close a queue page to reclaim rent.
     */
    async closePage(queue, index) {
        const pagePda = (0, utils_1.derivePagePda)(this.program.programId, queue, index);
        const tx = await this.program.methods
            .closePage(new anchor.BN(index))
            .accounts({
            queue: queue,
            // page: pagePda, // Auto-resolved
            authority: this.provider.wallet.publicKey,
        })
            .rpc(this.config.confirmOptions);
        console.log(`Closed Page ${index}: ${pagePda.toBase58()}`);
        return tx;
    }
    /**
     * Close a queue head to reclaim rent.
     */
    async closeQueue(queueId) {
        const queuePda = (0, utils_1.deriveQueuePda)(this.program.programId, this.provider.wallet.publicKey, queueId);
        const tx = await this.program.methods
            .closeQueue(queueId)
            .accounts({
            // queue: queuePda, // Auto-resolved
            authority: this.provider.wallet.publicKey,
        })
            .rpc(this.config.confirmOptions);
        console.log(`Closed Queue: ${queuePda.toBase58()}`);
        return tx;
    }
}
exports.MatchmakingClient = MatchmakingClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDBEQUE0QztBQUM1Qyw4Q0FBaUU7QUFDakUsNkNBTXlCO0FBR3pCLG1DQUErRTtBQUMvRSw2Q0FBa0Q7QUFFbEQsNENBQTRDO0FBQzVDLE1BQU0saUJBQWlCLEdBQUcsOENBQThDLENBQUM7QUFFekUsTUFBYSxpQkFBaUI7SUFNMUIsWUFDSSxRQUF3QixFQUN4QixTQUFvQixFQUNwQixTQUFrQyxFQUFFO1FBRXBDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSwrQkFBa0IsRUFBRSxDQUFDO1FBRTNDLGdGQUFnRjtRQUNoRiw2Q0FBNkM7UUFDN0MsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7UUFDdEQsR0FBRyxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGdCQUFPLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxlQUFlLENBQ2pCLE9BQWUsRUFDZixNQUFXLEVBQ1gsUUFBZ0IsRUFDaEIsV0FBbUIsRUFBRTtRQUVyQixNQUFNLFFBQVEsR0FBRyxJQUFBLHNCQUFjLEVBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRWpHLDBCQUEwQjtRQUMxQixNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsZUFBZSxJQUFJLElBQUksQ0FBQyxRQUFRLENB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QyxjQUFjLENBQUMsQ0FBQztRQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BELE9BQU8sRUFBRSxDQUFDO0lBQ2QsQ0FBQztDQUNKO0FBclNELDhDQXFTQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGFuY2hvciBmcm9tIFwiQGNvcmFsLXh5ei9hbmNob3JcIjtcbmltcG9ydCB7IFByb2dyYW0sIElkbCwgQW5jaG9yUHJvdmlkZXIgfSBmcm9tIFwiQGNvcmFsLXh5ei9hbmNob3JcIjtcbmltcG9ydCB7IFxuICAgIFB1YmxpY0tleSwgXG4gICAgU3lzdGVtUHJvZ3JhbSwgXG4gICAgS2V5cGFpciwgXG4gICAgVHJhbnNhY3Rpb25TaWduYXR1cmUsXG4gICAgQ29tcHV0ZUJ1ZGdldFByb2dyYW1cbn0gZnJvbSBcIkBzb2xhbmEvd2ViMy5qc1wiO1xuaW1wb3J0IHsgUHJpdmF0ZU1hdGNobWFraW5nIH0gZnJvbSBcIi4vaWRsL3ByaXZhdGVfbWF0Y2htYWtpbmdcIjtcbmltcG9ydCB7IE1hdGNobWFraW5nQ2xpZW50Q29uZmlnLCBRdWV1ZUhlYWQsIFF1ZXVlUGFnZSwgUGxheWVyU3RhdHVzLCBKb2luUXVldWVSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgZGVyaXZlUGFnZVBkYSwgZGVyaXZlUGxheWVyU3RhdHVzUGRhLCBkZXJpdmVRdWV1ZVBkYSB9IGZyb20gXCIuL3V0aWxzXCI7XG5pbXBvcnQgeyBFbmNyeXB0aW9uUHJvdmlkZXIgfSBmcm9tIFwiLi9lbmNyeXB0aW9uXCI7XG5cbi8vIERlZmF1bHQgVmFsaWRhdG9yIGZvciBEZXZuZXQgKE1hZ2ljQmxvY2spXG5jb25zdCBERUZBVUxUX1ZBTElEQVRPUiA9IFwiRm5FNlZKVDVRTlpkZWRaUG5Db0xzQVJnQndvRTZEZUpOakJzMkgxZ3lTWEFcIjtcblxuZXhwb3J0IGNsYXNzIE1hdGNobWFraW5nQ2xpZW50IHtcbiAgICBwcm9ncmFtOiBQcm9ncmFtPFByaXZhdGVNYXRjaG1ha2luZz47XG4gICAgcHJvdmlkZXI6IEFuY2hvclByb3ZpZGVyO1xuICAgIGNvbmZpZzogTWF0Y2htYWtpbmdDbGllbnRDb25maWc7XG4gICAgZW5jcnlwdGlvbjogRW5jcnlwdGlvblByb3ZpZGVyO1xuXG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIHByb3ZpZGVyOiBBbmNob3JQcm92aWRlciwgXG4gICAgICAgIHByb2dyYW1JZDogUHVibGljS2V5LFxuICAgICAgICBjb25maWc6IE1hdGNobWFraW5nQ2xpZW50Q29uZmlnID0ge31cbiAgICApIHtcbiAgICAgICAgdGhpcy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5lbmNyeXB0aW9uID0gbmV3IEVuY3J5cHRpb25Qcm92aWRlcigpO1xuICAgICAgICBcbiAgICAgICAgLy8gTG9hZCB0aGUgSURMICh3ZSBhc3N1bWUgaXQncyBidW5kbGVkIG9yIHdlIGNhbiByZXF1aXJlIGl0IGlmIHJ1bm5pbmcgaW4gbm9kZSlcbiAgICAgICAgLy8gRm9yIFNESyBwdXJpdHksIHdlIHNob3VsZCBpbXBvcnQgdGhlIEpTT04uXG4gICAgICAgIGNvbnN0IGlkbCA9IHJlcXVpcmUoXCIuL2lkbC9wcml2YXRlX21hdGNobWFraW5nLmpzb25cIik7XG4gICAgICAgIGlkbC5hZGRyZXNzID0gcHJvZ3JhbUlkLnRvQmFzZTU4KCk7XG4gICAgICAgIHRoaXMucHJvZ3JhbSA9IG5ldyBQcm9ncmFtKGlkbCwgcHJvdmlkZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemUgYSBuZXcgbWF0Y2htYWtpbmcgcXVldWUuXG4gICAgICovXG4gICAgYXN5bmMgaW5pdGlhbGl6ZVF1ZXVlKFxuICAgICAgICBxdWV1ZUlkOiBzdHJpbmcsIFxuICAgICAgICBjb25maWc6IGFueSwgXG4gICAgICAgIGNhcGFjaXR5OiBudW1iZXIsXG4gICAgICAgIHBhZ2VTaXplOiBudW1iZXIgPSA1MFxuICAgICk6IFByb21pc2U8UHVibGljS2V5PiB7XG4gICAgICAgIGNvbnN0IHF1ZXVlUGRhID0gZGVyaXZlUXVldWVQZGEodGhpcy5wcm9ncmFtLnByb2dyYW1JZCwgdGhpcy5wcm92aWRlci53YWxsZXQucHVibGljS2V5LCBxdWV1ZUlkKTtcblxuICAgICAgICAvLyBFbnN1cmUgdGVuYW50IElEIGlzIHNldFxuICAgICAgICBjb25zdCB0ZW5hbnRQcm9ncmFtSWQgPSBjb25maWcudGVuYW50UHJvZ3JhbUlkIHx8IHRoaXMucHJvdmlkZXIud2FsbGV0LnB1YmxpY0tleTtcblxuICAgICAgICBjb25zdCB0eCA9IGF3YWl0IHRoaXMucHJvZ3JhbS5tZXRob2RzXG4gICAgICAgICAgICAuaW5pdGlhbGl6ZVF1ZXVlKHF1ZXVlSWQsIGNvbmZpZywgY2FwYWNpdHksIHBhZ2VTaXplKVxuICAgICAgICAgICAgLmFjY291bnRzKHtcbiAgICAgICAgICAgICAgICAvLyBxdWV1ZTogcXVldWVQZGEsXG4gICAgICAgICAgICAgICAgLy8gYXV0aG9yaXR5OiB0aGlzLnByb3ZpZGVyLndhbGxldC5wdWJsaWNLZXksXG4gICAgICAgICAgICAgICAgdGVuYW50UHJvZ3JhbUlkOiB0ZW5hbnRQcm9ncmFtSWQsXG4gICAgICAgICAgICAgICAgLy8gc3lzdGVtUHJvZ3JhbTogU3lzdGVtUHJvZ3JhbS5wcm9ncmFtSWQsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnJwYyh0aGlzLmNvbmZpZy5jb25maXJtT3B0aW9ucyk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhgSW5pdGlhbGl6ZWQgUXVldWU6ICR7cXVldWVQZGEudG9CYXNlNTgoKX0gaW4gdHg6ICR7dHh9YCk7XG4gICAgICAgIFxuICAgICAgICAvLyBJbml0aWFsaXplIFBhZ2VzIChSaW5nIEJ1ZmZlcilcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjYXBhY2l0eTsgaSsrKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmluaXRpYWxpemVQYWdlKHF1ZXVlUGRhLCBpKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHF1ZXVlUGRhO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemUgYSBzcGVjaWZpYyBwYWdlIGZvciB0aGUgcXVldWUuXG4gICAgICovXG4gICAgYXN5bmMgaW5pdGlhbGl6ZVBhZ2UocXVldWU6IFB1YmxpY0tleSwgaW5kZXg6IG51bWJlcik6IFByb21pc2U8UHVibGljS2V5PiB7XG4gICAgICAgIGNvbnN0IHBhZ2VQZGEgPSBkZXJpdmVQYWdlUGRhKHRoaXMucHJvZ3JhbS5wcm9ncmFtSWQsIHF1ZXVlLCBpbmRleCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCB0eCA9IGF3YWl0IHRoaXMucHJvZ3JhbS5tZXRob2RzXG4gICAgICAgICAgICAuaW5pdGlhbGl6ZVBhZ2UobmV3IGFuY2hvci5CTihpbmRleCkpXG4gICAgICAgICAgICAuYWNjb3VudHMoe1xuICAgICAgICAgICAgICAgIHF1ZXVlOiBxdWV1ZSxcbiAgICAgICAgICAgICAgICAvLyBwYWdlOiBwYWdlUGRhLFxuICAgICAgICAgICAgICAgIC8vIGF1dGhvcml0eTogdGhpcy5wcm92aWRlci53YWxsZXQucHVibGljS2V5LFxuICAgICAgICAgICAgICAgIC8vIHN5c3RlbVByb2dyYW06IFN5c3RlbVByb2dyYW0ucHJvZ3JhbUlkLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5ycGModGhpcy5jb25maWcuY29uZmlybU9wdGlvbnMpO1xuICAgICAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGBJbml0aWFsaXplZCBQYWdlICR7aW5kZXh9OiAke3BhZ2VQZGEudG9CYXNlNTgoKX1gKTtcbiAgICAgICAgcmV0dXJuIHBhZ2VQZGE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVsZWdhdGUgdGhlIHF1ZXVlIHRvIHRoZSBQcml2YWN5IExheWVyIChFcGhlbWVyYWwgUm9sbHVwKS5cbiAgICAgKi9cbiAgICBhc3luYyBkZWxlZ2F0ZVF1ZXVlKHF1ZXVlSWQ6IHN0cmluZywgdmFsaWRhdG9yT3ZlcnJpZGU/OiBQdWJsaWNLZXkpOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRvciA9IHZhbGlkYXRvck92ZXJyaWRlIHx8IG5ldyBQdWJsaWNLZXkoREVGQVVMVF9WQUxJREFUT1IpO1xuICAgICAgICBjb25zdCBxdWV1ZVBkYSA9IGRlcml2ZVF1ZXVlUGRhKHRoaXMucHJvZ3JhbS5wcm9ncmFtSWQsIHRoaXMucHJvdmlkZXIud2FsbGV0LnB1YmxpY0tleSwgcXVldWVJZCk7XG5cbiAgICAgICAgY29uc3QgdHggPSBhd2FpdCB0aGlzLnByb2dyYW0ubWV0aG9kc1xuICAgICAgICAgICAgLmRlbGVnYXRlUXVldWUocXVldWVJZClcbiAgICAgICAgICAgIC5wcmVJbnN0cnVjdGlvbnMoW1xuICAgICAgICAgICAgICAgIENvbXB1dGVCdWRnZXRQcm9ncmFtLnJlcXVlc3RIZWFwRnJhbWUoeyBieXRlczogMjU2ICogMTAyNCB9KVxuICAgICAgICAgICAgXSlcbiAgICAgICAgICAgIC5hY2NvdW50cyh7XG4gICAgICAgICAgICAgICAgLy8gcGRhOiBxdWV1ZVBkYSxcbiAgICAgICAgICAgICAgICAvLyBhdXRob3JpdHk6IHRoaXMucHJvdmlkZXIud2FsbGV0LnB1YmxpY0tleSxcbiAgICAgICAgICAgICAgICAvLyBwYXllcjogdGhpcy5wcm92aWRlci53YWxsZXQucHVibGljS2V5LFxuICAgICAgICAgICAgICAgIHZhbGlkYXRvcjogdmFsaWRhdG9yLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5ycGModGhpcy5jb25maWcuY29uZmlybU9wdGlvbnMpO1xuICAgICAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGBEZWxlZ2F0ZWQgUXVldWUgJHtxdWV1ZUlkfTogJHt0eH1gKTtcbiAgICAgICAgcmV0dXJuIHR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEpvaW4gdGhlIHF1ZXVlLlxuICAgICAqL1xuICAgIGFzeW5jIGpvaW5RdWV1ZShcbiAgICAgICAgcXVldWU6IFB1YmxpY0tleSwgXG4gICAgICAgIHBsYXllckdhbWVBY2NvdW50OiBQdWJsaWNLZXksIFxuICAgICAgICB0ZW5hbnRQcm9ncmFtSWQ6IFB1YmxpY0tleVxuICAgICk6IFByb21pc2U8Sm9pblF1ZXVlUmVzdWx0PiB7XG4gICAgICAgIC8vIEZldGNoIHF1ZXVlIHRvIGRldGVybWluZSBjdXJyZW50IFdSSVRFIGluZGV4XG4gICAgICAgIGNvbnN0IHF1ZXVlQWNjb3VudCA9IGF3YWl0IHRoaXMuZ2V0UXVldWUocXVldWUpO1xuICAgICAgICBjb25zdCBjYXBhY2l0eSA9IHF1ZXVlQWNjb3VudC5jYXBhY2l0eTtcbiAgICAgICAgY29uc3Qgd3JpdGVJbmRleCA9IHF1ZXVlQWNjb3VudC53cml0ZVBhZ2VJbmRleC50b051bWJlcigpO1xuICAgICAgICBjb25zdCBjdXJyZW50SW5kZXggPSB3cml0ZUluZGV4ICUgY2FwYWNpdHk7XG5cbiAgICAgICAgY29uc3QgcGFnZVBkYSA9IGRlcml2ZVBhZ2VQZGEodGhpcy5wcm9ncmFtLnByb2dyYW1JZCwgcXVldWUsIGN1cnJlbnRJbmRleCk7XG4gICAgICAgIGNvbnN0IHN0YXR1c1BkYSA9IGRlcml2ZVBsYXllclN0YXR1c1BkYSh0aGlzLnByb2dyYW0ucHJvZ3JhbUlkLCBwbGF5ZXJHYW1lQWNjb3VudCk7XG5cbiAgICAgICAgLy8gRW5jcnlwdGlvbiBIYW5kc2hha2UgSW50ZWdyYXRpb25cbiAgICAgICAgbGV0IGluc3RydWN0aW9uRGF0YTogQnVmZmVyIHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAodGhpcy5jb25maWcuZW5jcnlwdGVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIvCflJIgRW5jcnlwdGVkIFF1ZXVlIEpvaW4gSW5pdC4uLlwiKTtcbiAgICAgICAgICAgIC8vIFRPRE86IEZldGNoIFZhbGlkYXRvciBLZXkgZnJvbSBvbi1jaGFpbiBSZWdpc3RyeSBvciBEZWxlZ2F0ZSBBY2NvdW50XG4gICAgICAgICAgICAvLyBGb3Igbm93LCB1c2luZyBhIG1vY2sgZHVtbXkga2V5IGZvciBkZW1vbnN0cmF0aW9uIG9mIHRoZSBmbG93XG4gICAgICAgICAgICAvLyBJbiBQUk9EOiBjb25zdCB2YWxpZGF0b3JLZXkgPSBhd2FpdCB0aGlzLmdldFZhbGlkYXRvcktleShxdWV1ZSk7XG4gICAgICAgICAgICBjb25zdCBtb2NrVmFsaWRhdG9yS2V5ID0gYXdhaXQgdGhpcy5lbmNyeXB0aW9uLmNyZWF0ZU1vY2tWYWxpZGF0b3JLZXkoKTsgLy8gVmFsaWQgUC0yNTYgUHVibGljIEtleVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBQZXJmb3JtIEVuY3J5cHRpb25cbiAgICAgICAgICAgIC8vIFJlYWwgcGF5bG9hZCB3b3VsZCB2YXJ5IChlLmcuIFJvY2svUGFwZXIvU2Npc3NvciBjaG9pY2UpXG4gICAgICAgICAgICBjb25zdCBwYXlsb2FkID0gQnVmZmVyLmZyb20oXCJQTEFZRVJfQ0hPSUNFX1JPQ0tcIik7XG4gICAgICAgICAgICBjb25zdCB7IGVuY3J5cHRlZCwgY2xpZW50UHVibGljS2V5IH0gPSBhd2FpdCB0aGlzLmVuY3J5cHRpb24uZW5jcnlwdFBheWxvYWQocGF5bG9hZCwgbW9ja1ZhbGlkYXRvcktleSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIvCflJIgUGF5bG9hZCBFbmNyeXB0ZWQuIENsaWVudCBQdWJLZXk6XCIsIEJ1ZmZlci5mcm9tKGNsaWVudFB1YmxpY0tleSkudG9TdHJpbmcoJ2hleCcpKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gSW4gYSByZWFsIGltcGxlbWVudGF0aW9uLCAnZW5jcnlwdGVkJyBhbmQgJ2NsaWVudFB1YmxpY0tleScgd291bGQgYmUgcGFzc2VkIFxuICAgICAgICAgICAgLy8gYXMgYXJndW1lbnRzIHRvIHRoZSAnam9pblF1ZXVlJyBpbnN0cnVjdGlvbiBtb2RpZmljYXRpb24uXG4gICAgICAgICAgICAvLyBTaW5jZSB0aGUgSURMIGlzbid0IHVwZGF0ZWQgZm9yIGFyZ3VtZW50cyB5ZXQsIHdlIGp1c3QgbG9nIGl0LlxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdHggPSBhd2FpdCB0aGlzLnByb2dyYW0ubWV0aG9kc1xuICAgICAgICAgICAgLmpvaW5RdWV1ZSgpXG4gICAgICAgICAgICAuYWNjb3VudHMoe1xuICAgICAgICAgICAgICAgIHF1ZXVlOiBxdWV1ZSxcbiAgICAgICAgICAgICAgICAvLyBwYWdlOiBwYWdlUGRhLFxuICAgICAgICAgICAgICAgIHBhZ2U6IHBhZ2VQZGEsIFxuICAgICAgICAgICAgICAgIC8vIHBsYXllclN0YXR1czogc3RhdHVzUGRhLFxuICAgICAgICAgICAgICAgIC8vIHBsYXllckF1dGhvcml0eTogdGhpcy5wcm92aWRlci53YWxsZXQucHVibGljS2V5LFxuICAgICAgICAgICAgICAgIHBsYXllckdhbWVBY2NvdW50OiBwbGF5ZXJHYW1lQWNjb3VudCxcbiAgICAgICAgICAgICAgICB0ZW5hbnRQcm9ncmFtOiB0ZW5hbnRQcm9ncmFtSWQsIC8vIEFkZGVkIGZvciBNYXRjaGFibGUgSW50ZXJmYWNlIENQSVxuICAgICAgICAgICAgICAgIC8vIHN5c3RlbVByb2dyYW06IFN5c3RlbVByb2dyYW0ucHJvZ3JhbUlkLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5ycGModGhpcy5jb25maWcuY29uZmlybU9wdGlvbnMpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGBKb2luZWQgUXVldWUgYXQgUGFnZSAke2N1cnJlbnRJbmRleH06ICR7dHh9IChMb2NrOiAke3N0YXR1c1BkYS50b0Jhc2U1OCgpfSlgKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEZ1dHVyZSBMb2dpYzogSWYgU0RLIHJlY2VpdmVzIGEgcmV0dXJuIGxvZy9ldmVudCBpbmRpY2F0aW5nIFwiSW5zdGFudCBNYXRjaFwiLCBwYXJzZSBpdC5cbiAgICAgICAgLy8gRm9yIG5vdywgZGVmYXVsdCB0byBcIlF1ZXVlZFwiLlxuICAgICAgICByZXR1cm4geyBcbiAgICAgICAgICAgIHN0YXR1czogXCJRdWV1ZWRcIiwgXG4gICAgICAgICAgICB0eCwgXG4gICAgICAgICAgICBzdGF0dXNQZGEgXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVW5sb2NrIGEgcGxheWVyIG1hbnVhbGx5IChyZWZ1bmQgcmVudCkuXG4gICAgICovXG4gICAgYXN5bmMgdW5sb2NrUGxheWVyKFxuICAgICAgICBwbGF5ZXJHYW1lQWNjb3VudDogUHVibGljS2V5LCBcbiAgICAgICAgcGxheWVyV2FsbGV0OiBQdWJsaWNLZXlcbiAgICApOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgICAgIGNvbnN0IHN0YXR1c1BkYSA9IGRlcml2ZVBsYXllclN0YXR1c1BkYSh0aGlzLnByb2dyYW0ucHJvZ3JhbUlkLCBwbGF5ZXJHYW1lQWNjb3VudCk7XG4gICAgICAgIGNvbnN0IHN0YXR1c0FjY291bnQgPSBhd2FpdCB0aGlzLmdldFBsYXllclN0YXR1cyhzdGF0dXNQZGEpO1xuICAgICAgICBjb25zdCBxdWV1ZUFkZHJlc3MgPSBzdGF0dXNBY2NvdW50LnF1ZXVlO1xuXG4gICAgICAgIGNvbnN0IHR4ID0gYXdhaXQgdGhpcy5wcm9ncmFtLm1ldGhvZHNcbiAgICAgICAgICAgIC51bmxvY2tQbGF5ZXIoKVxuICAgICAgICAgICAgLmFjY291bnRzKHtcbiAgICAgICAgICAgICAgICBxdWV1ZTogcXVldWVBZGRyZXNzLFxuICAgICAgICAgICAgICAgIC8vIGF1dGhvcml0eTogdGhpcy5wcm92aWRlci53YWxsZXQucHVibGljS2V5LFxuICAgICAgICAgICAgICAgIC8vIHBsYXllclN0YXR1czogc3RhdHVzUGRhLFxuICAgICAgICAgICAgICAgIHBsYXllcjogcGxheWVyV2FsbGV0LFxuICAgICAgICAgICAgICAgIHBsYXllckdhbWVBY2NvdW50OiBwbGF5ZXJHYW1lQWNjb3VudFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5ycGModGhpcy5jb25maWcuY29uZmlybU9wdGlvbnMpO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coYFVubG9ja2VkIFBsYXllcjogJHt0eH1gKTtcbiAgICAgICAgcmV0dXJuIHR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByb2Nlc3MgbWF0Y2hlcyBvbiBhIHNwZWNpZmljIHBhZ2UuXG4gICAgICogVXN1YWxseSBjYWxsZWQgYnkgdGhlIG9mZi1jaGFpbiB3b3JrZXIgb3IgbWFudWFsbHkgZm9yIHRlc3RpbmcuXG4gICAgICovXG4gICAgYXN5bmMgcHJvY2Vzc01hdGNoKFxuICAgICAgICBxdWV1ZTogUHVibGljS2V5LFxuICAgICAgICBwYWdlSW5kZXg6IG51bWJlclxuICAgICk6IFByb21pc2U8VHJhbnNhY3Rpb25TaWduYXR1cmU+IHtcbiAgICAgICAgY29uc3QgcGFnZVBkYSA9IGRlcml2ZVBhZ2VQZGEodGhpcy5wcm9ncmFtLnByb2dyYW1JZCwgcXVldWUsIHBhZ2VJbmRleCk7XG5cbiAgICAgICAgY29uc3QgdHggPSBhd2FpdCB0aGlzLnByb2dyYW0ubWV0aG9kc1xuICAgICAgICAgICAgLnByb2Nlc3NNYXRjaChuZXcgYW5jaG9yLkJOKHBhZ2VJbmRleCkpXG4gICAgICAgICAgICAuYWNjb3VudHMoe1xuICAgICAgICAgICAgICAgIHF1ZXVlQWNjb3VudDogcXVldWUsXG4gICAgICAgICAgICAgICAgLy8gcGFnZTogcGFnZVBkYSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAucnBjKHRoaXMuY29uZmlnLmNvbmZpcm1PcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gdHg7XG4gICAgfVxuICAgIFxuICAgIC8qKlxuICAgICAqIFJlc2l6ZSB0aGUgcXVldWUgY2FwYWNpdHkuXG4gICAgICovXG4gICAgYXN5bmMgcmVzaXplUXVldWUocXVldWU6IFB1YmxpY0tleSwgbmV3Q2FwYWNpdHk6IG51bWJlcik6IFByb21pc2U8VHJhbnNhY3Rpb25TaWduYXR1cmU+IHtcbiAgICAgICAgY29uc3QgdHggPSBhd2FpdCB0aGlzLnByb2dyYW0ubWV0aG9kc1xuICAgICAgICAgICAgLnJlc2l6ZVF1ZXVlKG5ld0NhcGFjaXR5KVxuICAgICAgICAgICAgLmFjY291bnRzKHtcbiAgICAgICAgICAgICAgICBxdWV1ZTogcXVldWUsXG4gICAgICAgICAgICAgICAgLy8gYXV0aG9yaXR5OiB0aGlzLnByb3ZpZGVyLndhbGxldC5wdWJsaWNLZXksXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnJwYyh0aGlzLmNvbmZpZy5jb25maXJtT3B0aW9ucyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBSZXNpemVkIFF1ZXVlIHRvICR7bmV3Q2FwYWNpdHl9OiAke3R4fWApO1xuICAgICAgICByZXR1cm4gdHg7XG4gICAgfVxuXG4gICAgLy8gLS0tIFN0YXRlIEZldGNoZXJzIC0tLVxuXG4gICAgYXN5bmMgZ2V0UXVldWUocXVldWVQZGE6IFB1YmxpY0tleSk6IFByb21pc2U8UXVldWVIZWFkPiB7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnByb2dyYW0uYWNjb3VudC5xdWV1ZUhlYWQuZmV0Y2gocXVldWVQZGEpO1xuICAgIH1cblxuICAgIGFzeW5jIGdldFBhZ2UocGFnZVBkYTogUHVibGljS2V5KTogUHJvbWlzZTxRdWV1ZVBhZ2U+IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvZ3JhbS5hY2NvdW50LnF1ZXVlUGFnZS5mZXRjaChwYWdlUGRhKTtcbiAgICB9XG5cbiAgICBhc3luYyBnZXRQbGF5ZXJTdGF0dXMoc3RhdHVzUGRhOiBQdWJsaWNLZXkpOiBQcm9taXNlPFBsYXllclN0YXR1cz4ge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9ncmFtLmFjY291bnQucGxheWVyU3RhdHVzLmZldGNoKHN0YXR1c1BkYSk7XG4gICAgfVxuICAgIFxuICAgIGFzeW5jIGdldFBsYXllclN0YXR1c0ZvckdhbWVBY2NvdW50KHBsYXllckdhbWVBY2NvdW50OiBQdWJsaWNLZXkpOiBQcm9taXNlPFBsYXllclN0YXR1cz4ge1xuICAgICAgICAgY29uc3Qgc3RhdHVzUGRhID0gZGVyaXZlUGxheWVyU3RhdHVzUGRhKHRoaXMucHJvZ3JhbS5wcm9ncmFtSWQsIHBsYXllckdhbWVBY2NvdW50KTtcbiAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFBsYXllclN0YXR1cyhzdGF0dXNQZGEpO1xuICAgIH1cblxuICAgIC8vIC0tLSBEZXYgSGVscGVycyAtLS1cblxuICAgIGFzeW5jIGNyZWF0ZU1vY2tQbGF5ZXIoXG4gICAgICAgIHBsYXllckFjY291bnQ6IEtleXBhaXIsIFxuICAgICAgICBlbG86IG51bWJlclxuICAgICk6IFByb21pc2U8VHJhbnNhY3Rpb25TaWduYXR1cmU+IHtcbiAgICAgICAgY29uc3QgdHggPSBhd2FpdCB0aGlzLnByb2dyYW0ubWV0aG9kc1xuICAgICAgICAgICAgLmNyZWF0ZU1vY2tQbGF5ZXIobmV3IGFuY2hvci5CTihlbG8pKVxuICAgICAgICAgICAgLmFjY291bnRzKHtcbiAgICAgICAgICAgICAgICBwbGF5ZXJBY2NvdW50OiBwbGF5ZXJBY2NvdW50LnB1YmxpY0tleSxcbiAgICAgICAgICAgICAgICBhdXRob3JpdHk6IHRoaXMucHJvdmlkZXIud2FsbGV0LnB1YmxpY0tleSxcbiAgICAgICAgICAgICAgICAvLyBzeXN0ZW1Qcm9ncmFtOiBTeXN0ZW1Qcm9ncmFtLnByb2dyYW1JZCxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuc2lnbmVycyhbcGxheWVyQWNjb3VudF0pXG4gICAgICAgICAgICAucnBjKHRoaXMuY29uZmlnLmNvbmZpcm1PcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsb3NlIGEgcXVldWUgcGFnZSB0byByZWNsYWltIHJlbnQuXG4gICAgICovXG4gICAgYXN5bmMgY2xvc2VQYWdlKHF1ZXVlOiBQdWJsaWNLZXksIGluZGV4OiBudW1iZXIpOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgICAgIGNvbnN0IHBhZ2VQZGEgPSBkZXJpdmVQYWdlUGRhKHRoaXMucHJvZ3JhbS5wcm9ncmFtSWQsIHF1ZXVlLCBpbmRleCk7XG4gICAgICAgIGNvbnN0IHR4ID0gYXdhaXQgdGhpcy5wcm9ncmFtLm1ldGhvZHNcbiAgICAgICAgICAgIC5jbG9zZVBhZ2UobmV3IGFuY2hvci5CTihpbmRleCkpXG4gICAgICAgICAgICAuYWNjb3VudHMoe1xuICAgICAgICAgICAgICAgIHF1ZXVlOiBxdWV1ZSxcbiAgICAgICAgICAgICAgICAvLyBwYWdlOiBwYWdlUGRhLCAvLyBBdXRvLXJlc29sdmVkXG4gICAgICAgICAgICAgICAgYXV0aG9yaXR5OiB0aGlzLnByb3ZpZGVyLndhbGxldC5wdWJsaWNLZXksXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnJwYyh0aGlzLmNvbmZpZy5jb25maXJtT3B0aW9ucyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBDbG9zZWQgUGFnZSAke2luZGV4fTogJHtwYWdlUGRhLnRvQmFzZTU4KCl9YCk7XG4gICAgICAgIHJldHVybiB0eDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbG9zZSBhIHF1ZXVlIGhlYWQgdG8gcmVjbGFpbSByZW50LlxuICAgICAqL1xuICAgIGFzeW5jIGNsb3NlUXVldWUocXVldWVJZDogc3RyaW5nKTogUHJvbWlzZTxUcmFuc2FjdGlvblNpZ25hdHVyZT4ge1xuICAgICAgICBjb25zdCBxdWV1ZVBkYSA9IGRlcml2ZVF1ZXVlUGRhKHRoaXMucHJvZ3JhbS5wcm9ncmFtSWQsIHRoaXMucHJvdmlkZXIud2FsbGV0LnB1YmxpY0tleSwgcXVldWVJZCk7XG4gICAgICAgIGNvbnN0IHR4ID0gYXdhaXQgdGhpcy5wcm9ncmFtLm1ldGhvZHNcbiAgICAgICAgICAgIC5jbG9zZVF1ZXVlKHF1ZXVlSWQpXG4gICAgICAgICAgICAuYWNjb3VudHMoe1xuICAgICAgICAgICAgICAgIC8vIHF1ZXVlOiBxdWV1ZVBkYSwgLy8gQXV0by1yZXNvbHZlZFxuICAgICAgICAgICAgICAgIGF1dGhvcml0eTogdGhpcy5wcm92aWRlci53YWxsZXQucHVibGljS2V5LFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5ycGModGhpcy5jb25maWcuY29uZmlybU9wdGlvbnMpO1xuICAgICAgICBjb25zb2xlLmxvZyhgQ2xvc2VkIFF1ZXVlOiAke3F1ZXVlUGRhLnRvQmFzZTU4KCl9YCk7XG4gICAgICAgIHJldHVybiB0eDtcbiAgICB9XG59XG4iXX0=