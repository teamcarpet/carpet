const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const MINT = new PublicKey(
  process.env.MINT || "12Gtd5inKNwYeAkn4QNgyecAQ1k7NAMFEMQBk9f1cpet"
);
const SOL_AMOUNT = Number(process.env.SOL_AMOUNT || "10000000"); // 0.01 SOL

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
    [Buffer.from("presale_pool"), MINT.toBuffer()],
    program.programId
  );
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("presale_sol_vault"), MINT.toBuffer()],
    program.programId
  );
  const [userPositionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), poolPda.toBuffer(), wallet.publicKey.toBuffer()],
    program.programId
  );

  const config = await program.account.globalConfig.fetch(configPda);
  const beforeWalletLamports = await provider.connection.getBalance(wallet.publicKey);
  const beforeSolVaultLamports = await provider.connection.getBalance(solVaultPda);
  const beforePool = await program.account.presalePool.fetch(poolPda);

  console.log("Contributing to presale...");
  console.log("Mint:", MINT.toBase58());
  console.log("Pool:", poolPda.toBase58());
  console.log("SOL amount lamports:", SOL_AMOUNT);
  console.log("Pool current raised before:", beforePool.currentRaised.toString());
  console.log("SOL vault before:", beforeSolVaultLamports);

  const signature = await program.methods
    .contributePresale(new anchor.BN(SOL_AMOUNT))
    .accounts({
      contributor: wallet.publicKey,
      config: configPda,
      pool: poolPda,
      solVault: solVaultPda,
      userPosition: userPositionPda,
      platformWallet: config.platformWallet,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const afterWalletLamports = await provider.connection.getBalance(wallet.publicKey);
  const afterSolVaultLamports = await provider.connection.getBalance(solVaultPda);
  const afterPool = await program.account.presalePool.fetch(poolPda);
  const userPosition = await program.account.userPosition.fetch(userPositionPda);

  console.log("Transaction:", signature);
  console.log("Pool current raised after:", afterPool.currentRaised.toString());
  console.log(
    "Pool current raised delta:",
    afterPool.currentRaised.sub(beforePool.currentRaised).toString()
  );
  console.log("SOL vault after:", afterSolVaultLamports);
  console.log("SOL vault delta:", afterSolVaultLamports - beforeSolVaultLamports);
  console.log("Wallet SOL before:", beforeWalletLamports);
  console.log("Wallet SOL after:", afterWalletLamports);
  console.log("User position contributed:", userPosition.solContributed.toString());
  console.log("User position:", userPositionPda.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
