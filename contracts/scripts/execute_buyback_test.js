const anchor = require("@coral-xyz/anchor");
const {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { ComputeBudgetProgram, PublicKey, SystemProgram } = require("@solana/web3.js");
const {
  CP_AMM_PROGRAM_ID,
  derivePoolAuthority,
  deriveTokenVaultAddress,
} = require("@meteora-ag/cp-amm-sdk");
const fs = require("fs");
const path = require("path");

const MINT = new PublicKey(
  process.env.MINT || "QL8hKQGUZTXLVGke4ZuERU6YANTtwDdR8hnPLFJcpet"
);
const MIN_TOKENS_OUT = new anchor.BN(process.env.MIN_TOKENS_OUT || "0");

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

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_pool"), MINT.toBuffer()],
    program.programId
  );
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_sol_vault"), MINT.toBuffer()],
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
  const meteoraEventAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    CP_AMM_PROGRAM_ID
  )[0];

  const buybackBefore = await program.account.buybackState.fetch(buybackStatePda);
  const meteoraInputVault = deriveTokenVaultAddress(NATIVE_MINT, buybackBefore.meteoraPool);
  const meteoraOutputVault = deriveTokenVaultAddress(MINT, buybackBefore.meteoraPool);
  const payerWsolAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    NATIVE_MINT,
    wallet.publicKey
  );

  const buybackTokenBefore = await getAccount(provider.connection, buybackTokenVaultPda);
  const mintBefore = await provider.connection.getParsedAccountInfo(MINT);
  const supplyBefore = mintBefore.value.data.parsed.info.supply;

  console.log("Executing buyback...");
  console.log("Mint:", MINT.toBase58());
  console.log("Launchpad pool:", poolPda.toBase58());
  console.log("Buyback state:", buybackStatePda.toBase58());
  console.log("Meteora pool:", buybackBefore.meteoraPool.toBase58());
  console.log("Treasury before:", buybackBefore.treasuryBalance.toString());
  console.log("Total SOL spent before:", buybackBefore.totalSolSpent.toString());
  console.log("Total tokens burned before:", buybackBefore.totalTokensBurned.toString());
  console.log("Buyback token vault before:", buybackTokenBefore.amount.toString());
  console.log("Supply before:", supplyBefore);

  const signature = await program.methods
    .executeBuyback({
      mode: { burn: {} },
      minTokensOut: MIN_TOKENS_OUT,
    })
    .accounts({
      payer: wallet.publicKey,
      buybackState: buybackStatePda,
      buybackSolVault: solVaultPda,
      poolMint: MINT,
      buybackTokenVault: buybackTokenVaultPda,
      tokenMint: MINT,
      meteoraProgram: CP_AMM_PROGRAM_ID,
      meteoraPool: buybackBefore.meteoraPool,
      meteoraPoolAuthority: derivePoolAuthority(),
      meteoraInputVault,
      meteoraOutputVault,
      wsolMint: NATIVE_MINT,
      payerWsolAccount: payerWsolAccount.address,
      meteoraEventAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
    ])
    .rpc();

  const buybackAfter = await program.account.buybackState.fetch(buybackStatePda);
  const buybackTokenAfter = await getAccount(provider.connection, buybackTokenVaultPda);
  const mintAfter = await provider.connection.getParsedAccountInfo(MINT);
  const supplyAfter = mintAfter.value.data.parsed.info.supply;

  console.log("Transaction:", signature);
  console.log("Treasury after:", buybackAfter.treasuryBalance.toString());
  console.log("Total SOL spent after:", buybackAfter.totalSolSpent.toString());
  console.log("Total tokens bought after:", buybackAfter.totalTokensBought.toString());
  console.log("Total tokens burned after:", buybackAfter.totalTokensBurned.toString());
  console.log("Idle tokens after:", buybackAfter.idleTokens.toString());
  console.log("Buyback token vault after:", buybackTokenAfter.amount.toString());
  console.log("Supply after:", supplyAfter);
  console.log("Solscan transaction:", solscan(`tx/${signature}`));
  console.log("Solscan token:", solscan(`token/${MINT.toBase58()}`));
  console.log("Solscan buyback state:", solscan(`account/${buybackStatePda.toBase58()}`));
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
