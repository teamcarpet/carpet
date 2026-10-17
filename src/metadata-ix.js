// Metaplex Token Metadata: CreateMetadataAccountV3 built by hand, so it can go
// into the same transaction as the mint and the launchpad pool (one signature,
// and a launch can never end up nameless if this step fails).

import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from '@solana/web3.js';

export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export function metadataPda(mint) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
    METADATA_PROGRAM_ID,
  )[0];
}

const enc = new TextEncoder();
function borshString(s) {
  const bytes = enc.encode(s);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

// Metaplex limits: name ≤ 32 bytes, symbol ≤ 10, uri ≤ 200.
const clip = (s, max) => {
  let v = String(s || '');
  while (enc.encode(v).length > max) v = v.slice(0, -1);
  return v;
};

export function createMetadataIx({ mint, mintAuthority, payer, updateAuthority, name, symbol, uri, isMutable = false }) {
  const parts = [
    Uint8Array.of(33),                       // CreateMetadataAccountV3
    borshString(clip(name, 32)),
    borshString(clip(symbol, 10)),
    borshString(clip(uri, 200)),
    Uint8Array.of(0, 0),                     // seller_fee_basis_points: u16 = 0
    Uint8Array.of(0),                        // creators: None
    Uint8Array.of(0),                        // collection: None
    Uint8Array.of(0),                        // uses: None
    Uint8Array.of(isMutable ? 1 : 0),        // is_mutable
    Uint8Array.of(0),                        // collection_details: None
  ];
  const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { data.set(p, o); o += p.length; }

  return new TransactionInstruction({
    programId: METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPda(mint), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}
