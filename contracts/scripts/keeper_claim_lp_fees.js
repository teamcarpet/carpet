const anchor = require("@coral-xyz/anchor");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { ComputeBudgetProgram, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } = require("@solana/web3.js");
const {
  CP_AMM_PROGRAM_ID,
  derivePoolAuthority,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveTokenVaultAddress,
} = require("@meteora-ag/cp-amm-sdk");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_POOLS = Number(process.env.MAX_POOLS || "0");
const MINT_FILTER = process.env.MINT ? new PublicKey(process.env.MINT) : null;

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

async function getPoolCreator(program, buybackState) {
  if (buybackState.poolType === 0) {
    const pool = await program.account.bondingCurvePool.fetch(buybackState.pool);
    return pool.creator;
  }
  const pool = await program.account.presalePool.fetch(buybackState.pool);
  return pool.creator;
}

async function harvestAndSplit({ program, provider, buybackState, buybackStatePda }) {
  const [tokenAFeeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_fee_vault"), buybackState.pool.toBuffer(), NATIVE_MINT.toBuffer()],
    program.programId
  );
  const [tokenBFeeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_fee_vault"), buybackState.pool.toBuffer(), buybackState.mint.toBuffer()],
    program.programId
  );

  const configPda = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  )[0];
  const config = await program.account.globalConfig.fetch(configPda);
  const creator = await getPoolCreator(program, buybackState);
  const keeper = provider.wallet.publicKey;
  const position = derivePositionAddress(buybackState.positionNftMint);
  const positionNftAccount = derivePositionNftAccount(buybackState.positionNftMint);
  const meteoraTokenAVault = deriveTokenVaultAddress(NATIVE_MINT, buybackState.meteoraPool);
  const meteoraTokenBVault = deriveTokenVaultAddress(buybackState.mint, buybackState.meteoraPool);
  const meteoraEventAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    CP_AMM_PROGRAM_ID
  )[0];

  const creatorFeeAccountA = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    NATIVE_MINT,
    creator,
    true
  );
  const protocolFeeAccountA = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    NATIVE_MINT,
    config.platformWallet,
    true
  );
  const keeperFeeAccountA = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    NATIVE_MINT,
    keeper
  );
  const creatorFeeAccountB = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    buybackState.mint,
    creator,
    true
  );
  const protocolFeeAccountB = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    buybackState.mint,
    config.platformWallet,
    true
  );
  const keeperFeeAccountB = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    buybackState.mint,
    keeper
  );

  console.log("Meteora pool:", buybackState.meteoraPool.toBase58());
  console.log("Position:", position.toBase58());
  console.log("Position NFT account:", positionNftAccount.toBase58());
  console.log("Creator:", creator.toBase58());
  console.log("Platform:", config.platformWallet.toBase58());
  console.log("Keeper:", keeper.toBase58());

  if (DRY_RUN) {
    return { dryRun: true };
  }

  const txSig = await program.methods
    .harvestAndSplitLpFees()
    .accounts({
      payer: keeper,
      buybackState: buybackStatePda,
      lpCustody: buybackState.lpCustody,
      tokenAFeeVault,
      tokenBFeeVault,
      creatorFeeAccountA: creatorFeeAccountA.address,
      protocolFeeAccountA: protocolFeeAccountA.address,
      keeperFeeAccountA: keeperFeeAccountA.address,
      creatorFeeAccountB: creatorFeeAccountB.address,
      protocolFeeAccountB: protocolFeeAccountB.address,
      keeperFeeAccountB: keeperFeeAccountB.address,
      meteoraProgram: CP_AMM_PROGRAM_ID,
      meteoraPool: buybackState.meteoraPool,
      meteoraPoolAuthority: derivePoolAuthority(),
      position,
      positionNftAccount,
      meteoraTokenAVault,
      meteoraTokenBVault,
      tokenAMint: NATIVE_MINT,
      tokenBMint: buybackState.mint,
      meteoraEventAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
    ])
    .rpc();

  return { signature: txSig, link: solscan(`tx/${txSig}`) };
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(loadIdl(), provider);

  const discriminator = crypto
    .createHash("sha256")
    .update("account:BuybackState")
    .digest()
    .subarray(0, 8);
  const rawStates = await provider.connection.getProgramAccounts(program.programId, {
    filters: [{ memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(discriminator) } }],
  });

  let processed = 0;
  let submitted = 0;

  for (const { pubkey, account: rawAccount } of rawStates) {
    let account;
    try {
      account = program.coder.accounts.decode("buybackState", rawAccount.data);
    } catch (err) {
      console.warn("Skipping incompatible buyback state:", pubkey.toBase58(), err.message);
      continue;
    }

    if (MINT_FILTER && !account.mint.equals(MINT_FILTER)) {
      continue;
    }
    if (MAX_POOLS > 0 && processed >= MAX_POOLS) {
      break;
    }
    processed += 1;

    console.log("Pool:", account.pool.toBase58());
    console.log("Buyback state:", pubkey.toBase58());

    const result = await harvestAndSplit({
      program,
      provider,
      buybackState: account,
      buybackStatePda: pubkey,
    });
    if (result?.signature) {
      submitted += 1;
      console.log("Submitted:", result.signature);
      console.log("Solscan:", result.link);
    }
  }

  console.log("Processed pools:", processed);
  console.log("Submitted transactions:", submitted);
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
