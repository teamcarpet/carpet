use crate::errors::LaunchpadError;
use anchor_lang::prelude::*;

/// Presale round schedule mode
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum PresaleMode {
    /// Regular: 6 rounds × 10% every 4 hours = 60% treasury burn over 24h
    Regular,
    /// Extreme: 12 rounds × 5% every 30 minutes = 60% treasury burn over 6h
    Extreme,
}

impl PresaleMode {
    /// Total number of buyback rounds scheduled
    pub const fn total_rounds(&self) -> u8 {
        match self {
            PresaleMode::Regular => 6,
            PresaleMode::Extreme => 12,
        }
    }

    /// Basis points burned from treasury each round
    /// Regular: 1000 bps (10%), Extreme: 500 bps (5%)
    pub const fn bps_per_round(&self) -> u16 {
        match self {
            PresaleMode::Regular => 1000,
            PresaleMode::Extreme => 500,
        }
    }

    /// Seconds between rounds
    /// Regular: 14400 (4h), Extreme: 1800 (30min)
    pub const fn round_interval_seconds(&self) -> i64 {
        match self {
            PresaleMode::Regular => 14_400,
            PresaleMode::Extreme => 1_800,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct PresalePool {
    /// Pool creator
    pub creator: Pubkey,
    /// Token mint
    pub mint: Pubkey,

    /// SOL target for migration (lamports, 100-10000 SOL)
    pub migration_target: u64,
    /// Total SOL raised so far (lamports)
    pub current_raised: u64,
    /// Total token supply for distribution
    pub total_token_supply: u64,

    /// Max contribution per wallet in basis points (100 = 1%)
    pub max_buy_bps: u16,
    /// Creator pool percentage in basis points (2000 = 20%)
    pub creator_pool_bps: u16,

    /// Presale end time (unix timestamp)
    pub end_time: i64,

    /// Number of unique contributors
    pub num_contributors: u32,

    /// Buyback schedule mode — chosen at pool creation, immutable
    pub presale_mode: PresaleMode,

    /// Pool has been migrated to Meteora
    pub is_migrated: bool,
    /// Pool-level pause
    pub is_paused: bool,

    /// PDA bump
    pub bump: u8,
    /// SOL vault bump
    pub sol_vault_bump: u8,
    /// Token vault bump
    pub token_vault_bump: u8,
}

impl PresalePool {
    pub const SPACE: usize = 110;
    pub const SEED: &'static [u8] = b"presale_pool";
    pub const SOL_VAULT_SEED: &'static [u8] = b"presale_sol_vault";
    pub const TOKEN_VAULT_SEED: &'static [u8] = b"presale_token_vault";

    /// Minimum migration target: 100 SOL
    pub const MIN_MIGRATION_TARGET: u64 = 100_000_000_000; // 100 SOL in lamports
    /// Maximum migration target: 10,000 SOL
    pub const MAX_MIGRATION_TARGET: u64 = 10_000_000_000_000; // 10,000 SOL in lamports
}

pub fn require_presale_pool_active(is_paused: bool) -> Result<()> {
    require!(!is_paused, LaunchpadError::PoolPaused);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paused_presale_pool_rejects_actions() {
        assert!(require_presale_pool_active(true).is_err());
        assert!(require_presale_pool_active(false).is_ok());
    }
}
