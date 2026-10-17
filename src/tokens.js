import {
  ComputeBudgetProgram, Connection, Keypair, SystemProgram, Transaction,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  MINT_SIZE, TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import { CONFIG } from './config.js';
import { getAnchorWallet, getPublicKey, signAndSendTransaction } from './wallet.js';
import { createMetadataIx } from './metadata-ix.js';
import { uploadTokenMetadata } from './ipfs.js';
import { addToken } from './platform.js';
import { createLaunchpadPool } from './launchpad.js';

async function claimVanityMint() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${CONFIG.apiUrl}/vanity-mint`, { method: 'POST', signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const { pubkey, secretKey } = await res.json();
      const kp = Keypair.fromSecretKey(Uint8Array.from(atob(secretKey), (c) => c.charCodeAt(0)));
      if (kp.publicKey.toBase58() === pubkey) return kp;
    }
  } catch {}
  return Keypair.generate();
}

export async function createToken({
  name, symbol, description,
  imageFile, website, twitter, telegram,
  decimals = 6, supply = 1_000_000_000,
  mode = 'bonding',
  presaleMode = 0,
}) {
  const creator = getPublicKey();
  if (!creator) throw new Error('Wallet not connected');

  // 1. Upload metadata to IPFS
  const meta = await uploadTokenMetadata({
    name, symbol, description, imageFile, website, twitter, telegram,
  });

  // 2. Create mint keypair
  // Mint address ending in "rug", pre-ground by the API (grinding in the
  // browser froze the page). Falls back to a random mint so a launch never waits.
  const mintKp = await claimVanityMint();
  const conn = new Connection(CONFIG.solanaRpc, 'confirmed');
  const lamports = await getMinimumBalanceForRentExemptMint(conn);

  // One transaction, one signature: mint account → metadata → launchpad pool.
  // The program requires zero supply and no freeze authority; it mints the
  // supply into its vault and revokes mint authority. If any step fails the
  // whole launch rolls back, so a token can't go live without its name.
  const poolIx = await createLaunchpadPool(getAnchorWallet(), mintKp.publicKey, { mode, presaleMode, asInstruction: true });
  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    SystemProgram.createAccount({
      fromPubkey: creator,
      newAccountPubkey: mintKp.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintKp.publicKey, decimals, creator, null),
    createMetadataIx({
      mint: mintKp.publicKey,
      mintAuthority: creator,
      payer: creator,
      updateAuthority: creator,
      name,
      symbol,
      uri: meta.ipfsUrl,
    }),
    poolIx,
  );
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = creator;
  tx.partialSign(mintKp);

  let sig;
  try {
    sig = await signAndSendTransaction(tx);
  } catch (e) {
    console.error('Launch transaction failed:', e);
    throw new Error(e?.message || 'Launch transaction failed');
  }
  const poolSig = sig;
  console.log('Launched', mintKp.publicKey.toBase58(), sig);

  // 6. Register on platform
  const tokenEntry = addToken({
    n: name,
    tk: symbol,
    em: '🎯',
    col: 'new',
    mode,
    mint: mintKp.publicKey.toBase58(),
    creator: creator.toBase58(),
    metaUri: meta.ipfsUrl,
    metaUrl: meta.url,
    imageFile: undefined,
    desc: description,
    d2: description,
    website, twitter, telegram,
    sig,
    decimals,
    supply,
    poolSig,
  });

  return { mint: mintKp.publicKey.toBase58(), sig, poolSig, token: tokenEntry };
}
