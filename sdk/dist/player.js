"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingPlayer = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const private_matchmaking_json_1 = __importDefault(require("./private_matchmaking.json"));
class MatchmakingPlayer {
    constructor(provider, programId) {
        this.provider = provider;
        const PROGRAM_ID = programId || new web3_js_1.PublicKey("sUcFSbEig6ydu7ddNhb1dvRksqmC5eRuLxg77wK4PDz");
        // Override address in IDL
        const modifiedIdl = { ...private_matchmaking_json_1.default };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3BsYXllci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSw4Q0FBaUU7QUFDakUsNkNBQTBHO0FBRTFHLDBGQUE2QztBQUU3QyxNQUFhLGlCQUFpQjtJQUk1QixZQUFZLFFBQXdCLEVBQUUsU0FBcUI7UUFDekQsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsTUFBTSxVQUFVLEdBQUcsU0FBUyxJQUFJLElBQUksbUJBQVMsQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO1FBRTdGLDBCQUEwQjtRQUMxQixNQUFNLFdBQVcsR0FBRyxFQUFFLEdBQUcsa0NBQUcsRUFBUyxDQUFDO1FBQ3RDLFdBQVcsQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxnQkFBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFNBQVMsQ0FDYixLQUFnQixFQUNoQixNQUFpQixFQUNqQixVQUFxQixFQUNyQixjQUErQixFQUMvQixVQUFxQixFQUFFO1FBRXZCLE9BQU8sTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU87YUFDOUIsU0FBUyxFQUFFO2FBQ1gsZUFBZSxDQUFDO1lBQ2YsS0FBSyxFQUFFLEtBQUs7WUFDWixNQUFNLEVBQUUsTUFBTTtZQUNkLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLE1BQU0sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVM7U0FDaEMsQ0FBQzthQUNELE9BQU8sQ0FBQyxPQUFPLENBQUM7YUFDaEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7Q0FDRjtBQXBDRCw4Q0FvQ0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBhbmNob3IgZnJvbSBcIkBjb3JhbC14eXovYW5jaG9yXCI7XG5pbXBvcnQgeyBQcm9ncmFtLCBJZGwsIEFuY2hvclByb3ZpZGVyIH0gZnJvbSBcIkBjb3JhbC14eXovYW5jaG9yXCI7XG5pbXBvcnQgeyBQdWJsaWNLZXksIFN5c3RlbVByb2dyYW0sIFRyYW5zYWN0aW9uU2lnbmF0dXJlLCBDb25maXJtT3B0aW9ucywgS2V5cGFpciB9IGZyb20gXCJAc29sYW5hL3dlYjMuanNcIjtcbmltcG9ydCB7IFByaXZhdGVNYXRjaG1ha2luZyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgSURMIGZyb20gXCIuL3ByaXZhdGVfbWF0Y2htYWtpbmcuanNvblwiO1xuXG5leHBvcnQgY2xhc3MgTWF0Y2htYWtpbmdQbGF5ZXIge1xuICBwcm9ncmFtOiBQcm9ncmFtPFByaXZhdGVNYXRjaG1ha2luZz47XG4gIHByb3ZpZGVyOiBBbmNob3JQcm92aWRlcjtcblxuICBjb25zdHJ1Y3Rvcihwcm92aWRlcjogQW5jaG9yUHJvdmlkZXIsIHByb2dyYW1JZD86IFB1YmxpY0tleSkge1xuICAgIHRoaXMucHJvdmlkZXIgPSBwcm92aWRlcjtcbiAgICBjb25zdCBQUk9HUkFNX0lEID0gcHJvZ3JhbUlkIHx8IG5ldyBQdWJsaWNLZXkoXCJzVWNGU2JFaWc2eWR1N2RkTmhiMWR2UmtzcW1DNWVSdUx4Zzc3d0s0UER6XCIpO1xuICAgIFxuICAgIC8vIE92ZXJyaWRlIGFkZHJlc3MgaW4gSURMXG4gICAgY29uc3QgbW9kaWZpZWRJZGwgPSB7IC4uLklETCB9IGFzIGFueTtcbiAgICBtb2RpZmllZElkbC5hZGRyZXNzID0gUFJPR1JBTV9JRC50b0Jhc2U1OCgpO1xuICAgIFxuICAgIHRoaXMucHJvZ3JhbSA9IG5ldyBQcm9ncmFtKG1vZGlmaWVkSWRsLCB0aGlzLnByb3ZpZGVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBKb2luIFF1ZXVlIChURUUgQXdhcmUpXG4gICAqL1xuICBhc3luYyBqb2luUXVldWUoXG4gICAgcXVldWU6IFB1YmxpY0tleSxcbiAgICB0ZW5hbnQ6IFB1YmxpY0tleSxcbiAgICBwbGF5ZXJEYXRhOiBQdWJsaWNLZXksXG4gICAgY29uZmlybU9wdGlvbnM/OiBDb25maXJtT3B0aW9ucyxcbiAgICBzaWduZXJzOiBLZXlwYWlyW10gPSBbXVxuICApOiBQcm9taXNlPFRyYW5zYWN0aW9uU2lnbmF0dXJlPiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvZ3JhbS5tZXRob2RzXG4gICAgICAuam9pblF1ZXVlKClcbiAgICAgIC5hY2NvdW50c1BhcnRpYWwoe1xuICAgICAgICBxdWV1ZTogcXVldWUsXG4gICAgICAgIHRlbmFudDogdGVuYW50LFxuICAgICAgICBwbGF5ZXJEYXRhOiBwbGF5ZXJEYXRhLFxuICAgICAgICBzaWduZXI6IHRoaXMucHJvdmlkZXIucHVibGljS2V5LFxuICAgICAgfSlcbiAgICAgIC5zaWduZXJzKHNpZ25lcnMpXG4gICAgICAucnBjKGNvbmZpcm1PcHRpb25zKTtcbiAgfVxufVxuIl19