import { getBase58Decoder, createSignableMessage, } from "@solana/kit";
/**
 * Authenticate with the MagicBlock TEE via challenge-sign flow.
 */
export async function getAuthToken(rpcUrl, signer) {
    const challengeRes = await fetch(`${rpcUrl}/auth/challenge?pubkey=${signer.address}`);
    if (!challengeRes.ok) {
        throw new Error(`TEE challenge failed: ${challengeRes.statusText}`);
    }
    const { challenge } = (await challengeRes.json());
    const challengeBytes = new TextEncoder().encode(challenge);
    const [sigDict] = await signer.signMessages([createSignableMessage(challengeBytes)]);
    const signature = sigDict[signer.address];
    const signatureString = getBase58Decoder().decode(signature);
    const tokenRes = await fetch(`${rpcUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            pubkey: signer.address,
            challenge,
            signature: signatureString,
        }),
    });
    const authJson = (await tokenRes.json());
    if (tokenRes.status !== 200) {
        throw new Error(`Failed to authenticate: ${authJson.error}`);
    }
    const expiresAt = authJson.expiresAt ?? Date.now() + 1000 * 60 * 60 * 24 * 30;
    return { token: authJson.token, expiresAt };
}
/**
 * Poll the TEE /permission endpoint until the given PDA shows delegation is active.
 *
 * IMPORTANT: `authorizedUsers` is only populated for PER-group delegation. For
 * DELeGG-based delegation (what this project uses), this function logs the full
 * response on timeout so we can identify the correct field. It does NOT throw on
 * timeout — the TEE operation itself is the real failure signal.
 *
 * The /permission endpoint is always called WITHOUT the auth token.
 * /permission?token=JWT&pubkey=PDA returns per-user access (always empty unless
 * explicitly granted via PER groups), not global delegation activation status.
 */
export async function waitUntilPermissionActive(teeUrlWithToken, pda, timeoutMs = 15000) {
    // Always strip the token — /permission?pubkey=PDA is the correct global check
    const [baseUrl] = teeUrlWithToken.replace("/?", "?").split("?");
    const permissionUrl = `${baseUrl}/permission?pubkey=${pda}`;
    const start = Date.now();
    let lastResponse = null;
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(permissionUrl);
            if (res.ok) {
                const json = (await res.json());
                lastResponse = json;
                const { authorizedUsers } = json;
                if (authorizedUsers && authorizedUsers.length > 0) {
                    console.log(`[TEE] ${pda.slice(0, 16)}... delegation active`);
                    return true;
                }
            }
        }
        catch {
            // ignore transient errors, keep polling
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    // Warn with full response to diagnose which field to check for DELeGG delegation
    console.warn(`[TEE] ${pda.slice(0, 16)}... not confirmed after ${timeoutMs}ms. /permission response: ${JSON.stringify(lastResponse)}`);
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3RlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsZ0JBQWdCLEVBQ2hCLHFCQUFxQixHQUd0QixNQUFNLGFBQWEsQ0FBQztBQUlyQjs7R0FFRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsWUFBWSxDQUNoQyxNQUFjLEVBQ2QsTUFBNEI7SUFFNUIsTUFBTSxZQUFZLEdBQUcsTUFBTSxLQUFLLENBQzlCLEdBQUcsTUFBTSwwQkFBMEIsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUNwRCxDQUFDO0lBQ0YsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixZQUFZLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBQ0QsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLENBQUMsTUFBTSxZQUFZLENBQUMsSUFBSSxFQUFFLENBQTBCLENBQUM7SUFFM0UsTUFBTSxjQUFjLEdBQUcsSUFBSSxXQUFXLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDM0QsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQWtCLENBQUMsQ0FBQztJQUNyRCxNQUFNLGVBQWUsR0FBRyxnQkFBZ0IsRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUU3RCxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sYUFBYSxFQUFFO1FBQ25ELE1BQU0sRUFBRSxNQUFNO1FBQ2QsT0FBTyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFO1FBQy9DLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ25CLE1BQU0sRUFBRSxNQUFNLENBQUMsT0FBTztZQUN0QixTQUFTO1lBQ1QsU0FBUyxFQUFFLGVBQWU7U0FDM0IsQ0FBQztLQUNILENBQUMsQ0FBQztJQUNILE1BQU0sUUFBUSxHQUFHLENBQUMsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQTBELENBQUM7SUFDbEcsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQzVCLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFDRCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO0lBQzlFLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUM5QyxDQUFDO0FBRUQ7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHlCQUF5QixDQUM3QyxlQUF1QixFQUN2QixHQUFZLEVBQ1osU0FBUyxHQUFHLEtBQUs7SUFFakIsOEVBQThFO0lBQzlFLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEUsTUFBTSxhQUFhLEdBQUcsR0FBRyxPQUFPLHNCQUFzQixHQUFHLEVBQUUsQ0FBQztJQUU1RCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDekIsSUFBSSxZQUFZLEdBQVksSUFBSSxDQUFDO0lBQ2pDLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEtBQUssR0FBRyxTQUFTLEVBQUUsQ0FBQztRQUN0QyxJQUFJLENBQUM7WUFDSCxNQUFNLEdBQUcsR0FBRyxNQUFNLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN2QyxJQUFJLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDWCxNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksRUFBRSxDQUE0QixDQUFDO2dCQUMzRCxZQUFZLEdBQUcsSUFBSSxDQUFDO2dCQUNwQixNQUFNLEVBQUUsZUFBZSxFQUFFLEdBQUcsSUFBdUMsQ0FBQztnQkFDcEUsSUFBSSxlQUFlLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO29CQUM5RCxPQUFPLElBQUksQ0FBQztnQkFDZCxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUCx3Q0FBd0M7UUFDMUMsQ0FBQztRQUNELE1BQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBQ0QsaUZBQWlGO0lBQ2pGLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsMkJBQTJCLFNBQVMsNkJBQTZCLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZJLE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIGdldEJhc2U1OERlY29kZXIsXG4gIGNyZWF0ZVNpZ25hYmxlTWVzc2FnZSxcbiAgdHlwZSBBZGRyZXNzLFxuICB0eXBlIE1lc3NhZ2VQYXJ0aWFsU2lnbmVyLFxufSBmcm9tIFwiQHNvbGFuYS9raXRcIjtcblxuZXhwb3J0IHR5cGUgeyBNZXNzYWdlUGFydGlhbFNpZ25lciBhcyBNZXNzYWdlU2lnbmVyIH07XG5cbi8qKlxuICogQXV0aGVudGljYXRlIHdpdGggdGhlIE1hZ2ljQmxvY2sgVEVFIHZpYSBjaGFsbGVuZ2Utc2lnbiBmbG93LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QXV0aFRva2VuKFxuICBycGNVcmw6IHN0cmluZyxcbiAgc2lnbmVyOiBNZXNzYWdlUGFydGlhbFNpZ25lcixcbik6IFByb21pc2U8eyB0b2tlbjogc3RyaW5nOyBleHBpcmVzQXQ6IG51bWJlciB9PiB7XG4gIGNvbnN0IGNoYWxsZW5nZVJlcyA9IGF3YWl0IGZldGNoKFxuICAgIGAke3JwY1VybH0vYXV0aC9jaGFsbGVuZ2U/cHVia2V5PSR7c2lnbmVyLmFkZHJlc3N9YFxuICApO1xuICBpZiAoIWNoYWxsZW5nZVJlcy5vaykge1xuICAgIHRocm93IG5ldyBFcnJvcihgVEVFIGNoYWxsZW5nZSBmYWlsZWQ6ICR7Y2hhbGxlbmdlUmVzLnN0YXR1c1RleHR9YCk7XG4gIH1cbiAgY29uc3QgeyBjaGFsbGVuZ2UgfSA9IChhd2FpdCBjaGFsbGVuZ2VSZXMuanNvbigpKSBhcyB7IGNoYWxsZW5nZTogc3RyaW5nIH07XG5cbiAgY29uc3QgY2hhbGxlbmdlQnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoY2hhbGxlbmdlKTtcbiAgY29uc3QgW3NpZ0RpY3RdID0gYXdhaXQgc2lnbmVyLnNpZ25NZXNzYWdlcyhbY3JlYXRlU2lnbmFibGVNZXNzYWdlKGNoYWxsZW5nZUJ5dGVzKV0pO1xuICBjb25zdCBzaWduYXR1cmUgPSBzaWdEaWN0W3NpZ25lci5hZGRyZXNzIGFzIEFkZHJlc3NdO1xuICBjb25zdCBzaWduYXR1cmVTdHJpbmcgPSBnZXRCYXNlNThEZWNvZGVyKCkuZGVjb2RlKHNpZ25hdHVyZSk7XG5cbiAgY29uc3QgdG9rZW5SZXMgPSBhd2FpdCBmZXRjaChgJHtycGNVcmx9L2F1dGgvbG9naW5gLCB7XG4gICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICBoZWFkZXJzOiB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgcHVia2V5OiBzaWduZXIuYWRkcmVzcyxcbiAgICAgIGNoYWxsZW5nZSxcbiAgICAgIHNpZ25hdHVyZTogc2lnbmF0dXJlU3RyaW5nLFxuICAgIH0pLFxuICB9KTtcbiAgY29uc3QgYXV0aEpzb24gPSAoYXdhaXQgdG9rZW5SZXMuanNvbigpKSBhcyB7IHRva2VuOiBzdHJpbmc7IGV4cGlyZXNBdD86IG51bWJlcjsgZXJyb3I/OiBzdHJpbmcgfTtcbiAgaWYgKHRva2VuUmVzLnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gYXV0aGVudGljYXRlOiAke2F1dGhKc29uLmVycm9yfWApO1xuICB9XG4gIGNvbnN0IGV4cGlyZXNBdCA9IGF1dGhKc29uLmV4cGlyZXNBdCA/PyBEYXRlLm5vdygpICsgMTAwMCAqIDYwICogNjAgKiAyNCAqIDMwO1xuICByZXR1cm4geyB0b2tlbjogYXV0aEpzb24udG9rZW4sIGV4cGlyZXNBdCB9O1xufVxuXG4vKipcbiAqIFBvbGwgdGhlIFRFRSAvcGVybWlzc2lvbiBlbmRwb2ludCB1bnRpbCB0aGUgZ2l2ZW4gUERBIHNob3dzIGRlbGVnYXRpb24gaXMgYWN0aXZlLlxuICpcbiAqIElNUE9SVEFOVDogYGF1dGhvcml6ZWRVc2Vyc2AgaXMgb25seSBwb3B1bGF0ZWQgZm9yIFBFUi1ncm91cCBkZWxlZ2F0aW9uLiBGb3JcbiAqIERFTGVHRy1iYXNlZCBkZWxlZ2F0aW9uICh3aGF0IHRoaXMgcHJvamVjdCB1c2VzKSwgdGhpcyBmdW5jdGlvbiBsb2dzIHRoZSBmdWxsXG4gKiByZXNwb25zZSBvbiB0aW1lb3V0IHNvIHdlIGNhbiBpZGVudGlmeSB0aGUgY29ycmVjdCBmaWVsZC4gSXQgZG9lcyBOT1QgdGhyb3cgb25cbiAqIHRpbWVvdXQg4oCUIHRoZSBURUUgb3BlcmF0aW9uIGl0c2VsZiBpcyB0aGUgcmVhbCBmYWlsdXJlIHNpZ25hbC5cbiAqXG4gKiBUaGUgL3Blcm1pc3Npb24gZW5kcG9pbnQgaXMgYWx3YXlzIGNhbGxlZCBXSVRIT1VUIHRoZSBhdXRoIHRva2VuLlxuICogL3Blcm1pc3Npb24/dG9rZW49SldUJnB1YmtleT1QREEgcmV0dXJucyBwZXItdXNlciBhY2Nlc3MgKGFsd2F5cyBlbXB0eSB1bmxlc3NcbiAqIGV4cGxpY2l0bHkgZ3JhbnRlZCB2aWEgUEVSIGdyb3VwcyksIG5vdCBnbG9iYWwgZGVsZWdhdGlvbiBhY3RpdmF0aW9uIHN0YXR1cy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRVbnRpbFBlcm1pc3Npb25BY3RpdmUoXG4gIHRlZVVybFdpdGhUb2tlbjogc3RyaW5nLFxuICBwZGE6IEFkZHJlc3MsXG4gIHRpbWVvdXRNcyA9IDE1MDAwLFxuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIC8vIEFsd2F5cyBzdHJpcCB0aGUgdG9rZW4g4oCUIC9wZXJtaXNzaW9uP3B1YmtleT1QREEgaXMgdGhlIGNvcnJlY3QgZ2xvYmFsIGNoZWNrXG4gIGNvbnN0IFtiYXNlVXJsXSA9IHRlZVVybFdpdGhUb2tlbi5yZXBsYWNlKFwiLz9cIiwgXCI/XCIpLnNwbGl0KFwiP1wiKTtcbiAgY29uc3QgcGVybWlzc2lvblVybCA9IGAke2Jhc2VVcmx9L3Blcm1pc3Npb24/cHVia2V5PSR7cGRhfWA7XG5cbiAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuICBsZXQgbGFzdFJlc3BvbnNlOiB1bmtub3duID0gbnVsbDtcbiAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChwZXJtaXNzaW9uVXJsKTtcbiAgICAgIGlmIChyZXMub2spIHtcbiAgICAgICAgY29uc3QganNvbiA9IChhd2FpdCByZXMuanNvbigpKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgICAgbGFzdFJlc3BvbnNlID0ganNvbjtcbiAgICAgICAgY29uc3QgeyBhdXRob3JpemVkVXNlcnMgfSA9IGpzb24gYXMgeyBhdXRob3JpemVkVXNlcnM/OiB1bmtub3duW10gfTtcbiAgICAgICAgaWYgKGF1dGhvcml6ZWRVc2VycyAmJiBhdXRob3JpemVkVXNlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBbVEVFXSAke3BkYS5zbGljZSgwLCAxNil9Li4uIGRlbGVnYXRpb24gYWN0aXZlYCk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIGlnbm9yZSB0cmFuc2llbnQgZXJyb3JzLCBrZWVwIHBvbGxpbmdcbiAgICB9XG4gICAgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgNDAwKSk7XG4gIH1cbiAgLy8gV2FybiB3aXRoIGZ1bGwgcmVzcG9uc2UgdG8gZGlhZ25vc2Ugd2hpY2ggZmllbGQgdG8gY2hlY2sgZm9yIERFTGVHRyBkZWxlZ2F0aW9uXG4gIGNvbnNvbGUud2FybihgW1RFRV0gJHtwZGEuc2xpY2UoMCwgMTYpfS4uLiBub3QgY29uZmlybWVkIGFmdGVyICR7dGltZW91dE1zfW1zLiAvcGVybWlzc2lvbiByZXNwb25zZTogJHtKU09OLnN0cmluZ2lmeShsYXN0UmVzcG9uc2UpfWApO1xuICByZXR1cm4gZmFsc2U7XG59XG4iXX0=