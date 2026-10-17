// One-time setup for a fresh deployment: initialize the global config with the
// standard fee schedule, then allow the Meteora DAMM v2 pool config.
// Usage: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json node scripts/init_config.js
const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const idl = require("../target/idl/launchpad.json");

const METEORA_POOL_CONFIG = new PublicKey(process.env.METEORA_POOL_CONFIG || "3KLdspUofc75aaEAJdBo1o6D6cyzXJVtGB8PgpWJEiaR");

(async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  const me = provider.wallet.publicKey;
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

  const existing = await program.account.globalConfig.fetchNullable(configPda);
  if (!existing) {
    const sig = await program.methods.initialize({
      pauseAuthority: me, devWallet: me, platformWallet: me,
      devFeeBps: 50, platformFeeBps: 50, sellTaxBps: 2400,
      presalePlatformFeeBps: 100, migrationFeeBps: 100,
      creatorFeeBps: 7000, protocolFeeBps: 2950, keeperFeeBps: 50,
    }).accounts({ admin: me, config: configPda, systemProgram: SystemProgram.programId }).rpc();
    console.log("initialized", configPda.toBase58(), sig);
  } else {
    console.log("config exists, admin", existing.admin.toBase58());
  }

  const empty = PublicKey.default;
  const sig = await program.methods.updateConfig({
    newPauseAuthority: null, newDevWallet: null, newPlatformWallet: null,
    newDevFeeBps: null, newPlatformFeeBps: null, newSellTaxBps: null,
    newPresalePlatformFeeBps: null, newMigrationFeeBps: null,
    newCreatorFeeBps: null, newProtocolFeeBps: null, newKeeperFeeBps: null,
    newAllowedMeteoraConfigs: [METEORA_POOL_CONFIG, empty, empty, empty],
  }).accounts({ admin: me, config: configPda }).rpc();
  console.log("allowed meteora config", METEORA_POOL_CONFIG.toBase58(), sig);

  const c = await program.account.globalConfig.fetch(configPda);
  console.log(JSON.stringify({ admin: c.admin, keeper: c.keeperWallet, platform: c.platformWallet, meteora: c.allowedMeteoraConfigs[0], fees: [c.devFeeBps, c.platformFeeBps, c.sellTaxBps, c.presalePlatformFeeBps, c.migrationFeeBps, c.creatorFeeBps, c.protocolFeeBps, c.keeperFeeBps] }));
})().catch((e) => { console.error(e); process.exit(1); });
