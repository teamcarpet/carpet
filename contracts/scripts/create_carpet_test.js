const anchor = require("@coral-xyz/anchor");
const {
  createMint,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const TOKEN_NAME = "carpet test";
const TOKEN_SYMBOL = "CARPT TEST";

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
    if (!typeDef) {
      return account;
    }
    return {
      ...account,
      type: typeDef.type,
    };
  });
  const programId = new PublicKey(idl.address || idl.metadata.address);
  const program = new anchor.Program(idl, provider);
  const wallet = provider.wallet;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  try {
    const config = await program.account.globalConfig.fetch(configPda);
    console.log("Config already exists:", configPda.toBase58());
    console.log("Config admin:", config.admin.toBase58());
  } catch (err) {
    console.log("Config missing; initializing launchpad config...");
    await program.methods
      .initialize({
        pauseAuthority: wallet.publicKey,
        devWallet: wallet.publicKey,
        platformWallet: wallet.publicKey,
        devFeeBps: 50,
        platformFeeBps: 50,
        sellTaxBps: 2400,
        presalePlatformFeeBps: 100,
        migrationFeeBps: 100,
        creatorFeeBps: 7000,
        protocolFeeBps: 2950,
        keeperFeeBps: 50,
      })
      .accounts({
        admin: wallet.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Initialized config:", configPda.toBase58());
  }

  console.log(`Creating mint for ${TOKEN_NAME} (${TOKEN_SYMBOL})...`);
  const mint = await createMint(
    provider.connection,
    wallet.payer,
    wallet.publicKey,
    null,
    6
  );

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_pool"), mint.toBuffer()],
    program.programId
  );
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_sol_vault"), mint.toBuffer()],
    program.programId
  );
  const [tokenVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_token_vault"), mint.toBuffer()],
    program.programId
  );

  console.log("Creating bonding pool through launchpad contract...");
  const signature = await program.methods
    .createBondingPool({
      virtualSolReserves: null,
      virtualTokenReserves: null,
      tokenSupply: null,
      migrationTarget: null,
    })
    .accounts({
      creator: wallet.publicKey,
      config: configPda,
      mint,
      pool: poolPda,
      solVault: solVaultPda,
      tokenVault: tokenVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Token name:", TOKEN_NAME);
  console.log("Token symbol:", TOKEN_SYMBOL);
  console.log("Mint:", mint.toBase58());
  console.log("Bonding pool:", poolPda.toBase58());
  console.log("Token vault:", tokenVaultPda.toBase58());
  console.log("SOL vault:", solVaultPda.toBase58());
  console.log("Transaction:", signature);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
