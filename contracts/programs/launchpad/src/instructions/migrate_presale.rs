use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, SyncNative, Token, TokenAccount};

use crate::cpi_meteora::{
    self, InitializePoolAccounts, InitializePoolParams, METEORA_PROGRAM_ID, POOL_AUTHORITY,
    TOKEN_2022_PROGRAM_ID,
};
use crate::errors::LaunchpadError;
use crate::events::MigrationCompleted;
use crate::math::fees;
use crate::state::{BuybackState, GlobalConfig, PresalePool};

#[derive(Accounts)]
pub struct MigratePresale<'info> {
    /// C-6: Only admin can trigger migration
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ LaunchpadError::PlatformPaused,
        constraint = config.admin == payer.key() @ LaunchpadError::UnauthorizedAdmin,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        seeds = [PresalePool::SEED, pool.mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_migrated @ LaunchpadError::AlreadyMigrated,
        constraint = pool.current_raised >= pool.migration_target
            @ LaunchpadError::MigrationTargetNotReached,
    )]
    pub pool: Box<Account<'info, PresalePool>>,

    /// SOL vault
    #[account(
        mut,
        seeds = [PresalePool::SOL_VAULT_SEED, pool.mint.as_ref()],
        bump = pool.sol_vault_bump,
    )]
    pub sol_vault: SystemAccount<'info>,

    /// Token vault
    #[account(
        mut,
        token::mint = pool.mint,
        token::authority = pool,
        seeds = [PresalePool::TOKEN_VAULT_SEED, pool.mint.as_ref()],
        bump = pool.token_vault_bump,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    /// Buyback state account
    #[account(
        init,
        payer = payer,
        space = 8 + BuybackState::INIT_SPACE,
        seeds = [BuybackState::SEED, pool.key().as_ref()],
        bump,
    )]
    pub buyback_state: Box<Account<'info, BuybackState>>,

    /// Token vault for buyback — tokens land here during buyback
    #[account(
        init,
        payer = payer,
        token::mint = token_mint,
        token::authority = buyback_state,
        seeds = [crate::instructions::execute_buyback::BUYBACK_TOKEN_VAULT_SEED, pool.key().as_ref()],
        bump,
    )]
    pub buyback_token_vault: Box<Account<'info, TokenAccount>>,

    /// Platform wallet
    /// CHECK: Validated against config
    #[account(
        mut,
        constraint = platform_wallet.key() == config.platform_wallet @ LaunchpadError::InvalidFeeConfig,
    )]
    pub platform_wallet: SystemAccount<'info>,

    /// Creator wallet receives the creator SOL allocation.
    #[account(
        mut,
        constraint = creator_wallet.key() == pool.creator @ LaunchpadError::UnauthorizedCreator,
    )]
    pub creator_wallet: SystemAccount<'info>,

    // ── Meteora accounts ────────────────────────────────────────────
    /// CHECK: Meteora DAMM v2 program
    #[account(constraint = meteora_program.key() == METEORA_PROGRAM_ID @ LaunchpadError::InvalidPoolParams)]
    pub meteora_program: UncheckedAccount<'info>,

    /// CHECK: Meteora pool account
    #[account(mut)]
    pub meteora_pool: UncheckedAccount<'info>,

    /// CHECK: Meteora pool config
    pub meteora_pool_config: UncheckedAccount<'info>,

    /// CHECK: Meteora pool authority PDA
    #[account(constraint = meteora_pool_authority.key() == POOL_AUTHORITY @ LaunchpadError::InvalidPoolParams)]
    pub meteora_pool_authority: UncheckedAccount<'info>,

    /// CHECK: SPL Token-2022 program used by Meteora for position NFTs
    #[account(constraint = token_2022_program.key() == TOKEN_2022_PROGRAM_ID @ LaunchpadError::InvalidPoolParams)]
    pub token_2022_program: UncheckedAccount<'info>,

    /// CHECK: Meteora event authority PDA
    pub meteora_event_authority: UncheckedAccount<'info>,

    /// CHECK: Program PDA that owns/custodies the LP position.
    #[account(
        seeds = [BuybackState::LP_CUSTODY_SEED, pool.key().as_ref()],
        bump,
        constraint = lp_custody.key() != payer.key() @ LaunchpadError::AdminLpCustody,
    )]
    pub lp_custody: UncheckedAccount<'info>,

    /// CHECK: Position NFT mint (signer keypair)
    #[account(mut)]
    pub position_nft_mint: Signer<'info>,

    /// CHECK: Position NFT token account
    #[account(mut)]
    pub position_nft_account: UncheckedAccount<'info>,

    /// CHECK: Position account
    #[account(mut)]
    pub position_account: UncheckedAccount<'info>,

    /// CHECK: Position NFT metadata
    #[account(mut)]
    pub position_nft_metadata: UncheckedAccount<'info>,

    /// CHECK: Meteora token vault A (SOL/WSOL), initialized by Meteora CPI
    #[account(mut)]
    pub meteora_vault_a: UncheckedAccount<'info>,

    /// CHECK: Meteora token vault B (token), initialized by Meteora CPI
    #[account(mut)]
    pub meteora_vault_b: UncheckedAccount<'info>,

    /// C-7: WSOL mint validated
    /// CHECK: Hardcoded address
    #[account(
        constraint = wsol_mint.key() == anchor_spl::token::spl_token::native_mint::id()
            @ LaunchpadError::InvalidPoolParams
    )]
    pub wsol_mint: UncheckedAccount<'info>,

    /// H-4: Token mint for Meteora + buyback vault init
    #[account(constraint = token_mint.key() == pool.mint @ LaunchpadError::InvalidPoolParams)]
    #[account(
        constraint = token_mint.freeze_authority.is_none() @ LaunchpadError::MintFreezable,
        constraint = token_mint.mint_authority.is_none() @ LaunchpadError::UnsafeMintAuthority,
    )]
    pub token_mint: Account<'info, Mint>,

    /// Payer WSOL account
    #[account(
        mut,
        token::mint = wsol_mint.key(),
        token::authority = payer,
    )]
    pub payer_wsol_account: Box<Account<'info, TokenAccount>>,

    /// Payer token account
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = payer,
    )]
    pub payer_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_migrate_presale(ctx: Context<MigratePresale>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let config = &ctx.accounts.config;

    // ── CALCULATE SPLITS ────────────────────────────────────────────
    let total_sol = pool.current_raised;

    let (migration_fee, liquidity_sol, creator_sol, buyback_sol) =
        calculate_presale_sol_split(total_sol, config.migration_fee_bps)?;
    // Tokens for liquidity: 20% of total supply
    let liquidity_tokens = fees::apply_bps(pool.total_token_supply, 2000)?;
    let creator_token_allocation = fees::apply_bps(pool.total_token_supply, pool.creator_pool_bps)?;

    let sqrt_price = cpi_meteora::calculate_init_sqrt_price(liquidity_sol, liquidity_tokens)?;
    let initial_liquidity =
        cpi_meteora::calculate_initial_liquidity(liquidity_sol, liquidity_tokens, sqrt_price)?;

    // ── PRE-CAPTURE ─────────────────────────────────────────────────
    let pool_key = ctx.accounts.pool.key();
    let pool_mint = ctx.accounts.pool.mint;
    let pool_bump = ctx.accounts.pool.bump;

    // ── EFFECTS ─────────────────────────────────────────────────────
    ctx.accounts.pool.is_migrated = true;

    let mode = ctx.accounts.pool.presale_mode;
    ctx.accounts.buyback_state.pool = pool_key;
    ctx.accounts.buyback_state.mint = pool_mint;
    ctx.accounts.buyback_state.meteora_pool = ctx.accounts.meteora_pool.key();
    ctx.accounts.buyback_state.lp_custody = ctx.accounts.lp_custody.key();
    ctx.accounts.buyback_state.position_nft_mint = ctx.accounts.position_nft_mint.key();
    ctx.accounts.buyback_state.treasury_balance = buyback_sol;
    ctx.accounts.buyback_state.initial_treasury = buyback_sol;
    ctx.accounts.buyback_state.last_buyback_slot = 0;
    ctx.accounts.buyback_state.last_buyback_ts = 0;
    ctx.accounts.buyback_state.total_sol_spent = 0;
    ctx.accounts.buyback_state.total_tokens_bought = 0;
    ctx.accounts.buyback_state.total_tokens_burned = 0;
    ctx.accounts.buyback_state.idle_tokens = 0;
    ctx.accounts.buyback_state.creator_fee_bps = config.creator_fee_bps;
    ctx.accounts.buyback_state.protocol_fee_bps = config.protocol_fee_bps;
    ctx.accounts.buyback_state.keeper_fee_bps = config.keeper_fee_bps;
    ctx.accounts.buyback_state.creator_token_allocation = creator_token_allocation;
    ctx.accounts.buyback_state.creator_tokens_claimed = 0;
    ctx.accounts.buyback_state.total_lp_fees_claimed_a = 0;
    ctx.accounts.buyback_state.total_lp_fees_claimed_b = 0;
    ctx.accounts.buyback_state.pool_type = 1;
    ctx.accounts.buyback_state.total_rounds = mode.total_rounds();
    ctx.accounts.buyback_state.rounds_executed = 0;
    ctx.accounts.buyback_state.bps_per_round = mode.bps_per_round();
    ctx.accounts.buyback_state.round_interval_seconds = mode.round_interval_seconds();
    ctx.accounts.buyback_state.bump = ctx.bumps.buyback_state;

    // ── INTERACTIONS ────────────────────────────────────────────────

    let sol_vault_signer: &[&[&[u8]]] = &[&[
        PresalePool::SOL_VAULT_SEED,
        pool_mint.as_ref(),
        &[ctx.accounts.pool.sol_vault_bump],
    ]];

    // 1. Migration fee → platform
    if migration_fee > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.platform_wallet.to_account_info(),
                },
                sol_vault_signer,
            ),
            migration_fee,
        )?;
    }

    // 2. Creator SOL allocation → creator wallet
    if creator_sol > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.creator_wallet.to_account_info(),
                },
                sol_vault_signer,
            ),
            creator_sol,
        )?;
    }

    // 3. Liquidity SOL → payer WSOL account
    if liquidity_sol > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.payer_wsol_account.to_account_info(),
                },
                sol_vault_signer,
            ),
            liquidity_sol,
        )?;
        token::sync_native(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SyncNative {
                account: ctx.accounts.payer_wsol_account.to_account_info(),
            },
        ))?;
    }

    // 4. Liquidity tokens → payer token account
    if liquidity_tokens > 0 {
        let pool_signer_seeds: &[&[&[u8]]] =
            &[&[PresalePool::SEED, pool_mint.as_ref(), &[pool_bump]]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.payer_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                pool_signer_seeds,
            ),
            liquidity_tokens,
        )?;
    }

    // 5. CPI: Create Meteora DAMM v2 pool
    let meteora_accounts = InitializePoolAccounts {
        creator: ctx.accounts.lp_custody.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        position_nft_mint: ctx.accounts.position_nft_mint.to_account_info(),
        position_nft_account: ctx.accounts.position_nft_account.to_account_info(),
        token_a_mint: ctx.accounts.wsol_mint.to_account_info(),
        token_b_mint: ctx.accounts.token_mint.to_account_info(),
        token_a_vault: ctx.accounts.meteora_vault_a.to_account_info(),
        token_b_vault: ctx.accounts.meteora_vault_b.to_account_info(),
        payer_token_a: ctx.accounts.payer_wsol_account.to_account_info(),
        payer_token_b: ctx.accounts.payer_token_account.to_account_info(),
        pool: ctx.accounts.meteora_pool.to_account_info(),
        pool_config: ctx.accounts.meteora_pool_config.to_account_info(),
        pool_authority: ctx.accounts.meteora_pool_authority.to_account_info(),
        position: ctx.accounts.position_account.to_account_info(),
        token_program_a: ctx.accounts.token_program.to_account_info(),
        token_program_b: ctx.accounts.token_program.to_account_info(),
        token_2022_program: ctx.accounts.token_2022_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        event_authority: ctx.accounts.meteora_event_authority.to_account_info(),
        meteora_program: ctx.accounts.meteora_program.to_account_info(),
    };

    cpi_meteora::cpi_initialize_pool(
        &meteora_accounts,
        &InitializePoolParams {
            liquidity: initial_liquidity,
            sqrt_price,
            activation_point: None,
        },
        &[],
    )?;

    // ── EVENTS ──────────────────────────────────────────────────────

    emit!(MigrationCompleted {
        pool: pool_key,
        pool_type: 1,
        meteora_pool: ctx.accounts.meteora_pool.key(),
        liquidity_sol,
        liquidity_tokens,
        platform_fee: migration_fee,
        buyback_allocation: buyback_sol,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn calculate_presale_sol_split(
    total_sol: u64,
    migration_fee_bps: u16,
) -> Result<(u64, u64, u64, u64)> {
    let migration_fee = fees::apply_bps(total_sol, migration_fee_bps)?;
    let liquidity_sol = fees::apply_bps(total_sol, 2000)?;
    let creator_sol = fees::apply_bps(total_sol, 2000)?;
    let buyback_sol = total_sol
        .checked_sub(migration_fee)
        .ok_or(LaunchpadError::MathUnderflow)?
        .checked_sub(liquidity_sol)
        .ok_or(LaunchpadError::MathUnderflow)?
        .checked_sub(creator_sol)
        .ok_or(LaunchpadError::MathUnderflow)?;

    Ok((migration_fee, liquidity_sol, creator_sol, buyback_sol))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presale_sol_split_pays_platform_creator_liquidity_and_buyback() {
        let total_sol = 100_000_000_000;
        let (fee, liquidity, creator, buyback) =
            calculate_presale_sol_split(total_sol, 100).unwrap();

        assert_eq!(fee, 1_000_000_000);
        assert_eq!(liquidity, 20_000_000_000);
        assert_eq!(creator, 20_000_000_000);
        assert_eq!(buyback, 59_000_000_000);
        assert_eq!(fee + liquidity + creator + buyback, total_sol);
    }
}
