use anchor_lang::prelude::*;

use crate::errors::LaunchpadError;
use crate::events::ConfigUpdated;
use crate::state::{GlobalConfig, KEEPER_WALLET};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub pause_authority: Pubkey,
    pub dev_wallet: Pubkey,
    pub platform_wallet: Pubkey,
    pub dev_fee_bps: u16,
    pub platform_fee_bps: u16,
    pub sell_tax_bps: u16,
    pub presale_platform_fee_bps: u16,
    pub migration_fee_bps: u16,
    pub creator_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub keeper_fee_bps: u16,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GlobalConfig::SEED],
        bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // Validate fee params don't exceed reasonable limits
    require!(
        params.dev_fee_bps <= 500 && params.platform_fee_bps <= 500,
        LaunchpadError::InvalidFeeConfig
    );
    require!(
        params.sell_tax_bps <= 5000, // max 50%
        LaunchpadError::InvalidFeeConfig
    );
    require!(
        params.migration_fee_bps <= 500, // max 5%
        LaunchpadError::InvalidFeeConfig
    );
    require!(
        params.presale_platform_fee_bps <= 500, // max 5%
        LaunchpadError::InvalidFeeConfig
    );
    require!(
        protocol_fee_split_is_valid(
            params.creator_fee_bps,
            params.protocol_fee_bps,
            params.keeper_fee_bps,
        ),
        LaunchpadError::InvalidFeeConfig
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.pause_authority = params.pause_authority;
    config.dev_wallet = params.dev_wallet;
    config.platform_wallet = params.platform_wallet;
    config.dev_fee_bps = params.dev_fee_bps;
    config.platform_fee_bps = params.platform_fee_bps;
    config.sell_tax_bps = params.sell_tax_bps;
    config.presale_platform_fee_bps = params.presale_platform_fee_bps;
    config.migration_fee_bps = params.migration_fee_bps;
    config.creator_fee_bps = params.creator_fee_bps;
    config.protocol_fee_bps = params.protocol_fee_bps;
    config.keeper_fee_bps = params.keeper_fee_bps;
    config.keeper_wallet = KEEPER_WALLET;
    config.pending_admin = Pubkey::default();
    config.is_paused = false;
    config.bump = ctx.bumps.config;

    emit!(ConfigUpdated {
        admin: ctx.accounts.admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn protocol_fee_split_is_valid(
    creator_fee_bps: u16,
    protocol_fee_bps: u16,
    keeper_fee_bps: u16,
) -> bool {
    (creator_fee_bps as u32) + (protocol_fee_bps as u32) + (keeper_fee_bps as u32) == 10_000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_fee_split_must_sum_to_100_percent() {
        assert!(protocol_fee_split_is_valid(7000, 2950, 50));
        assert!(protocol_fee_split_is_valid(7000, 3000, 0));
        assert!(!protocol_fee_split_is_valid(7000, 2999, 0));
        assert!(!protocol_fee_split_is_valid(10_000, 1, 0));
    }
}
