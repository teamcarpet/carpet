const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const KEEPER_FEE_BPS = Number(process.env.KEEPER_FEE_BPS || "50");

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

  const before = await provider.connection.getAccountInfo(configPda);
  console.log("Config:", configPda.toBase58());
  console.log("Config size before:", before?.data.length ?? 0);
  console.log("Keeper fee bps:", KEEPER_FEE_BPS);

  const signature = await program.methods
    .upgradeConfigV2(KEEPER_FEE_BPS)
    .accounts({
      admin: wallet.publicKey,
      config: configPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const after = await provider.connection.getAccountInfo(configPda);
  const config = await program.account.globalConfig.fetch(configPda);

  console.log("Transaction:", signature);
  console.log("Config size after:", after?.data.length ?? 0);
  console.log("Admin:", config.admin.toBase58());
  console.log("Creator fee bps:", config.creatorFeeBps);
  console.log("Protocol fee bps:", config.protocolFeeBps);
  console.log("Keeper fee bps:", config.keeperFeeBps);
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
