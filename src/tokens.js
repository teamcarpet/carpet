import {
  Connection, Keypair, SystemProgram, Transaction,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  MINT_SIZE, TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import { CONFIG } from './config.js';
import { getPublicKey, signAndSendTransaction } from './wallet.js';
import { uploadTokenMetadata } from './ipfs.js';
import { addToken } from './platform.js';

export async function createToken({
  name, symbol, description,
  imageFile, website, twitter, telegram,
  decimals = 6, supply = 1_000_000_000,
  mode = 'bonding',
}) {
  const creator = getPublicKey();
  if (!creator) throw new Error('Wallet not connected');

  // 1. Upload metadata to IPFS
  const meta = await uploadTokenMetadata({
    name, symbol, description, imageFile, website, twitter, telegram,
  });

  // 2. Create mint keypair
  const mintKp = Keypair.generate();
  const conn = new Connection(CONFIG.solanaRpc, 'confirmed');
  const lamports = await getMinimumBalanceForRentExemptMint(conn);

  // 3. ATA for creator
  const ata = await getAssociatedTokenAddress(mintKp.publicKey, creator);

  // 4. Build transaction
  const tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: creator,
      newAccountPubkey: mintKp.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintKp.publicKey, decimals, creator, creator),
    createAssociatedTokenAccountInstruction(creator, ata, creator, mintKp.publicKey),
    createMintToInstruction(mintKp.publicKey, ata, creator, supply * Math.pow(10, decimals)),
  );
  tx.partialSign(mintKp);

  const sig = await signAndSendTransaction(tx);

  // 5. On-chain metadata via Metaplex UMI (dynamic import to keep bundle optional)
  try {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { createV1, TokenStandard } = await import('@metaplex-foundation/mpl-token-metadata');
    const { publicKey: umiPk } = await import('@metaplex-foundation/umi');
    const provider = window.phantom?.solana || window.solana;
    const umi = createUmi(CONFIG.solanaRpc);
    // Attach wallet signer manually using the Phantom provider
    umi.use({
      install(u) {
        u.identity = {
          publicKey: umiPk(provider.publicKey.toBase58()),
          signTransaction: async (tx) => {
            const signed = await provider.signTransaction(tx);
            return signed;
          },
          signAllTransactions: async (txs) => provider.signAllTransactions(txs),
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
  });

  return { mint: mintKp.publicKey.toBase58(), sig, token: tokenEntry };
}
