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
}
exports.MatchmakingAdmin = MatchmakingAdmin;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvYWRtaW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwwREFBNEM7QUFDNUMsOENBQWlFO0FBQ2pFLDZDQUEwRztBQUUxRyw0REFBOEI7QUFXOUIsU0FBUyxVQUFVLENBQUMsUUFBcUI7SUFDdkMsUUFBUSxRQUFRLEVBQUU7UUFDaEIsS0FBSyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNwQixLQUFLLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JCLEtBQUssS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckIsS0FBSyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztLQUN0QjtBQUNILENBQUM7QUFFRCxNQUFhLGdCQUFnQjtJQUkzQixZQUFZLFFBQXdCLEVBQUUsU0FBcUI7UUFDekQsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsTUFBTSxVQUFVLEdBQUcsU0FBUyxJQUFJLElBQUksbUJBQVMsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDO1FBRTlGLDBCQUEwQjtRQUMxQixNQUFNLFdBQVcsR0FBRyxFQUFFLEdBQUcsbUJBQUcsRUFBUyxDQUFDO1FBQ3RDLFdBQVcsQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxnQkFBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVELHNCQUFzQjtJQUN0QixXQUFXLENBQUMsU0FBb0I7UUFDOUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLG1CQUFTLENBQUMsc0JBQXNCLENBQzVDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsRUFDNUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQ3ZCLENBQUM7UUFDRixPQUFPLEdBQUcsQ0FBQztJQUNiLENBQUM7SUFFRCxZQUFZLENBQUMsU0FBb0I7UUFDL0IsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLG1CQUFTLENBQUMsc0JBQXNCLENBQzVDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsRUFDN0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQ3ZCLENBQUM7UUFDRixPQUFPLEdBQUcsQ0FBQztJQUNiLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxnQkFBZ0IsQ0FDcEIsZUFBMEIsRUFDMUIsT0FBaUMsRUFDakMsY0FBK0IsRUFDL0IsVUFBcUIsRUFBRTtRQUV2QixNQUFNLEVBQ0osU0FBUyxHQUFHLGVBQWUsRUFDM0IsU0FBUyxHQUFHLEdBQUcsRUFDZixTQUFTLEdBQUcsRUFBRSxFQUNkLFdBQVcsR0FBRyxLQUFLLEVBQ3BCLEdBQUcsT0FBTyxJQUFJLEVBQUUsQ0FBQztRQUVsQixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDeEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUvQyxPQUFPLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPO2FBQzlCLGdCQUFnQixDQUNmLGVBQWUsRUFDZixTQUFTLEVBQ1QsT0FBTyxFQUNQLElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FDekI7YUFDQSxlQUFlLENBQUM7WUFDZixNQUFNLEVBQUUsU0FBUztZQUNqQixTQUFTLEVBQUUsU0FBUztTQUNyQixDQUFDO2FBQ0QsT0FBTyxDQUFDLE9BQU8sQ0FBQzthQUNoQixHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGVBQWUsQ0FDbkIsU0FBb0IsRUFDcEIsTUFBaUIsRUFDakIsY0FBK0IsRUFDL0IsVUFBcUIsRUFBRTtRQUV2QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzdDLE9BQU8sTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU87YUFDOUIsZUFBZSxFQUFFO2FBQ2pCLGVBQWUsQ0FBQztZQUNmLEtBQUssRUFBRSxRQUFRO1lBQ2YsTUFBTSxFQUFFLE1BQU07WUFDZCxTQUFTLEVBQUUsU0FBUztTQUNyQixDQUFDO2FBQ0QsT0FBTyxDQUFDLE9BQU8sQ0FBQzthQUNoQixHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGFBQWEsQ0FDakIsU0FBb0IsRUFDcEIsWUFBdUIsSUFBSSxtQkFBUyxDQUFDLDhDQUE4QyxDQUFDLEVBQ3BGLGNBQStCLEVBQy9CLFVBQXFCLEVBQUU7UUFFckIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3QyxPQUFPLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPO2FBQzlCLGFBQWEsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFTLENBQUM7YUFDOUMsUUFBUSxDQUFDO1lBQ04sR0FBRyxFQUFFLFFBQVE7WUFDYixLQUFLLEVBQUUsU0FBUztZQUNoQixTQUFTLEVBQUUsU0FBUztTQUNoQixDQUFDO2FBQ1IsT0FBTyxDQUFDLE9BQU8sQ0FBQzthQUNoQixHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDM0IsQ0FBQztDQUNGO0FBM0dELDRDQTJHQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGFuY2hvciBmcm9tIFwiQGNvcmFsLXh5ei9hbmNob3JcIjtcbmltcG9ydCB7IFByb2dyYW0sIElkbCwgQW5jaG9yUHJvdmlkZXIgfSBmcm9tIFwiQGNvcmFsLXh5ei9hbmNob3JcIjtcbmltcG9ydCB7IFB1YmxpY0tleSwgU3lzdGVtUHJvZ3JhbSwgVHJhbnNhY3Rpb25TaWduYXR1cmUsIENvbmZpcm1PcHRpb25zLCBLZXlwYWlyIH0gZnJvbSBcIkBzb2xhbmEvd2ViMy5qc1wiO1xuaW1wb3J0IHsgRHVlbCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgSURMIGZyb20gXCIuL2R1ZWwuanNvblwiO1xuXG5leHBvcnQgdHlwZSBFbG9EYXRhVHlwZSA9ICd1OCcgfCAndTE2JyB8ICd1MzInIHwgJ3U2NCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5pdGlhbGl6ZVRlbmFudE9wdGlvbnMge1xuICBhdXRob3JpdHk/OiBQdWJsaWNLZXk7ICAgICAvLyBPcHRpb25hbCwgZGVmYXVsdHMgdG8gdGVuYW50UHJvZ3JhbUlkXG4gIGVsb1dpbmRvdz86IG51bWJlcjsgICAgICAgIC8vIERlZmF1bHQ6IDEwMFxuICBlbG9PZmZzZXQ/OiBudW1iZXI7ICAgICAgICAvLyBEZWZhdWx0OiA0MFxuICBlbG9EYXRhVHlwZT86IEVsb0RhdGFUeXBlOyAvLyBEZWZhdWx0OiAndTE2J1xufVxuXG5mdW5jdGlvbiBnZXRFbG9TaXplKGRhdGFUeXBlOiBFbG9EYXRhVHlwZSk6IG51bWJlciB7XG4gIHN3aXRjaCAoZGF0YVR5cGUpIHtcbiAgICBjYXNlICd1OCc6IHJldHVybiAxO1xuICAgIGNhc2UgJ3UxNic6IHJldHVybiAyO1xuICAgIGNhc2UgJ3UzMic6IHJldHVybiA0O1xuICAgIGNhc2UgJ3U2NCc6IHJldHVybiA4O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRjaG1ha2luZ0FkbWluIHtcbiAgcHJvZ3JhbTogUHJvZ3JhbTxEdWVsPjtcbiAgcHJvdmlkZXI6IEFuY2hvclByb3ZpZGVyO1xuXG4gIGNvbnN0cnVjdG9yKHByb3ZpZGVyOiBBbmNob3JQcm92aWRlciwgcHJvZ3JhbUlkPzogUHVibGljS2V5KSB7XG4gICAgdGhpcy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgIGNvbnN0IFBST0dSQU1fSUQgPSBwcm9ncmFtSWQgfHwgbmV3IFB1YmxpY0tleShcIkVkWnpVd0tkMVgyWldqeExQcHoxY3BFek1GN1JVWkM0M1BxNjR2MVZjSzVYXCIpO1xuICAgIFxuICAgIC8vIE92ZXJyaWRlIGFkZHJlc3MgaW4gSURMXG4gICAgY29uc3QgbW9kaWZpZWRJZGwgPSB7IC4uLklETCB9IGFzIGFueTtcbiAgICBtb2RpZmllZElkbC5hZGRyZXNzID0gUFJPR1JBTV9JRC50b0Jhc2U1OCgpO1xuICAgIFxuICAgIHRoaXMucHJvZ3JhbSA9IG5ldyBQcm9ncmFtKG1vZGlmaWVkSWRsLCB0aGlzLnByb3ZpZGVyKTtcbiAgfVxuXG4gIC8vIERlcml2ZSBQREFzIEhlbHBlcnNcbiAgZ2V0UXVldWVQZGEoYXV0aG9yaXR5OiBQdWJsaWNLZXkpOiBQdWJsaWNLZXkge1xuICAgIGNvbnN0IFtwZGFdID0gUHVibGljS2V5LmZpbmRQcm9ncmFtQWRkcmVzc1N5bmMoXG4gICAgICBbQnVmZmVyLmZyb20oXCJxdWV1ZVwiKSwgYXV0aG9yaXR5LnRvQnVmZmVyKCldLFxuICAgICAgdGhpcy5wcm9ncmFtLnByb2dyYW1JZFxuICAgICk7XG4gICAgcmV0dXJuIHBkYTtcbiAgfVxuXG4gIGdldFRlbmFudFBkYShhdXRob3JpdHk6IFB1YmxpY0tleSk6IFB1YmxpY0tleSB7XG4gICAgY29uc3QgW3BkYV0gPSBQdWJsaWNLZXkuZmluZFByb2dyYW1BZGRyZXNzU3luYyhcbiAgICAgIFtCdWZmZXIuZnJvbShcInRlbmFudFwiKSwgYXV0aG9yaXR5LnRvQnVmZmVyKCldLFxuICAgICAgdGhpcy5wcm9ncmFtLnByb2dyYW1JZFxuICAgICk7XG4gICAgcmV0dXJuIHBkYTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIGEgVGVuYW50XG4gICAqL1xuICBhc3luYyBpbml0aWFsaXplVGVuYW50KFxuICAgIHRlbmFudFByb2dyYW1JZDogUHVibGljS2V5LFxuICAgIG9wdGlvbnM/OiBJbml0aWFsaXplVGVuYW50T3B0aW9ucyxcbiAgICBjb25maXJtT3B0aW9ucz86IENvbmZpcm1PcHRpb25zLFxuICAgIHNpZ25lcnM6IEtleXBhaXJbXSA9IFtdXG4gICk6IFByb21pc2U8VHJhbnNhY3Rpb25TaWduYXR1cmU+IHtcbiAgICBjb25zdCB7XG4gICAgICBhdXRob3JpdHkgPSB0ZW5hbnRQcm9ncmFtSWQsXG4gICAgICBlbG9XaW5kb3cgPSAxMDAsXG4gICAgICBlbG9PZmZzZXQgPSA0MCxcbiAgICAgIGVsb0RhdGFUeXBlID0gJ3UxNidcbiAgICB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgICBcbiAgICBjb25zdCBlbG9TaXplID0gZ2V0RWxvU2l6ZShlbG9EYXRhVHlwZSk7XG4gICAgY29uc3QgdGVuYW50UGRhID0gdGhpcy5nZXRUZW5hbnRQZGEoYXV0aG9yaXR5KTtcbiAgICBcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9ncmFtLm1ldGhvZHNcbiAgICAgIC5pbml0aWFsaXplVGVuYW50KFxuICAgICAgICB0ZW5hbnRQcm9ncmFtSWQsXG4gICAgICAgIGVsb09mZnNldCxcbiAgICAgICAgZWxvU2l6ZSxcbiAgICAgICAgbmV3IGFuY2hvci5CTihlbG9XaW5kb3cpXG4gICAgICApXG4gICAgICAuYWNjb3VudHNQYXJ0aWFsKHtcbiAgICAgICAgdGVuYW50OiB0ZW5hbnRQZGEsXG4gICAgICAgIGF1dGhvcml0eTogYXV0aG9yaXR5LFxuICAgICAgfSlcbiAgICAgIC5zaWduZXJzKHNpZ25lcnMpXG4gICAgICAucnBjKGNvbmZpcm1PcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIGEgUXVldWVcbiAgICovXG4gIGFzeW5jIGluaXRpYWxpemVRdWV1ZShcbiAgICBhdXRob3JpdHk6IFB1YmxpY0tleSxcbiAgICB0ZW5hbnQ6IFB1YmxpY0tleSxcbiAgICBjb25maXJtT3B0aW9ucz86IENvbmZpcm1PcHRpb25zLFxuICAgIHNpZ25lcnM6IEtleXBhaXJbXSA9IFtdXG4gICk6IFByb21pc2U8VHJhbnNhY3Rpb25TaWduYXR1cmU+IHtcbiAgICBjb25zdCBxdWV1ZVBkYSA9IHRoaXMuZ2V0UXVldWVQZGEoYXV0aG9yaXR5KTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9ncmFtLm1ldGhvZHNcbiAgICAgIC5pbml0aWFsaXplUXVldWUoKVxuICAgICAgLmFjY291bnRzUGFydGlhbCh7XG4gICAgICAgIHF1ZXVlOiBxdWV1ZVBkYSxcbiAgICAgICAgdGVuYW50OiB0ZW5hbnQsXG4gICAgICAgIGF1dGhvcml0eTogYXV0aG9yaXR5LFxuICAgICAgfSlcbiAgICAgIC5zaWduZXJzKHNpZ25lcnMpXG4gICAgICAucnBjKGNvbmZpcm1PcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxlZ2F0ZSBRdWV1ZSB0byBURUVcbiAgICovXG4gIGFzeW5jIGRlbGVnYXRlUXVldWUoXG4gICAgYXV0aG9yaXR5OiBQdWJsaWNLZXksXG4gICAgdmFsaWRhdG9yOiBQdWJsaWNLZXkgPSBuZXcgUHVibGljS2V5KFwiRm5FNlZKVDVRTlpkZWRaUG5Db0xzQVJnQndvRTZEZUpOakJzMkgxZ3lTWEFcIiksXG4gICAgY29uZmlybU9wdGlvbnM/OiBDb25maXJtT3B0aW9ucyxcbiAgICBzaWduZXJzOiBLZXlwYWlyW10gPSBbXVxuICApOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgICBjb25zdCBxdWV1ZVBkYSA9IHRoaXMuZ2V0UXVldWVQZGEoYXV0aG9yaXR5KTtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnByb2dyYW0ubWV0aG9kc1xuICAgICAgICAuZGVsZWdhdGVRdWV1ZSh7IHF1ZXVlOiB7IGF1dGhvcml0eSB9IH0gYXMgYW55KVxuICAgICAgICAuYWNjb3VudHMoe1xuICAgICAgICAgICAgcGRhOiBxdWV1ZVBkYSxcbiAgICAgICAgICAgIHBheWVyOiBhdXRob3JpdHksXG4gICAgICAgICAgICB2YWxpZGF0b3I6IHZhbGlkYXRvcixcbiAgICAgICAgfSBhcyBhbnkpXG4gICAgICAgIC5zaWduZXJzKHNpZ25lcnMpXG4gICAgICAgIC5ycGMoY29uZmlybU9wdGlvbnMpO1xuICB9XG59XG5cbiJdfQ==