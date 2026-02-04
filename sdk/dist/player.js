"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingPlayer = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const duel_json_1 = __importDefault(require("./duel.json"));
class MatchmakingPlayer {
    constructor(provider, programId) {
        this.provider = provider;
        const PROGRAM_ID = programId || new web3_js_1.PublicKey("EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X");
        // Override address in IDL
        const modifiedIdl = { ...duel_json_1.default };
        modifiedIdl.address = PROGRAM_ID.toBase58();
        this.program = new anchor_1.Program(modifiedIdl, this.provider);
    }
    /**
     * Join Queue (TEE Aware)
     */
    async joinQueue(queue, tenant, playerData, confirmOptions, signers = []) {
        return await this.program.methods
            .joinQueue()
            .accountsPartial({
            queue: queue,
            tenant: tenant,
            playerData: playerData,
            signer: this.provider.publicKey,
        })
            .signers(signers)
            .rpc(confirmOptions);
    }
}
exports.MatchmakingPlayer = MatchmakingPlayer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3BsYXllci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSw4Q0FBaUU7QUFDakUsNkNBQTBHO0FBRTFHLDREQUE4QjtBQUU5QixNQUFhLGlCQUFpQjtJQUk1QixZQUFZLFFBQXdCLEVBQUUsU0FBcUI7UUFDekQsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsTUFBTSxVQUFVLEdBQUcsU0FBUyxJQUFJLElBQUksbUJBQVMsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDO1FBRTlGLDBCQUEwQjtRQUMxQixNQUFNLFdBQVcsR0FBRyxFQUFFLEdBQUcsbUJBQUcsRUFBUyxDQUFDO1FBQ3RDLFdBQVcsQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxnQkFBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFNBQVMsQ0FDYixLQUFnQixFQUNoQixNQUFpQixFQUNqQixVQUFxQixFQUNyQixjQUErQixFQUMvQixVQUFxQixFQUFFO1FBRXZCLE9BQU8sTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU87YUFDOUIsU0FBUyxFQUFFO2FBQ1gsZUFBZSxDQUFDO1lBQ2YsS0FBSyxFQUFFLEtBQUs7WUFDWixNQUFNLEVBQUUsTUFBTTtZQUNkLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLE1BQU0sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVM7U0FDaEMsQ0FBQzthQUNELE9BQU8sQ0FBQyxPQUFPLENBQUM7YUFDaEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7Q0FDRjtBQXBDRCw4Q0FvQ0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBhbmNob3IgZnJvbSBcIkBjb3JhbC14eXovYW5jaG9yXCI7XG5pbXBvcnQgeyBQcm9ncmFtLCBJZGwsIEFuY2hvclByb3ZpZGVyIH0gZnJvbSBcIkBjb3JhbC14eXovYW5jaG9yXCI7XG5pbXBvcnQgeyBQdWJsaWNLZXksIFN5c3RlbVByb2dyYW0sIFRyYW5zYWN0aW9uU2lnbmF0dXJlLCBDb25maXJtT3B0aW9ucywgS2V5cGFpciB9IGZyb20gXCJAc29sYW5hL3dlYjMuanNcIjtcbmltcG9ydCB7IER1ZWwgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IElETCBmcm9tIFwiLi9kdWVsLmpzb25cIjtcblxuZXhwb3J0IGNsYXNzIE1hdGNobWFraW5nUGxheWVyIHtcbiAgcHJvZ3JhbTogUHJvZ3JhbTxEdWVsPjtcbiAgcHJvdmlkZXI6IEFuY2hvclByb3ZpZGVyO1xuXG4gIGNvbnN0cnVjdG9yKHByb3ZpZGVyOiBBbmNob3JQcm92aWRlciwgcHJvZ3JhbUlkPzogUHVibGljS2V5KSB7XG4gICAgdGhpcy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgIGNvbnN0IFBST0dSQU1fSUQgPSBwcm9ncmFtSWQgfHwgbmV3IFB1YmxpY0tleShcIkVkWnpVd0tkMVgyWldqeExQcHoxY3BFek1GN1JVWkM0M1BxNjR2MVZjSzVYXCIpO1xuICAgIFxuICAgIC8vIE92ZXJyaWRlIGFkZHJlc3MgaW4gSURMXG4gICAgY29uc3QgbW9kaWZpZWRJZGwgPSB7IC4uLklETCB9IGFzIGFueTtcbiAgICBtb2RpZmllZElkbC5hZGRyZXNzID0gUFJPR1JBTV9JRC50b0Jhc2U1OCgpO1xuICAgIFxuICAgIHRoaXMucHJvZ3JhbSA9IG5ldyBQcm9ncmFtKG1vZGlmaWVkSWRsLCB0aGlzLnByb3ZpZGVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBKb2luIFF1ZXVlIChURUUgQXdhcmUpXG4gICAqL1xuICBhc3luYyBqb2luUXVldWUoXG4gICAgcXVldWU6IFB1YmxpY0tleSxcbiAgICB0ZW5hbnQ6IFB1YmxpY0tleSxcbiAgICBwbGF5ZXJEYXRhOiBQdWJsaWNLZXksXG4gICAgY29uZmlybU9wdGlvbnM/OiBDb25maXJtT3B0aW9ucyxcbiAgICBzaWduZXJzOiBLZXlwYWlyW10gPSBbXVxuICApOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvZ3JhbS5tZXRob2RzXG4gICAgICAuam9pblF1ZXVlKClcbiAgICAgIC5hY2NvdW50c1BhcnRpYWwoe1xuICAgICAgICBxdWV1ZTogcXVldWUsXG4gICAgICAgIHRlbmFudDogdGVuYW50LFxuICAgICAgICBwbGF5ZXJEYXRhOiBwbGF5ZXJEYXRhLFxuICAgICAgICBzaWduZXI6IHRoaXMucHJvdmlkZXIucHVibGljS2V5LFxuICAgICAgfSlcbiAgICAgIC5zaWduZXJzKHNpZ25lcnMpXG4gICAgICAucnBjKGNvbmZpcm1PcHRpb25zKTtcbiAgfVxufVxuIl19