const anchor = require("@coral-xyz/anchor");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} = require("@solana/web3.js");
const {
  CP_AMM_PROGRAM_ID,
  derivePoolAddress,
  derivePoolAuthority,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveTokenVaultAddress,
} = require("@meteora-ag/cp-amm-sdk");
const fs = require("fs");
const path = require("path");

const MINT = new PublicKey(
  process.env.MINT || "p5JmfqFZbdGLCaAb4ErAXwPeXPzSDrryWaMewyfcpet"
);
const METEORA_POOL_CONFIG = new PublicKey(
  process.env.METEORA_POOL_CONFIG || "3KLdspUofc75aaEAJdBo1o6D6cyzXJVtGB8PgpWJEiaR"
);
const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const EVENT_AUTHORITY = PublicKey.findProgramAddressSync(
  [Buffer.from("__event_authority")],
  CP_AMM_PROGRAM_ID
)[0];

function solscan(pathname) {
  return `https://solscan.io/${pathname}?cluster=devnet`;
}

function loadIdl() {
  const idlPath = path.join(__dirname, "..", "target", "idl", "launchpad.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const typesByName = new Map((idl.types || []).map((typeDef) => [typeDef.name, typeDef]));
  idl.accounts = (idl.accounts || []).map((account) => {
    if (account.type) {
      return account;
    }
    const typeDef = typesByName.get(account.name);
    return typeDef ? { ...account, type: typeDef.type } : account;
  });
  return idl;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(loadIdl(), provider);
  const wallet = provider.wallet;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_pool"), MINT.toBuffer()],
    program.programId
  );
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_sol_vault"), MINT.toBuffer()],
    program.programId
  );
  const [tokenVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_token_vault"), MINT.toBuffer()],
    program.programId
  );
  const [buybackStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("buyback"), poolPda.toBuffer()],
    program.programId
  );
  const [buybackTokenVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("buyback_token_vault"), poolPda.toBuffer()],
    program.programId
  );
  const [lpCustodyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_custody"), poolPda.toBuffer()],
    program.programId
  );

  const positionNftMint = Keypair.generate();
  const positionNftAccount = derivePositionNftAccount(positionNftMint.publicKey);
  const positionAccount = derivePositionAddress(positionNftMint.publicKey);
  const positionNftMetadata = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      positionNftMint.publicKey.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  )[0];

  const meteoraPool = derivePoolAddress(METEORA_POOL_CONFIG, NATIVE_MINT, MINT);
  const meteoraVaultA = deriveTokenVaultAddress(NATIVE_MINT, meteoraPool);
  const meteoraVaultB = deriveTokenVaultAddress(MINT, meteoraPool);
  const meteoraPoolAuthority = derivePoolAuthority();

  const payerWsolAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    NATIVE_MINT,
    wallet.publicKey
  );
  const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    MINT,
    wallet.publicKey
  );

  const config = await program.account.globalConfig.fetch(configPda);
  const poolBefore = await program.account.bondingCurvePool.fetch(poolPda);
  const solVaultBefore = await provider.connection.getBalance(solVaultPda);
  const tokenVaultBefore = await getAccount(provider.connection, tokenVaultPda);

  console.log("Migrating bonding pool...");
  console.log("Mint:", MINT.toBase58());
  console.log("Launchpad pool:", poolPda.toBase58());
  console.log("Meteora pool:", meteoraPool.toBase58());
  console.log("Pool real SOL reserves:", poolBefore.realSolReserves.toString());
  console.log("Pool migration target:", poolBefore.migrationTarget.toString());
  console.log("SOL vault lamports:", solVaultBefore);
  console.log("Token vault amount:", tokenVaultBefore.amount.toString());
  console.log("Payer WSOL account:", payerWsolAccount.address.toBase58());
  console.log("Payer token account:", payerTokenAccount.address.toBase58());
  console.log("LP custody PDA:", lpCustodyPda.toBase58());
  console.log("Position NFT mint:", positionNftMint.publicKey.toBase58());

  const signature = await program.methods
    .migrateBonding()
    .accounts({
      payer: wallet.publicKey,
      config: configPda,
      pool: poolPda,
      solVault: solVaultPda,
      tokenVault: tokenVaultPda,
      buybackState: buybackStatePda,
      buybackTokenVault: buybackTokenVaultPda,
      platformWallet: config.platformWallet,
      meteoraProgram: CP_AMM_PROGRAM_ID,
      meteoraPool,
      meteoraPoolConfig: METEORA_POOL_CONFIG,
      meteoraPoolAuthority,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      meteoraEventAuthority: EVENT_AUTHORITY,
      lpCustody: lpCustodyPda,
      positionNftMint: positionNftMint.publicKey,
      positionNftAccount,
      positionAccount,
      positionNftMetadata,
      meteoraVaultA,
      meteoraVaultB,
      wsolMint: NATIVE_MINT,
      tokenMint: MINT,
      payerWsolAccount: payerWsolAccount.address,
      payerTokenAccount: payerTokenAccount.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([positionNftMint])
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
    ])
    .rpc();

  const poolAfter = await program.account.bondingCurvePool.fetch(poolPda);
  const buybackState = await program.account.buybackState.fetch(buybackStatePda);
  const meteoraPoolInfo = await provider.connection.getAccountInfo(meteoraPool);

  console.log("Transaction:", signature);
  console.log("Pool migrated:", poolAfter.isMigrated);
  console.log("Buyback state:", buybackStatePda.toBase58());
  console.log("Buyback treasury balance:", buybackState.treasuryBalance.toString());
  console.log("Meteora pool exists:", Boolean(meteoraPoolInfo));
  console.log("Solscan transaction:", solscan(`tx/${signature}`));
  console.log("Solscan token:", solscan(`token/${MINT.toBase58()}`));
  console.log("Solscan launchpad pool:", solscan(`account/${poolPda.toBase58()}`));
  console.log("Solscan Meteora pool:", solscan(`account/${meteoraPool.toBase58()}`));
}

main().catch((err) => {
  console.error(err);
  if (err.logs) {
    console.error("Logs:");
    for (const log of err.logs) {
      console.error(log);
    }
  }
  process.exit(1);
});
