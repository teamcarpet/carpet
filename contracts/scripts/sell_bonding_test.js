const anchor = require("@coral-xyz/anchor");
const {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const MINT = new PublicKey(
  process.env.MINT || "kZTfYB8mveMmBkbnwy8RKR3vyxnT5XjaBsbjiqVcpet"
);
const TOKEN_AMOUNT = Number(process.env.TOKEN_AMOUNT || "10000000000"); // 10,000 tokens, 6 decimals
const MIN_SOL_OUT = Number(process.env.MIN_SOL_OUT || "0");

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
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_sol_vault"), MINT.toBuffer()],
    program.programId
  );
  const [tokenVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_token_vault"), MINT.toBuffer()],
    program.programId
  );

  const sellerTokenAccount = getAssociatedTokenAddressSync(MINT, wallet.publicKey);
  const config = await program.account.globalConfig.fetch(configPda);
  const pool = await program.account.bondingCurvePool.fetch(poolPda);

  const beforeWalletLamports = await provider.connection.getBalance(wallet.publicKey);
  const beforeSolVaultLamports = await provider.connection.getBalance(solVaultPda);
  const beforeSellerToken = await getAccount(provider.connection, sellerTokenAccount);
  const beforeTokenVault = await getAccount(provider.connection, tokenVaultPda);
  const beforePool = await program.account.bondingCurvePool.fetch(poolPda);

  console.log("Selling into bonding pool...");
  console.log("Mint:", MINT.toBase58());
  console.log("Pool:", poolPda.toBase58());
  console.log("Seller token account:", sellerTokenAccount.toBase58());
  console.log("Token amount raw:", TOKEN_AMOUNT);

  const signature = await program.methods
    .sellBonding(new anchor.BN(TOKEN_AMOUNT), new anchor.BN(MIN_SOL_OUT))
    .accounts({
      seller: wallet.publicKey,
      config: configPda,
      pool: poolPda,
      solVault: solVaultPda,
      tokenVault: tokenVaultPda,
      sellerTokenAccount,
      creatorWallet: pool.creator,
      platformWallet: config.platformWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const afterWalletLamports = await provider.connection.getBalance(wallet.publicKey);
  const afterSolVaultLamports = await provider.connection.getBalance(solVaultPda);
  const afterSellerToken = await getAccount(provider.connection, sellerTokenAccount);
  const afterTokenVault = await getAccount(provider.connection, tokenVaultPda);
  const afterPool = await program.account.bondingCurvePool.fetch(poolPda);

  console.log("Transaction:", signature);
  console.log("Seller token before:", beforeSellerToken.amount.toString());
  console.log("Seller token after:", afterSellerToken.amount.toString());
  console.log("Seller token delta:", (afterSellerToken.amount - beforeSellerToken.amount).toString());
  console.log("Token vault before:", beforeTokenVault.amount.toString());
  console.log("Token vault after:", afterTokenVault.amount.toString());
  console.log("SOL vault before:", beforeSolVaultLamports);
  console.log("SOL vault after:", afterSolVaultLamports);
  console.log("Wallet SOL before:", beforeWalletLamports);
  console.log("Wallet SOL after:", afterWalletLamports);
  console.log("Pool real SOL reserves before:", beforePool.realSolReserves.toString());
  console.log("Pool real SOL reserves after:", afterPool.realSolReserves.toString());
  console.log("Pool real token reserves before:", beforePool.realTokenReserves.toString());
  console.log("Pool real token reserves after:", afterPool.realTokenReserves.toString());
  console.log("Pool buyback treasury:", afterPool.buybackTreasury.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
