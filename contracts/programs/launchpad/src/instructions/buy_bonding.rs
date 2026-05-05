use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::LaunchpadError;
use crate::events::{MigrationReady, TokensBought};
use crate::math::{bonding_curve, fees};
use crate::state::{BondingCurvePool, GlobalConfig, UserPosition};

#[derive(Accounts)]
pub struct BuyBonding<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ LaunchpadError::PlatformPaused,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        seeds = [BondingCurvePool::SEED, pool.mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_migrated @ LaunchpadError::AlreadyMigrated,
        constraint = !pool.is_paused @ LaunchpadError::PoolPaused,
    )]
    pub pool: Box<Account<'info, BondingCurvePool>>,

    /// Per-wallet position tracking for max buy enforcement (H-2 fix)
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [UserPosition::SEED, pool.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub buyer_position: Account<'info, UserPosition>,

    /// SOL vault PDA
    #[account(
        mut,
        seeds = [BondingCurvePool::SOL_VAULT_SEED, pool.mint.as_ref()],
        bump = pool.sol_vault_bump,
    )]
    pub sol_vault: SystemAccount<'info>,

    /// Token vault
    #[account(
        mut,
        token::mint = pool.mint,
        token::authority = pool,
        seeds = [BondingCurvePool::TOKEN_VAULT_SEED, pool.mint.as_ref()],
        bump = pool.token_vault_bump,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    /// Buyer's token account
    #[account(
        mut,
        token::mint = pool.mint,
        token::authority = buyer,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Validated against the pool creator
    #[account(
        mut,
        constraint = creator_wallet.key() == pool.creator @ LaunchpadError::InvalidFeeConfig,
    )]
    pub creator_wallet: SystemAccount<'info>,

    /// CHECK: Validated against config
    #[account(
        mut,
        constraint = platform_wallet.key() == config.platform_wallet @ LaunchpadError::InvalidFeeConfig,
    )]
    pub platform_wallet: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_buy_bonding(
    ctx: Context<BuyBonding>,
    sol_amount: u64,
    min_tokens_out: u64,
) -> Result<()> {
    require!(sol_amount > 0, LaunchpadError::ZeroAmount);

    let pool = &ctx.accounts.pool;
    let config = &ctx.accounts.config;

    // ── CHECKS ──────────────────────────────────────────────────────

    require!(
        bonding_trading_open(pool.real_sol_reserves, pool.migration_target),
        LaunchpadError::MigrationTargetReached
    );

    let buy_fees =
        fees::calculate_buy_fees(sol_amount, config.dev_fee_bps, config.platform_fee_bps)?;

    let tokens_out = bonding_curve::calculate_buy_amount(
        pool.virtual_sol_reserves,
        pool.virtual_token_reserves,
        buy_fees.net_amount,
    )?;

    require!(tokens_out > 0, LaunchpadError::ZeroAmount);

    // H-1: Slippage protection
    require!(
        tokens_out >= min_tokens_out,
        LaunchpadError::SlippageExceeded
    );

    // H-2: Per-wallet max buy check (cumulative, not per-tx)
    let max_tokens: u128 = (pool.initial_real_token_reserves as u128)
        .checked_mul(pool.max_buy_bps as u128)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(10_000u128)
        .ok_or(LaunchpadError::DivisionByZero)?;
    let max_tokens = u64::try_from(max_tokens).map_err(|_| LaunchpadError::CastOverflow)?;

    let cumulative = ctx
        .accounts
        .buyer_position
        .amount
        .checked_add(tokens_out)
        .ok_or(LaunchpadError::MathOverflow)?;
    require!(cumulative <= max_tokens, LaunchpadError::ExceedsMaxBuy);

    require!(
        tokens_out <= pool.real_token_reserves,
        LaunchpadError::InsufficientTokenReserves
    );

    // ── PRE-CAPTURE ─────────────────────────────────────────────────
    let pool_key = ctx.accounts.pool.key();
    let mint_key = ctx.accounts.pool.mint;
    let pool_bump = ctx.accounts.pool.bump;

    // ── EFFECTS ─────────────────────────────────────────────────────

    // Update buyer position (tracking cumulative tokens bought)
    if ctx.accounts.buyer_position.amount == 0 {
        ctx.accounts.buyer_position.user = ctx.accounts.buyer.key();
        ctx.accounts.buyer_position.pool = pool_key;
        ctx.accounts.buyer_position.bump = ctx.bumps.buyer_position;
    }
    ctx.accounts.buyer_position.amount = cumulative;

    let pool = &mut ctx.accounts.pool;

    pool.virtual_sol_reserves = pool
        .virtual_sol_reserves
        .checked_add(buy_fees.net_amount)
        .ok_or(LaunchpadError::MathOverflow)?;
    pool.virtual_token_reserves = pool
        .virtual_token_reserves
        .checked_sub(tokens_out)
        .ok_or(LaunchpadError::MathUnderflow)?;
    pool.real_sol_reserves = pool
        .real_sol_reserves
        .checked_add(buy_fees.net_amount)
        .ok_or(LaunchpadError::MathOverflow)?;
    pool.real_token_reserves = pool
        .real_token_reserves
        .checked_sub(tokens_out)
        .ok_or(LaunchpadError::MathUnderflow)?;

    let migration_ready = pool.real_sol_reserves >= pool.migration_target;
    let new_vsr = pool.virtual_sol_reserves;
    let new_vtr = pool.virtual_token_reserves;
    let real_sol = pool.real_sol_reserves;
    let _ = pool;

    // ── INTERACTIONS ────────────────────────────────────────────────

    // SOL: buyer → sol_vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            },
        ),
        buy_fees.net_amount,
    )?;

    // Creator fee
    if buy_fees.creator_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.creator_wallet.to_account_info(),
                },
            ),
            buy_fees.creator_fee,
        )?;
    }

    // Platform fee
    if buy_fees.platform_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.platform_wallet.to_account_info(),
                },
            ),
            buy_fees.platform_fee,
        )?;
    }

    // Tokens: vault → buyer
    let signer_seeds: &[&[&[u8]]] = &[&[BondingCurvePool::SEED, mint_key.as_ref(), &[pool_bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        tokens_out,
    )?;

    // ── EVENTS ──────────────────────────────────────────────────────

    let new_price = bonding_curve::calculate_price(new_vsr, new_vtr)?;

    emit!(TokensBought {
        pool: pool_key,
        buyer: ctx.accounts.buyer.key(),
        sol_amount,
        token_amount: tokens_out,
        creator_fee: buy_fees.creator_fee,
        platform_fee: buy_fees.platform_fee,
        new_price,
        timestamp: Clock::get()?.unix_timestamp,
    });

    if migration_ready {
        emit!(MigrationReady {
            pool: pool_key,
            sol_raised: real_sol,
            timestamp: Clock::get()?.unix_timestamp,
        });
    }

    Ok(())
}

fn bonding_trading_open(real_sol_reserves: u64, migration_target: u64) -> bool {
    real_sol_reserves < migration_target
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cannot_buy_after_migration_target() {
        assert!(bonding_trading_open(99, 100));
        assert!(!bonding_trading_open(100, 100));
        assert!(!bonding_trading_open(101, 100));
    }
}
