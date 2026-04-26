use anchor_lang::prelude::*;

/// Buyback modes for presale
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BuybackMode {
    /// Swap SOL → token, then burn tokens (deflationary)
    Burn,
}

#[account]
#[derive(InitSpace)]
pub struct BuybackState {
    /// Associated pool pubkey
    pub pool: Pubkey,
    /// Associated token mint
    pub mint: Pubkey,
    /// Meteora DAMM pool created during migration — validated on every buyback
    pub meteora_pool: Pubkey,
    /// Program PDA that owns/custodies the LP position.
    pub lp_custody: Pubkey,
    /// Meteora position NFT mint for the principal LP position.
    pub position_nft_mint: Pubkey,

    /// SOL remaining in buyback treasury (lamports)
    pub treasury_balance: u64,
    /// Initial treasury at migration time — used as the *fixed* base for
    /// `bps_per_round` calculations so every round spends the same absolute
    /// SOL regardless of remaining balance. Without this the 5th round
    /// would spend 10% of what's left, not 10% of the original pool.
    pub initial_treasury: u64,
    /// Last slot a buyback was executed
    pub last_buyback_slot: u64,
    /// Last unix timestamp a buyback was executed (for presale interval gating)
    pub last_buyback_ts: i64,
    /// Total SOL spent on buybacks
    pub total_sol_spent: u64,
    /// Total tokens bought back
    pub total_tokens_bought: u64,
    /// Total tokens burned
    pub total_tokens_burned: u64,
    /// Explicit idle token accounting. Must remain zero for burn-only buybacks.
    pub idle_tokens: u64,

    /// Creator share of claimed LP fees in basis points.
    pub creator_fee_bps: u16,
    /// Protocol share of claimed LP fees in basis points.
    pub protocol_fee_bps: u16,
    /// Keeper reward share of claimed LP fees in basis points.
    pub keeper_fee_bps: u16,
    /// Creator token allocation claimable from the presale vault.
    pub creator_token_allocation: u64,
    /// Creator tokens already claimed.
    pub creator_tokens_claimed: u64,
    /// Total token-A LP fees distributed.
    pub total_lp_fees_claimed_a: u64,
    /// Total token-B LP fees distributed.
    pub total_lp_fees_claimed_b: u64,

    /// Pool type (0 = bonding, 1 = presale)
    pub pool_type: u8,

    /// ── Presale scheduled-round fields (unused for bonding) ─────────
    /// Total rounds configured (6 for Regular, 12 for Extreme; 0 for bonding)
    pub total_rounds: u8,
    /// Rounds already executed
    pub rounds_executed: u8,
    /// BPS of `initial_treasury` spent per round (1000 = 10%, 500 = 5%)
    pub bps_per_round: u16,
    /// Seconds between rounds (14_400 or 1_800 for presale)
    pub round_interval_seconds: i64,

    /// PDA bump
    pub bump: u8,
}

impl BuybackState {
    pub const SEED: &'static [u8] = b"buyback";
    pub const LP_CUSTODY_SEED: &'static [u8] = b"lp_custody";
    pub const LP_FEE_VAULT_SEED: &'static [u8] = b"lp_fee_vault";

    /// Minimum slots between buybacks for BONDING pools (~4 seconds).
    /// Presale uses `round_interval_seconds` instead.
    pub const MIN_BUYBACK_INTERVAL: u64 = 10;

    /// Bonding curve: 1% of treasury each buyback cycle.
    /// Keeps permissionless cranks deterministic while avoiding oversized
    /// swaps that can push a fresh Meteora position outside its price range.
    pub const BONDING_BUYBACK_BPS: u64 = 100;

    /// Grace window: allow a round to fire up to this many seconds early.
    /// Protects against bot-clock skew without letting anyone spam rounds.
    pub const ROUND_GRACE_SECONDS: i64 = 30;
}
