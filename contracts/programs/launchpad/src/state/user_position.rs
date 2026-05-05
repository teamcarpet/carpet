use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    /// User public key
    pub user: Pubkey,
    /// Pool this position belongs to
    pub pool: Pubkey,

    /// Position amount.
    /// Bonding pools use this as cumulative tokens bought.
    /// Presale pools use this as cumulative SOL contributed.
    pub amount: u64,

    /// Whether tokens have been claimed (presale only)
    pub tokens_claimed: bool,
    /// Whether refund has been claimed (presale only)
    pub refund_claimed: bool,

    /// PDA bump
    pub bump: u8,
}

impl UserPosition {
    pub const SEED: &'static [u8] = b"position";
}
