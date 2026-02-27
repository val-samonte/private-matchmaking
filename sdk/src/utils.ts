import {
  getProgramDerivedAddress,
  getAddressEncoder,
  getUtf8Encoder,
  type Address,
} from "@solana/kit";

const addressEncoder = getAddressEncoder();
const utf8Encoder = getUtf8Encoder();

export const PERMISSION_PROGRAM = "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1" as Address;
export const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh" as Address;

/** Derives the Permission PDA for a given permissioned account. */
export async function derivePermissionPda(accountAddress: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PERMISSION_PROGRAM,
    seeds: [utf8Encoder.encode("permission:"), addressEncoder.encode(accountAddress)],
  });
  return pda;
}

/** Derives the DELeGG delegation PDAs for the Permission PDA (used in DelegatePermission ix). */
export async function derivePermissionDelegationPdas(permissionPda: Address): Promise<{
  delegationBuffer: Address;
  delegationRecord: Address;
  delegationMetadata: Address;
}> {
  const [delegationRecord] = await getProgramDerivedAddress({
    programAddress: DELEGATION_PROGRAM,
    seeds: [utf8Encoder.encode("delegation"), addressEncoder.encode(permissionPda)],
  });
  const [delegationMetadata] = await getProgramDerivedAddress({
    programAddress: DELEGATION_PROGRAM,
    seeds: [utf8Encoder.encode("delegation-metadata"), addressEncoder.encode(permissionPda)],
  });
  // Buffer PDA is under the ownerProgram (PERMISSION_PROGRAM for the Permission PDA)
  const [delegationBuffer] = await getProgramDerivedAddress({
    programAddress: PERMISSION_PROGRAM,
    seeds: [utf8Encoder.encode("buffer"), addressEncoder.encode(permissionPda)],
  });
  return { delegationBuffer, delegationRecord, delegationMetadata };
}

export const QUEUE_SEED = "queue";
export const TENANT_SEED = "tenant";
export const TICKET_SEED = "ticket";

export async function deriveQueuePda(programId: Address, authority: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8Encoder.encode(QUEUE_SEED), addressEncoder.encode(authority)],
  });
  return pda;
}

export async function deriveTenantPda(programId: Address, authority: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8Encoder.encode(TENANT_SEED), addressEncoder.encode(authority)],
  });
  return pda;
}

export async function deriveTicketPda(
  programId: Address,
  player: Address,
  tenant: Address
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      utf8Encoder.encode(TICKET_SEED),
      addressEncoder.encode(player),
      addressEncoder.encode(tenant),
    ],
  });
  return pda;
}
