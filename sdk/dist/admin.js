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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvYWRtaW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwwREFBNEM7QUFDNUMsOENBQWlFO0FBQ2pFLDZDQUEwRztBQUUxRyw0REFBOEI7QUFFOUIsTUFBYSxnQkFBZ0I7SUFJM0IsWUFBWSxRQUF3QixFQUFFLFNBQXFCO1FBQ3pELElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLE1BQU0sVUFBVSxHQUFHLFNBQVMsSUFBSSxJQUFJLG1CQUFTLENBQUMsOENBQThDLENBQUMsQ0FBQztRQUU5RiwwQkFBMEI7UUFDMUIsTUFBTSxXQUFXLEdBQUcsRUFBRSxHQUFHLG1CQUFHLEVBQVMsQ0FBQztRQUN0QyxXQUFXLENBQUMsT0FBTyxHQUFHLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUU1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksZ0JBQU8sQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFRCxzQkFBc0I7SUFDdEIsV0FBVyxDQUFDLFNBQW9CO1FBQzlCLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxtQkFBUyxDQUFDLHNCQUFzQixDQUM1QyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQzVDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUN2QixDQUFDO1FBQ0YsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRUQsWUFBWSxDQUFDLFNBQW9CO1FBQy9CLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxtQkFBUyxDQUFDLHNCQUFzQixDQUM1QyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQzdDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUN2QixDQUFDO1FBQ0YsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsZ0JBQWdCLENBQ3BCLFNBQW9CLEVBQ3BCLGVBQTBCLEVBQzFCLFlBQW9CLEdBQUcsRUFDdkIsWUFBb0IsQ0FBQyxHQUFHLEVBQUUsRUFDMUIsY0FBK0IsRUFDL0IsVUFBcUIsRUFBRTtRQUV2QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQy9DLE9BQU8sTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU87YUFDOUIsZ0JBQWdCLENBQ2YsZUFBZSxFQUNmLFNBQVMsRUFDVCxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQ3pCO2FBQ0EsZUFBZSxDQUFDO1lBQ2YsTUFBTSxFQUFFLFNBQVM7WUFDakIsU0FBUyxFQUFFLFNBQVM7U0FDckIsQ0FBQzthQUNELE9BQU8sQ0FBQyxPQUFPLENBQUM7YUFDaEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxlQUFlLENBQ25CLFNBQW9CLEVBQ3BCLE1BQWlCLEVBQ2pCLGNBQStCLEVBQy9CLFVBQXFCLEVBQUU7UUFFdkIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3QyxPQUFPLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPO2FBQzlCLGVBQWUsRUFBRTthQUNqQixlQUFlLENBQUM7WUFDZixLQUFLLEVBQUUsUUFBUTtZQUNmLE1BQU0sRUFBRSxNQUFNO1lBQ2QsU0FBUyxFQUFFLFNBQVM7U0FDckIsQ0FBQzthQUNELE9BQU8sQ0FBQyxPQUFPLENBQUM7YUFDaEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxhQUFhLENBQ2pCLFNBQW9CLEVBQ3BCLFlBQXVCLElBQUksbUJBQVMsQ0FBQyw4Q0FBOEMsQ0FBQyxFQUNwRixjQUErQixFQUMvQixVQUFxQixFQUFFO1FBRXJCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDN0MsT0FBTyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTzthQUM5QixhQUFhLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxTQUFTLEVBQUUsRUFBUyxDQUFDO2FBQzlDLFFBQVEsQ0FBQztZQUNOLEdBQUcsRUFBRSxRQUFRO1lBQ2IsS0FBSyxFQUFFLFNBQVM7WUFDaEIsU0FBUyxFQUFFLFNBQVM7U0FDaEIsQ0FBQzthQUNSLE9BQU8sQ0FBQyxPQUFPLENBQUM7YUFDaEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxZQUFZLENBQ2hCLEtBQWdCLEVBQ2hCLE1BQWlCLEVBQ2pCLGNBQStCLEVBQy9CLFVBQXFCLEVBQUUsQ0FBQyx5Q0FBeUM7O1FBRWpFLE9BQU8sTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU87YUFDOUIsWUFBWSxFQUFFO2FBQ2QsZUFBZSxDQUFDO1lBQ2YsS0FBSyxFQUFFLEtBQUs7WUFDWixNQUFNLEVBQUUsTUFBTTtTQUNmLENBQUM7YUFDRCxPQUFPLENBQUMsT0FBTyxDQUFDO2FBQ2hCLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUN6QixDQUFDO0NBQ0Y7QUF0SEQsNENBc0hDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgYW5jaG9yIGZyb20gXCJAY29yYWwteHl6L2FuY2hvclwiO1xuaW1wb3J0IHsgUHJvZ3JhbSwgSWRsLCBBbmNob3JQcm92aWRlciB9IGZyb20gXCJAY29yYWwteHl6L2FuY2hvclwiO1xuaW1wb3J0IHsgUHVibGljS2V5LCBTeXN0ZW1Qcm9ncmFtLCBUcmFuc2FjdGlvblNpZ25hdHVyZSwgQ29uZmlybU9wdGlvbnMsIEtleXBhaXIgfSBmcm9tIFwiQHNvbGFuYS93ZWIzLmpzXCI7XG5pbXBvcnQgeyBEdWVsIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCBJREwgZnJvbSBcIi4vZHVlbC5qc29uXCI7XG5cbmV4cG9ydCBjbGFzcyBNYXRjaG1ha2luZ0FkbWluIHtcbiAgcHJvZ3JhbTogUHJvZ3JhbTxEdWVsPjtcbiAgcHJvdmlkZXI6IEFuY2hvclByb3ZpZGVyO1xuXG4gIGNvbnN0cnVjdG9yKHByb3ZpZGVyOiBBbmNob3JQcm92aWRlciwgcHJvZ3JhbUlkPzogUHVibGljS2V5KSB7XG4gICAgdGhpcy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgIGNvbnN0IFBST0dSQU1fSUQgPSBwcm9ncmFtSWQgfHwgbmV3IFB1YmxpY0tleShcIkVkWnpVd0tkMVgyWldqeExQcHoxY3BFek1GN1JVWkM0M1BxNjR2MVZjSzVYXCIpO1xuICAgIFxuICAgIC8vIE92ZXJyaWRlIGFkZHJlc3MgaW4gSURMXG4gICAgY29uc3QgbW9kaWZpZWRJZGwgPSB7IC4uLklETCB9IGFzIGFueTtcbiAgICBtb2RpZmllZElkbC5hZGRyZXNzID0gUFJPR1JBTV9JRC50b0Jhc2U1OCgpO1xuICAgIFxuICAgIHRoaXMucHJvZ3JhbSA9IG5ldyBQcm9ncmFtKG1vZGlmaWVkSWRsLCB0aGlzLnByb3ZpZGVyKTtcbiAgfVxuXG4gIC8vIERlcml2ZSBQREFzIEhlbHBlcnNcbiAgZ2V0UXVldWVQZGEoYXV0aG9yaXR5OiBQdWJsaWNLZXkpOiBQdWJsaWNLZXkge1xuICAgIGNvbnN0IFtwZGFdID0gUHVibGljS2V5LmZpbmRQcm9ncmFtQWRkcmVzc1N5bmMoXG4gICAgICBbQnVmZmVyLmZyb20oXCJxdWV1ZVwiKSwgYXV0aG9yaXR5LnRvQnVmZmVyKCldLFxuICAgICAgdGhpcy5wcm9ncmFtLnByb2dyYW1JZFxuICAgICk7XG4gICAgcmV0dXJuIHBkYTtcbiAgfVxuXG4gIGdldFRlbmFudFBkYShhdXRob3JpdHk6IFB1YmxpY0tleSk6IFB1YmxpY0tleSB7XG4gICAgY29uc3QgW3BkYV0gPSBQdWJsaWNLZXkuZmluZFByb2dyYW1BZGRyZXNzU3luYyhcbiAgICAgIFtCdWZmZXIuZnJvbShcInRlbmFudFwiKSwgYXV0aG9yaXR5LnRvQnVmZmVyKCldLFxuICAgICAgdGhpcy5wcm9ncmFtLnByb2dyYW1JZFxuICAgICk7XG4gICAgcmV0dXJuIHBkYTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIGEgVGVuYW50XG4gICAqL1xuICBhc3luYyBpbml0aWFsaXplVGVuYW50KFxuICAgIGF1dGhvcml0eTogUHVibGljS2V5LFxuICAgIHRlbmFudFByb2dyYW1JZDogUHVibGljS2V5LFxuICAgIGVsb1dpbmRvdzogbnVtYmVyID0gMTAwLFxuICAgIGVsb09mZnNldDogbnVtYmVyID0gOCArIDMyLFxuICAgIGNvbmZpcm1PcHRpb25zPzogQ29uZmlybU9wdGlvbnMsXG4gICAgc2lnbmVyczogS2V5cGFpcltdID0gW11cbiAgKTogUHJvbWlzZTxUcmFuc2FjdGlvblNpZ25hdHVyZT4ge1xuICAgIGNvbnN0IHRlbmFudFBkYSA9IHRoaXMuZ2V0VGVuYW50UGRhKGF1dGhvcml0eSk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvZ3JhbS5tZXRob2RzXG4gICAgICAuaW5pdGlhbGl6ZVRlbmFudChcbiAgICAgICAgdGVuYW50UHJvZ3JhbUlkLFxuICAgICAgICBlbG9PZmZzZXQsXG4gICAgICAgIG5ldyBhbmNob3IuQk4oZWxvV2luZG93KVxuICAgICAgKVxuICAgICAgLmFjY291bnRzUGFydGlhbCh7XG4gICAgICAgIHRlbmFudDogdGVuYW50UGRhLFxuICAgICAgICBhdXRob3JpdHk6IGF1dGhvcml0eSxcbiAgICAgIH0pXG4gICAgICAuc2lnbmVycyhzaWduZXJzKVxuICAgICAgLnJwYyhjb25maXJtT3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZSBhIFF1ZXVlXG4gICAqL1xuICBhc3luYyBpbml0aWFsaXplUXVldWUoXG4gICAgYXV0aG9yaXR5OiBQdWJsaWNLZXksXG4gICAgdGVuYW50OiBQdWJsaWNLZXksXG4gICAgY29uZmlybU9wdGlvbnM/OiBDb25maXJtT3B0aW9ucyxcbiAgICBzaWduZXJzOiBLZXlwYWlyW10gPSBbXVxuICApOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgY29uc3QgcXVldWVQZGEgPSB0aGlzLmdldFF1ZXVlUGRhKGF1dGhvcml0eSk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvZ3JhbS5tZXRob2RzXG4gICAgICAuaW5pdGlhbGl6ZVF1ZXVlKClcbiAgICAgIC5hY2NvdW50c1BhcnRpYWwoe1xuICAgICAgICBxdWV1ZTogcXVldWVQZGEsXG4gICAgICAgIHRlbmFudDogdGVuYW50LFxuICAgICAgICBhdXRob3JpdHk6IGF1dGhvcml0eSxcbiAgICAgIH0pXG4gICAgICAuc2lnbmVycyhzaWduZXJzKVxuICAgICAgLnJwYyhjb25maXJtT3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogRGVsZWdhdGUgUXVldWUgdG8gVEVFXG4gICAqL1xuICBhc3luYyBkZWxlZ2F0ZVF1ZXVlKFxuICAgIGF1dGhvcml0eTogUHVibGljS2V5LFxuICAgIHZhbGlkYXRvcjogUHVibGljS2V5ID0gbmV3IFB1YmxpY0tleShcIkZuRTZWSlQ1UU5aZGVkWlBuQ29Mc0FSZ0J3b0U2RGVKTmpCczJIMWd5U1hBXCIpLFxuICAgIGNvbmZpcm1PcHRpb25zPzogQ29uZmlybU9wdGlvbnMsXG4gICAgc2lnbmVyczogS2V5cGFpcltdID0gW11cbiAgKTogUHJvbWlzZTxUcmFuc2FjdGlvblNpZ25hdHVyZT4ge1xuICAgICAgY29uc3QgcXVldWVQZGEgPSB0aGlzLmdldFF1ZXVlUGRhKGF1dGhvcml0eSk7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9ncmFtLm1ldGhvZHNcbiAgICAgICAgLmRlbGVnYXRlUXVldWUoeyBxdWV1ZTogeyBhdXRob3JpdHkgfSB9IGFzIGFueSlcbiAgICAgICAgLmFjY291bnRzKHtcbiAgICAgICAgICAgIHBkYTogcXVldWVQZGEsXG4gICAgICAgICAgICBwYXllcjogYXV0aG9yaXR5LFxuICAgICAgICAgICAgdmFsaWRhdG9yOiB2YWxpZGF0b3IsXG4gICAgICAgIH0gYXMgYW55KVxuICAgICAgICAuc2lnbmVycyhzaWduZXJzKVxuICAgICAgICAucnBjKGNvbmZpcm1PcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIE1hdGNoIChBZG1pbi9NYWludGVuYW5jZSlcbiAgICovXG4gIGFzeW5jIHByb2Nlc3NNYXRjaChcbiAgICBxdWV1ZTogUHVibGljS2V5LFxuICAgIHRlbmFudDogUHVibGljS2V5LFxuICAgIGNvbmZpcm1PcHRpb25zPzogQ29uZmlybU9wdGlvbnMsXG4gICAgc2lnbmVyczogS2V5cGFpcltdID0gW10gLy8gQWRtaW4gbWlnaHQgc2lnbiBpZiBhdXRob3JpdHkgcmVxdWlyZWRcbiAgKTogUHJvbWlzZTxUcmFuc2FjdGlvblNpZ25hdHVyZT4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnByb2dyYW0ubWV0aG9kc1xuICAgICAgLnByb2Nlc3NNYXRjaCgpXG4gICAgICAuYWNjb3VudHNQYXJ0aWFsKHtcbiAgICAgICAgcXVldWU6IHF1ZXVlLFxuICAgICAgICB0ZW5hbnQ6IHRlbmFudCxcbiAgICAgIH0pXG4gICAgICAuc2lnbmVycyhzaWduZXJzKVxuICAgICAgLnJwYyhjb25maXJtT3B0aW9ucyk7XG4gIH1cbn1cbiJdfQ==