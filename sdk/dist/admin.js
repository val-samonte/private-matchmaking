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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingAdmin = void 0;
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const duel_json_1 = __importDefault(require("./duel.json"));
function getEloSize(dataType) {
    switch (dataType) {
        case 'u8': return 1;
        case 'u16': return 2;
        case 'u32': return 4;
        case 'u64': return 8;
    }
}
class MatchmakingAdmin {
    constructor(provider, programId) {
        this.provider = provider;
        const PROGRAM_ID = programId || new web3_js_1.PublicKey("EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X");
        // Override address in IDL
        const modifiedIdl = { ...duel_json_1.default };
        modifiedIdl.address = PROGRAM_ID.toBase58();
        this.program = new anchor_1.Program(modifiedIdl, this.provider);
    }
    // Derive PDAs Helpers
    getQueuePda(authority) {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("queue"), authority.toBuffer()], this.program.programId);
        return pda;
    }
    getTenantPda(authority) {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("tenant"), authority.toBuffer()], this.program.programId);
        return pda;
    }
    /**
     * Initialize a Tenant
     */
    async initializeTenant(tenantProgramId, options, confirmOptions, signers = []) {
        const { authority = tenantProgramId, eloWindow = 100, eloOffset = 40, eloDataType = 'u16' } = options || {};
        const eloSize = getEloSize(eloDataType);
        const tenantPda = this.getTenantPda(authority);
        return await this.program.methods
            .initializeTenant(tenantProgramId, eloOffset, eloSize, new anchor.BN(eloWindow))
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
    async delegateQueue(authority, validator = new web3_js_1.PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"), confirmOptions, signers = []) {
        const queuePda = this.getQueuePda(authority);
        return await this.program.methods
            .delegateQueue({ queue: { authority } })
            .accounts({
            pda: queuePda,
            payer: authority,
            validator: validator,
        })
            .signers(signers)
            .rpc(confirmOptions);
    }
    /**
     * Process Match (Admin/Maintenance)
     */
    async processMatch(queue, tenant, confirmOptions, signers = [] // Admin might sign if authority required
    ) {
        return await this.program.methods
            .processMatch()
            .accountsPartial({
            queue: queue,
            tenant: tenant,
        })
            .signers(signers)
            .rpc(confirmOptions);
    }
}
exports.MatchmakingAdmin = MatchmakingAdmin;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvYWRtaW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwwREFBNEM7QUFDNUMsOENBQWlFO0FBQ2pFLDZDQUEwRztBQUUxRyw0REFBOEI7QUFXOUIsU0FBUyxVQUFVLENBQUMsUUFBcUI7SUFDdkMsUUFBUSxRQUFRLEVBQUU7UUFDaEIsS0FBSyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNwQixLQUFLLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JCLEtBQUssS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckIsS0FBSyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztLQUN0QjtBQUNILENBQUM7QUFFRCxNQUFhLGdCQUFnQjtJQUkzQixZQUFZLFFBQXdCLEVBQUUsU0FBcUI7UUFDekQsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsTUFBTSxVQUFVLEdBQUcsU0FBUyxJQUFJLElBQUksbUJBQVMsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDO1FBRTlGLDBCQUEwQjtRQUMxQixNQUFNLFdBQVcsR0FBRyxFQUFFLEdBQUcsbUJBQUcsRUFBUyxDQUFDO1FBQ3RDLFdBQVcsQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxnQkFBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVELHNCQUFzQjtJQUN0QixXQUFXLENBQUMsU0FBb0I7UUFDOUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLG1CQUFTLENBQUMsc0JBQXNCLENBQzVDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFF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LENBQUM7WUFDZixLQUFLLEVBQUUsS0FBSztZQUNaLE1BQU0sRUFBRSxNQUFNO1NBQ2YsQ0FBQzthQUNELE9BQU8sQ0FBQyxPQUFPLENBQUM7YUFDaEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7Q0FDRjtBQTlIRCw0Q0E4SEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBhbmNob3IgZnJvbSBcIkBjb3JhbC14eXovYW5jaG9yXCI7XG5pbXBvcnQgeyBQcm9ncmFtLCBJZGwsIEFuY2hvclByb3ZpZGVyIH0gZnJvbSBcIkBjb3JhbC14eXovYW5jaG9yXCI7XG5pbXBvcnQgeyBQdWJsaWNLZXksIFN5c3RlbVByb2dyYW0sIFRyYW5zYWN0aW9uU2lnbmF0dXJlLCBDb25maXJtT3B0aW9ucywgS2V5cGFpciB9IGZyb20gXCJAc29sYW5hL3dlYjMuanNcIjtcbmltcG9ydCB7IER1ZWwgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IElETCBmcm9tIFwiLi9kdWVsLmpzb25cIjtcblxuZXhwb3J0IHR5cGUgRWxvRGF0YVR5cGUgPSAndTgnIHwgJ3UxNicgfCAndTMyJyB8ICd1NjQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEluaXRpYWxpemVUZW5hbnRPcHRpb25zIHtcbiAgYXV0aG9yaXR5PzogUHVibGljS2V5OyAgICAgLy8gT3B0aW9uYWwsIGRlZmF1bHRzIHRvIHRlbmFudFByb2dyYW1JZFxuICBlbG9XaW5kb3c/OiBudW1iZXI7ICAgICAgICAvLyBEZWZhdWx0OiAxMDBcbiAgZWxvT2Zmc2V0PzogbnVtYmVyOyAgICAgICAgLy8gRGVmYXVsdDogNDBcbiAgZWxvRGF0YVR5cGU/OiBFbG9EYXRhVHlwZTsgLy8gRGVmYXVsdDogJ3UxNidcbn1cblxuZnVuY3Rpb24gZ2V0RWxvU2l6ZShkYXRhVHlwZTogRWxvRGF0YVR5cGUpOiBudW1iZXIge1xuICBzd2l0Y2ggKGRhdGFUeXBlKSB7XG4gICAgY2FzZSAndTgnOiByZXR1cm4gMTtcbiAgICBjYXNlICd1MTYnOiByZXR1cm4gMjtcbiAgICBjYXNlICd1MzInOiByZXR1cm4gNDtcbiAgICBjYXNlICd1NjQnOiByZXR1cm4gODtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTWF0Y2htYWtpbmdBZG1pbiB7XG4gIHByb2dyYW06IFByb2dyYW08RHVlbD47XG4gIHByb3ZpZGVyOiBBbmNob3JQcm92aWRlcjtcblxuICBjb25zdHJ1Y3Rvcihwcm92aWRlcjogQW5jaG9yUHJvdmlkZXIsIHByb2dyYW1JZD86IFB1YmxpY0tleSkge1xuICAgIHRoaXMucHJvdmlkZXIgPSBwcm92aWRlcjtcbiAgICBjb25zdCBQUk9HUkFNX0lEID0gcHJvZ3JhbUlkIHx8IG5ldyBQdWJsaWNLZXkoXCJFZFp6VXdLZDFYMlpXanhMUHB6MWNwRXpNRjdSVVpDNDNQcTY0djFWY0s1WFwiKTtcbiAgICBcbiAgICAvLyBPdmVycmlkZSBhZGRyZXNzIGluIElETFxuICAgIGNvbnN0IG1vZGlmaWVkSWRsID0geyAuLi5JREwgfSBhcyBhbnk7XG4gICAgbW9kaWZpZWRJZGwuYWRkcmVzcyA9IFBST0dSQU1fSUQudG9CYXNlNTgoKTtcbiAgICBcbiAgICB0aGlzLnByb2dyYW0gPSBuZXcgUHJvZ3JhbShtb2RpZmllZElkbCwgdGhpcy5wcm92aWRlcik7XG4gIH1cblxuICAvLyBEZXJpdmUgUERBcyBIZWxwZXJzXG4gIGdldFF1ZXVlUGRhKGF1dGhvcml0eTogUHVibGljS2V5KTogUHVibGljS2V5IHtcbiAgICBjb25zdCBbcGRhXSA9IFB1YmxpY0tleS5maW5kUHJvZ3JhbUFkZHJlc3NTeW5jKFxuICAgICAgW0J1ZmZlci5mcm9tKFwicXVldWVcIiksIGF1dGhvcml0eS50b0J1ZmZlcigpXSxcbiAgICAgIHRoaXMucHJvZ3JhbS5wcm9ncmFtSWRcbiAgICApO1xuICAgIHJldHVybiBwZGE7XG4gIH1cblxuICBnZXRUZW5hbnRQZGEoYXV0aG9yaXR5OiBQdWJsaWNLZXkpOiBQdWJsaWNLZXkge1xuICAgIGNvbnN0IFtwZGFdID0gUHVibGljS2V5LmZpbmRQcm9ncmFtQWRkcmVzc1N5bmMoXG4gICAgICBbQnVmZmVyLmZyb20oXCJ0ZW5hbnRcIiksIGF1dGhvcml0eS50b0J1ZmZlcigpXSxcbiAgICAgIHRoaXMucHJvZ3JhbS5wcm9ncmFtSWRcbiAgICApO1xuICAgIHJldHVybiBwZGE7XG4gIH1cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZSBhIFRlbmFudFxuICAgKi9cbiAgYXN5bmMgaW5pdGlhbGl6ZVRlbmFudChcbiAgICB0ZW5hbnRQcm9ncmFtSWQ6IFB1YmxpY0tleSxcbiAgICBvcHRpb25zPzogSW5pdGlhbGl6ZVRlbmFudE9wdGlvbnMsXG4gICAgY29uZmlybU9wdGlvbnM/OiBDb25maXJtT3B0aW9ucyxcbiAgICBzaWduZXJzOiBLZXlwYWlyW10gPSBbXVxuICApOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgY29uc3Qge1xuICAgICAgYXV0aG9yaXR5ID0gdGVuYW50UHJvZ3JhbUlkLFxuICAgICAgZWxvV2luZG93ID0gMTAwLFxuICAgICAgZWxvT2Zmc2V0ID0gNDAsXG4gICAgICBlbG9EYXRhVHlwZSA9ICd1MTYnXG4gICAgfSA9IG9wdGlvbnMgfHwge307XG4gICAgXG4gICAgY29uc3QgZWxvU2l6ZSA9IGdldEVsb1NpemUoZWxvRGF0YVR5cGUpO1xuICAgIGNvbnN0IHRlbmFudFBkYSA9IHRoaXMuZ2V0VGVuYW50UGRhKGF1dGhvcml0eSk7XG4gICAgXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvZ3JhbS5tZXRob2RzXG4gICAgICAuaW5pdGlhbGl6ZVRlbmFudChcbiAgICAgICAgdGVuYW50UHJvZ3JhbUlkLFxuICAgICAgICBlbG9PZmZzZXQsXG4gICAgICAgIGVsb1NpemUsXG4gICAgICAgIG5ldyBhbmNob3IuQk4oZWxvV2luZG93KVxuICAgICAgKVxuICAgICAgLmFjY291bnRzUGFydGlhbCh7XG4gICAgICAgIHRlbmFudDogdGVuYW50UGRhLFxuICAgICAgICBhdXRob3JpdHk6IGF1dGhvcml0eSxcbiAgICAgIH0pXG4gICAgICAuc2lnbmVycyhzaWduZXJzKVxuICAgICAgLnJwYyhjb25maXJtT3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZSBhIFF1ZXVlXG4gICAqL1xuICBhc3luYyBpbml0aWFsaXplUXVldWUoXG4gICAgYXV0aG9yaXR5OiBQdWJsaWNLZXksXG4gICAgdGVuYW50OiBQdWJsaWNLZXksXG4gICAgY29uZmlybU9wdGlvbnM/OiBDb25maXJtT3B0aW9ucyxcbiAgICBzaWduZXJzOiBLZXlwYWlyW10gPSBbXVxuICApOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgY29uc3QgcXVldWVQZGEgPSB0aGlzLmdldFF1ZXVlUGRhKGF1dGhvcml0eSk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvZ3JhbS5tZXRob2RzXG4gICAgICAuaW5pdGlhbGl6ZVF1ZXVlKClcbiAgICAgIC5hY2NvdW50c1BhcnRpYWwoe1xuICAgICAgICBxdWV1ZTogcXVldWVQZGEsXG4gICAgICAgIHRlbmFudDogdGVuYW50LFxuICAgICAgICBhdXRob3JpdHk6IGF1dGhvcml0eSxcbiAgICAgIH0pXG4gICAgICAuc2lnbmVycyhzaWduZXJzKVxuICAgICAgLnJwYyhjb25maXJtT3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogRGVsZWdhdGUgUXVldWUgdG8gVEVFXG4gICAqL1xuICBhc3luYyBkZWxlZ2F0ZVF1ZXVlKFxuICAgIGF1dGhvcml0eTogUHVibGljS2V5LFxuICAgIHZhbGlkYXRvcjogUHVibGljS2V5ID0gbmV3IFB1YmxpY0tleShcIkZuRTZWSlQ1UU5aZGVkWlBuQ29Mc0FSZ0J3b0U2RGVKTmpCczJIMWd5U1hBXCIpLFxuICAgIGNvbmZpcm1PcHRpb25zPzogQ29uZmlybU9wdGlvbnMsXG4gICAgc2lnbmVyczogS2V5cGFpcltdID0gW11cbiAgKTogUHJvbWlzZTxUcmFuc2FjdGlvblNpZ25hdHVyZT4ge1xuICAgICAgY29uc3QgcXVldWVQZGEgPSB0aGlzLmdldFF1ZXVlUGRhKGF1dGhvcml0eSk7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9ncmFtLm1ldGhvZHNcbiAgICAgICAgLmRlbGVnYXRlUXVldWUoeyBxdWV1ZTogeyBhdXRob3JpdHkgfSB9IGFzIGFueSlcbiAgICAgICAgLmFjY291bnRzKHtcbiAgICAgICAgICAgIHBkYTogcXVldWVQZGEsXG4gICAgICAgICAgICBwYXllcjogYXV0aG9yaXR5LFxuICAgICAgICAgICAgdmFsaWRhdG9yOiB2YWxpZGF0b3IsXG4gICAgICAgIH0gYXMgYW55KVxuICAgICAgICAuc2lnbmVycyhzaWduZXJzKVxuICAgICAgICAucnBjKGNvbmZpcm1PcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIE1hdGNoIChBZG1pbi9NYWludGVuYW5jZSlcbiAgICovXG4gIGFzeW5jIHByb2Nlc3NNYXRjaChcbiAgICBxdWV1ZTogUHVibGljS2V5LFxuICAgIHRlbmFudDogUHVibGljS2V5LFxuICAgIGNvbmZpcm1PcHRpb25zPzogQ29uZmlybU9wdGlvbnMsXG4gICAgc2lnbmVyczogS2V5cGFpcltdID0gW10gLy8gQWRtaW4gbWlnaHQgc2lnbiBpZiBhdXRob3JpdHkgcmVxdWlyZWRcbiAgKTogUHJvbWlzZTxUcmFuc2FjdGlvblNpZ25hdHVyZT4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnByb2dyYW0ubWV0aG9kc1xuICAgICAgLnByb2Nlc3NNYXRjaCgpXG4gICAgICAuYWNjb3VudHNQYXJ0aWFsKHtcbiAgICAgICAgcXVldWU6IHF1ZXVlLFxuICAgICAgICB0ZW5hbnQ6IHRlbmFudCxcbiAgICAgIH0pXG4gICAgICAuc2lnbmVycyhzaWduZXJzKVxuICAgICAgLnJwYyhjb25maXJtT3B0aW9ucyk7XG4gIH1cbn1cbiJdfQ==