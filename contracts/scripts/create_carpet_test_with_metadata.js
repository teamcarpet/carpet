const anchor = require("@coral-xyz/anchor");
const {
  createMint,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const TOKEN_NAME = process.env.TOKEN_NAME || "carpet test";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "CARPT TEST";
const TOKEN_URI = process.env.TOKEN_URI || defaultMetadataUri(TOKEN_NAME, TOKEN_SYMBOL);
const VANITY_SUFFIX = process.env.VANITY_SUFFIX ?? "rug";
const VANITY_POOL_DIR = path.join(__dirname, "..", "target", "vanity-mints");
const USED_VANITY_POOL_DIR = path.join(VANITY_POOL_DIR, "used");
const LAUNCH_TYPE = process.env.LAUNCH_TYPE || "bonding";
const TOKEN_SUPPLY = Number(process.env.TOKEN_SUPPLY || "1000000000000000");
const MIGRATION_TARGET = Number(process.env.MIGRATION_TARGET || "100000000000");
const VIRTUAL_SOL_RESERVES = process.env.VIRTUAL_SOL_RESERVES
  ? Number(process.env.VIRTUAL_SOL_RESERVES)
  : null;
const VIRTUAL_TOKEN_RESERVES = process.env.VIRTUAL_TOKEN_RESERVES
  ? Number(process.env.VIRTUAL_TOKEN_RESERVES)
  : null;
const PRESALE_END_SECONDS = Number(process.env.PRESALE_END_SECONDS || "3600");
const CREATOR_POOL_BPS = Number(process.env.CREATOR_POOL_BPS || "2000");
const PRESALE_MODE = process.env.PRESALE_MODE || "regular";
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

function defaultMetadataUri(name, symbol) {
  const metadata = {
    name,
    symbol,
    description: `${name} token on Carpet launchpad devnet`,
    image: "",
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString(
    "base64"
  )}`;
}

function writeString(value) {
  const body = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length, 0);
  return Buffer.concat([len, body]);
}

function writeOption(buffer) {
  return buffer ? Buffer.concat([Buffer.from([1]), buffer]) : Buffer.from([0]);
}

function writeU16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function createMetadataInstruction({ metadata, mint, mintAuthority, payer, updateAuthority }) {
  const createMetadataAccountV3 = 33;
  const data = Buffer.concat([
    Buffer.from([createMetadataAccountV3]),
    writeString(TOKEN_NAME),
    writeString(TOKEN_SYMBOL),
    writeString(TOKEN_URI),
    writeU16(0),
    writeOption(null), // creators
    writeOption(null), // collection
    writeOption(null), // uses
    Buffer.from([1]), // is_mutable
    writeOption(null), // collection_details
  ]);

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function selectMintKeypair(connection) {
  const candidates = process.env.MINT_KEYPAIR
    ? [process.env.MINT_KEYPAIR]
    : fs
        .readdirSync(VANITY_POOL_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => path.join(VANITY_POOL_DIR, entry.name))
        .sort();

  for (const filePath of candidates) {
    const keypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8")))
    );
    const address = keypair.publicKey.toBase58();

    if (!address.endsWith(VANITY_SUFFIX)) {
      continue;
    }

    const accountInfo = await connection.getAccountInfo(keypair.publicKey);
    if (accountInfo && !process.env.MINT_KEYPAIR) {
      markMintKeypairUsed(filePath, address);
      continue;
    }

    return { keypair, filePath };
  }

  throw new Error(
    `No unused ${VANITY_SUFFIX} mint keypairs found. Run: node scripts/fill_vanity_mint_pool.js ${VANITY_SUFFIX} 5`
  );
}

function markMintKeypairUsed(filePath, address) {
  if (process.env.MINT_KEYPAIR) {
    return;
  }

  fs.mkdirSync(USED_VANITY_POOL_DIR, { recursive: true });
  const targetPath = path.join(USED_VANITY_POOL_DIR, `${address}.json`);
  if (path.resolve(filePath) !== path.resolve(targetPath) && fs.existsSync(filePath)) {
    fs.renameSync(filePath, targetPath);
  }
}

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
  const { keypair: mintKeypair, filePath: mintKeypairPath } = await selectMintKeypair(
    provider.connection
  );
  console.log("Using vanity mint keypair:", mintKeypair.publicKey.toBase58());

  const existingMint = await provider.connection.getAccountInfo(mintKeypair.publicKey);
  const mint = existingMint
    ? mintKeypair.publicKey
    : await createMint(
        provider.connection,
        wallet.payer,
        wallet.publicKey,
        null,
        6,
        mintKeypair
      );

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  let metadataSignature = "(already exists)";
  const existingMetadata = await provider.connection.getAccountInfo(metadataPda);
  if (!existingMetadata) {
    console.log("Creating Metaplex metadata before mint authority is revoked...");
    const metadataTx = new Transaction().add(
      createMetadataInstruction({
        metadata: metadataPda,
        mint,
        mintAuthority: wallet.publicKey,
        payer: wallet.publicKey,
        updateAuthority: wallet.publicKey,
      })
    );
    metadataSignature = await provider.sendAndConfirm(metadataTx, []);
  } else {
    console.log("Metaplex metadata already exists; reusing it...");
  }

  let poolPda;
  let solVaultPda;
  let tokenVaultPda;
  let signature;

  if (LAUNCH_TYPE === "presale") {
    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("presale_pool"), mint.toBuffer()],
      program.programId
    );
    [solVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("presale_sol_vault"), mint.toBuffer()],
      program.programId
    );
    [tokenVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("presale_token_vault"), mint.toBuffer()],
      program.programId
    );

    const endTime = Math.floor(Date.now() / 1000) + PRESALE_END_SECONDS;
    const presaleMode =
      PRESALE_MODE.toLowerCase() === "extreme" ? { extreme: {} } : { regular: {} };

    console.log("Creating presale pool through launchpad contract...");
    signature = await program.methods
      .createPresalePool({
        migrationTarget: new anchor.BN(MIGRATION_TARGET),
        tokenSupply: new anchor.BN(TOKEN_SUPPLY),
        endTime: new anchor.BN(endTime),
        creatorPoolBps: CREATOR_POOL_BPS,
        presaleMode,
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
  } else {
    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_pool"), mint.toBuffer()],
      program.programId
    );
    [solVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_sol_vault"), mint.toBuffer()],
      program.programId
    );
    [tokenVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_token_vault"), mint.toBuffer()],
      program.programId
    );

    console.log("Creating bonding pool through launchpad contract...");
    signature = await program.methods
      .createBondingPool({
        virtualSolReserves:
          VIRTUAL_SOL_RESERVES === null ? null : new anchor.BN(VIRTUAL_SOL_RESERVES),
        virtualTokenReserves:
          VIRTUAL_TOKEN_RESERVES === null ? null : new anchor.BN(VIRTUAL_TOKEN_RESERVES),
        tokenSupply: new anchor.BN(TOKEN_SUPPLY),
        migrationTarget: new anchor.BN(MIGRATION_TARGET),
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
  }

  console.log("Token name:", TOKEN_NAME);
  console.log("Token symbol:", TOKEN_SYMBOL);
  console.log("Launch type:", LAUNCH_TYPE);
  console.log("Metadata URI:", TOKEN_URI || "(empty)");
  console.log("Mint:", mint.toBase58());
  console.log("Metadata:", metadataPda.toBase58());
  console.log("Bonding pool:", poolPda.toBase58());
  console.log("Token vault:", tokenVaultPda.toBase58());
  console.log("SOL vault:", solVaultPda.toBase58());
  console.log("Metadata transaction:", metadataSignature);
  console.log("Pool transaction:", signature);
  markMintKeypairUsed(mintKeypairPath, mint.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
