import {
  getProgramDerivedAddress,
  getAddressEncoder,
  getUtf8Encoder,
  type Address,
} from "@solana/kit";

const addressEncoder = getAddressEncoder();
const utf8Encoder = getUtf8Encoder();

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
