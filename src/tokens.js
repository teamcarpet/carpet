import {
  Connection, Keypair, SystemProgram, Transaction,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  MINT_SIZE, TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import { CONFIG } from './config.js';
import { getAnchorWallet, getPublicKey, getWalletProvider, signAndSendTransaction } from './wallet.js';
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

  // 4. Build mint transaction. The launchpad program requires zero supply and no freeze authority.
  const tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: creator,
      newAccountPubkey: mintKp.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintKp.publicKey, decimals, creator, null),
  );
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = creator;
  tx.partialSign(mintKp);

  const sig = await signAndSendTransaction(tx);

  // 5. On-chain metadata via Metaplex UMI (dynamic import to keep bundle optional)
  try {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { createV1, TokenStandard } = await import('@metaplex-foundation/mpl-token-metadata');
    const { publicKey: umiPk } = await import('@metaplex-foundation/umi');
    const provider = getWalletProvider();
    const umi = createUmi(CONFIG.solanaRpc);
    // Attach wallet signer manually using the selected injected wallet provider.
    umi.use({
      install(u) {
        u.identity = {
          publicKey: umiPk(provider.publicKey.toBase58()),
          signTransaction: async (tx) => {
            const signed = await provider.signTransaction(tx);
            return signed;
          },
          signAllTransactions: async (txs) => provider.signAllTransactions
            ? provider.signAllTransactions(txs)
            : Promise.all(txs.map((tx) => provider.signTransaction(tx))),
          signMessage: async (msg) => provider.signMessage(msg),
        };
        u.payer = u.identity;
      },
    });
    await createV1(umi, {
      mint: umiPk(mintKp.publicKey.toBase58()),
      name,
      symbol,
      uri: meta.ipfsUrl,
      sellerFeeBasisPoints: { basisPoints: 0n },
      tokenStandard: TokenStandard.Fungible,
    }).sendAndConfirm(umi);
  } catch (e) {
    console.warn('Metaplex metadata upload skipped:', e.message);
  }

  // 5.5. Create the launchpad pool. The program mints the supply into its vault.
  let poolSig = null;
  try {
    const wallet = getAnchorWallet();
    poolSig = await createLaunchpadPool(wallet, mintKp.publicKey, {
      mode,
      presaleMode,
    });
    console.log('Launchpad pool created:', poolSig);
  } catch (e) {
    console.error('Failed to create launchpad pool:', e);
    throw new Error('Pool creation failed: ' + e.message);
  }

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
