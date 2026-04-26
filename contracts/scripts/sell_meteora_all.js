const anchor = require("@coral-xyz/anchor");
const BN = require("bn.js");
const {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
} = require("@solana/spl-token");
const {
  ComputeBudgetProgram,
  PublicKey,
} = require("@solana/web3.js");
const {
  CpAmm,
  derivePoolAddress,
  deriveTokenVaultAddress,
  SwapMode,
} = require("@meteora-ag/cp-amm-sdk");

const MINT = new PublicKey(
  process.env.MINT || "p5JmfqFZbdGLCaAb4ErAXwPeXPzSDrryWaMewyfcpet"
);
const METEORA_POOL_CONFIG = new PublicKey(
  process.env.METEORA_POOL_CONFIG || "3KLdspUofc75aaEAJdBo1o6D6cyzXJVtGB8PgpWJEiaR"
);
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || "10000");
const PARTIAL_FILL = process.env.PARTIAL_FILL !== "0";

function solscan(pathname) {
  return `https://solscan.io/${pathname}?cluster=devnet`;
}

function uiAmount(amount, decimals) {
  const s = amount.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet;
  const connection = provider.connection;
  const cpAmm = new CpAmm(connection);

  const meteoraPool = derivePoolAddress(METEORA_POOL_CONFIG, NATIVE_MINT, MINT);
  const tokenAVault = deriveTokenVaultAddress(NATIVE_MINT, meteoraPool);
  const tokenBVault = deriveTokenVaultAddress(MINT, meteoraPool);
  const sellerTokenAccount = getAssociatedTokenAddressSync(
    MINT,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const mintInfo = await getMint(connection, MINT);
  const sellerBefore = await getAccount(connection, sellerTokenAccount);
  const solBefore = await connection.getBalance(wallet.publicKey);
  const poolState = await cpAmm.fetchPoolState(meteoraPool);
  const slot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(slot);

  const amountIn = new BN(sellerBefore.amount.toString());
  if (amountIn.isZero()) {
    throw new Error("Seller token balance is zero; nothing to sell.");
  }

  let quote = null;
  try {
    quote = cpAmm.getQuote({
      inAmount: amountIn,
      inputTokenMint: MINT,
      slippage: SLIPPAGE_BPS,
      poolState,
      currentTime: blockTime || Math.floor(Date.now() / 1000),
      currentSlot: slot,
      tokenADecimal: 9,
      tokenBDecimal: mintInfo.decimals,
      hasReferral: false,
    });
  } catch (err) {
    console.warn("Quote failed; continuing with minimumAmountOut=0:", err.message);
  }

  const minimumAmountOut = new BN(0);
  const expectedOut = quote ? quote.swapOutAmount : null;

  console.log("Selling all tokens in one clip...");
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Mint:", MINT.toBase58());
  console.log("Meteora pool:", meteoraPool.toBase58());
  console.log("Seller token account:", sellerTokenAccount.toBase58());
  console.log("Token amount in raw:", amountIn.toString());
  console.log("Token amount UI:", uiAmount(BigInt(amountIn.toString()), mintInfo.decimals));
  console.log("Expected SOL out:", expectedOut ? Number(expectedOut.toString()) / 1e9 : "unknown");
  console.log("Minimum SOL out:", "0");
  console.log("SOL before:", solBefore / 1e9);

  const swapParams = {
    payer: wallet.publicKey,
    pool: meteoraPool,
    inputTokenMint: MINT,
    outputTokenMint: NATIVE_MINT,
    amountIn,
    minimumAmountOut,
    tokenAMint: NATIVE_MINT,
    tokenBMint: MINT,
    tokenAVault,
    tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    referralTokenAccount: null,
    poolState,
  };
  const tx = PARTIAL_FILL
    ? await cpAmm.swap2({
        ...swapParams,
        swapMode: SwapMode.PartialFill,
      })
    : await cpAmm.swap(swapParams);

  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  );

  const signature = await provider.sendAndConfirm(tx, []);
  const solAfter = await connection.getBalance(wallet.publicKey);
  const sellerAfter = await getAccount(connection, sellerTokenAccount);

  console.log("Transaction:", signature);
  console.log("Solscan transaction:", solscan(`tx/${signature}`));
  console.log("SOL after:", solAfter / 1e9);
  console.log("SOL delta:", (solAfter - solBefore) / 1e9);
  console.log("Token amount after raw:", sellerAfter.amount.toString());
  console.log("Token amount after UI:", uiAmount(sellerAfter.amount, mintInfo.decimals));
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
