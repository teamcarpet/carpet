const anchor = require("@coral-xyz/anchor");
const {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const MINT = new PublicKey(
  process.env.MINT || "kZTfYB8mveMmBkbnwy8RKR3vyxnT5XjaBsbjiqVcpet"
);
const SOL_AMOUNT = Number(process.env.SOL_AMOUNT || "10000000"); // 0.01 SOL
const MIN_TOKENS_OUT = Number(process.env.MIN_TOKENS_OUT || "0");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

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

  const program = new anchor.Program(idl, provider);
  const wallet = provider.wallet;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_pool"), MINT.toBuffer()],
    program.programId
  );
  const [buyerPositionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPda.toBuffer(), wallet.publicKey.toBuffer()],
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

  const config = await program.account.globalConfig.fetch(configPda);
  const pool = await program.account.bondingCurvePool.fetch(poolPda);
  const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    MINT,
    wallet.publicKey
  );

  const beforeWalletLamports = await provider.connection.getBalance(wallet.publicKey);
  const beforeSolVaultLamports = await provider.connection.getBalance(solVaultPda);
  const beforeBuyerToken = await getAccount(provider.connection, buyerTokenAccount.address);
  const beforeTokenVault = await getAccount(provider.connection, tokenVaultPda);

  console.log("Buying from bonding pool...");
  console.log("Mint:", MINT.toBase58());
  console.log("Pool:", poolPda.toBase58());
  console.log("Buyer token account:", buyerTokenAccount.address.toBase58());
  console.log("SOL amount lamports:", SOL_AMOUNT);

  const signature = await program.methods
    .buyBonding(new anchor.BN(SOL_AMOUNT), new anchor.BN(MIN_TOKENS_OUT))
    .accounts({
      buyer: wallet.publicKey,
      config: configPda,
      pool: poolPda,
      buyerPosition: buyerPositionPda,
      solVault: solVaultPda,
      tokenVault: tokenVaultPda,
      buyerTokenAccount: buyerTokenAccount.address,
      creatorWallet: pool.creator,
      platformWallet: config.platformWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const afterWalletLamports = await provider.connection.getBalance(wallet.publicKey);
  const afterSolVaultLamports = await provider.connection.getBalance(solVaultPda);
  const afterBuyerToken = await getAccount(provider.connection, buyerTokenAccount.address);
  const afterTokenVault = await getAccount(provider.connection, tokenVaultPda);
  const updatedPool = await program.account.bondingCurvePool.fetch(poolPda);

  console.log("Transaction:", signature);
  console.log("Buyer token before:", beforeBuyerToken.amount.toString());
  console.log("Buyer token after:", afterBuyerToken.amount.toString());
  console.log("Buyer token delta:", (afterBuyerToken.amount - beforeBuyerToken.amount).toString());
  console.log("Token vault before:", beforeTokenVault.amount.toString());
  console.log("Token vault after:", afterTokenVault.amount.toString());
  console.log("SOL vault before:", beforeSolVaultLamports);
  console.log("SOL vault after:", afterSolVaultLamports);
  console.log("Wallet SOL before:", beforeWalletLamports);
  console.log("Wallet SOL after:", afterWalletLamports);
  console.log("Pool real SOL reserves:", updatedPool.realSolReserves.toString());
  console.log("Pool real token reserves:", updatedPool.realTokenReserves.toString());
  console.log("Buyer position:", buyerPositionPda.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
