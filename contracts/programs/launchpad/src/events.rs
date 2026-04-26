use anchor_lang::prelude::*;

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub pool_type: u8, // 0 = bonding, 1 = presale
    pub migration_target: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBought {
    pub pool: Pubkey,
    pub buyer: Pubkey,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub creator_fee: u64,
    pub platform_fee: u64,
    pub new_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensSold {
    pub pool: Pubkey,
    pub seller: Pubkey,
    pub token_amount: u64,
    pub sol_amount: u64,
    pub creator_fee: u64,
    pub platform_fee: u64,
    pub sell_tax: u64,
    pub new_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PresaleContribution {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub sol_amount: u64,
    pub total_raised: u64,
    pub timestamp: i64,
}

#[event]
pub struct PresaleClaimed {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub token_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct PresaleRefunded {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub sol_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct MigrationCompleted {
    pub pool: Pubkey,
    pub pool_type: u8,
    pub meteora_pool: Pubkey,
    pub liquidity_sol: u64,
    pub liquidity_tokens: u64,
    pub platform_fee: u64,
    pub buyback_allocation: u64,
    pub timestamp: i64,
}

#[event]
pub struct MigrationReady {
    pub pool: Pubkey,
    pub sol_raised: u64,
    pub timestamp: i64,
}

#[event]
pub struct BuybackExecuted {
    pub pool: Pubkey,
    pub sol_spent: u64,
    pub tokens_received: u64,
    pub mode: u8, // 0 = burn, 1 = add liquidity
    /// Round number after this execution (1-indexed). 0 for bonding pools.
    pub round_number: u8,
    /// Total scheduled rounds. 0 for bonding pools.
    pub total_rounds: u8,
    pub timestamp: i64,
}

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub timestamp: i64,
}
