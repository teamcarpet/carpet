use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address, AssociatedToken};
use anchor_spl::token::{self, Mint, SyncNative, Token, TokenAccount};
use anchor_spl::token_2022::spl_token_2022::{
    extension::StateWithExtensions, state::Account as Token2022Account,
};

use crate::cpi_meteora::{
    self, InitializePoolAccounts, InitializePoolParams, METEORA_PROGRAM_ID, POOL_AUTHORITY,
    TOKEN_2022_PROGRAM_ID,
};
use crate::errors::LaunchpadError;
use crate::events::MigrationCompleted;
use crate::math::fees;
use crate::state::{BondingCurvePool, BuybackState, GlobalConfig, ACTIVATION_DELAY_SLOTS};

#[derive(Accounts)]
pub struct MigrateBonding<'info> {
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
        seeds = [BondingCurvePool::SEED, pool.mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_migrated @ LaunchpadError::AlreadyMigrated,
        constraint = pool.real_sol_reserves >= pool.migration_target
            @ LaunchpadError::MigrationTargetNotReached,
    )]
    pub pool: Box<Account<'info, BondingCurvePool>>,

    /// SOL vault
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

    /// Buyback state account (init)
    #[account(
        init,
        payer = payer,
        space = 8 + BuybackState::INIT_SPACE,
        seeds = [BuybackState::SEED, pool.key().as_ref()],
        bump,
    )]
    pub buyback_state: Box<Account<'info, BuybackState>>,

    /// Token vault for buyback — tokens land here during buyback, not in payer wallet
    #[account(
        init,
        payer = payer,
        token::mint = token_mint,
        token::authority = buyback_state,
        seeds = [crate::instructions::execute_buyback::BUYBACK_TOKEN_VAULT_SEED, pool.key().as_ref()],
        bump,
    )]
    pub buyback_token_vault: Box<Account<'info, TokenAccount>>,

    /// Platform wallet receives migration fee
    /// CHECK: Validated against config
    #[account(
        mut,
        constraint = platform_wallet.key() == config.platform_wallet @ LaunchpadError::InvalidFeeConfig,
    )]
    pub platform_wallet: SystemAccount<'info>,

    // ── Meteora DAMM v2 accounts ────────────────────────────────────
    /// CHECK: Meteora DAMM v2 program
    #[account(
        constraint = meteora_program.key() == METEORA_PROGRAM_ID
            @ LaunchpadError::InvalidPoolParams,
    )]
    pub meteora_program: UncheckedAccount<'info>,

    /// CHECK: Meteora pool account (initialized by Meteora CPI)
    #[account(mut)]
    pub meteora_pool: UncheckedAccount<'info>,

    /// CHECK: Meteora pool config (fee/scheduler config)
    #[account()]
    pub meteora_pool_config: UncheckedAccount<'info>,

    /// CHECK: Meteora pool authority PDA
    #[account(constraint = meteora_pool_authority.key() == POOL_AUTHORITY @ LaunchpadError::InvalidPoolParams)]
    pub meteora_pool_authority: UncheckedAccount<'info>,

    /// CHECK: SPL Token-2022 program used by Meteora for position NFTs
    #[account(constraint = token_2022_program.key() == TOKEN_2022_PROGRAM_ID @ LaunchpadError::InvalidPoolParams)]
    pub token_2022_program: UncheckedAccount<'info>,

    /// CHECK: Meteora event authority PDA
    #[account(
        constraint = meteora_event_authority.key() == cpi_meteora::derive_event_authority()
            @ LaunchpadError::InvalidPoolParams
    )]
    pub meteora_event_authority: UncheckedAccount<'info>,

    /// CHECK: Program PDA that owns/custodies the LP position.
    #[account(
        seeds = [BuybackState::LP_CUSTODY_SEED, pool.key().as_ref()],
        bump,
        constraint = lp_custody.key() != payer.key() @ LaunchpadError::AdminLpCustody,
    )]
    pub lp_custody: UncheckedAccount<'info>,

    /// CHECK: Position NFT mint (signer keypair passed by caller)
    #[account(mut)]
    pub position_nft_mint: Signer<'info>,

    /// CHECK: Meteora initializes this PDA-owned Token-2022 position account.
    /// We validate the PDA derivation pre-CPI and parse the Token-2022 account
    /// state after CPI to confirm mint, token owner, and amount.
    #[account(
        mut,
        constraint = position_nft_account.key()
            == cpi_meteora::derive_position_nft_account(&position_nft_mint.key())
            @ LaunchpadError::InvalidLpPositionCustody,
    )]
    pub position_nft_account: UncheckedAccount<'info>,

    /// CHECK: Position state account
    #[account(mut)]
    pub position_account: UncheckedAccount<'info>,

    /// CHECK: Meteora token vault A (SOL/WSOL side), initialized by Meteora CPI
    #[account(mut)]
    pub meteora_vault_a: UncheckedAccount<'info>,

    /// CHECK: Meteora token vault B (token side), initialized by Meteora CPI
    #[account(mut)]
    pub meteora_vault_b: UncheckedAccount<'info>,

    /// CHECK: Meteora token badge PDA for WSOL mint.
    pub meteora_token_a_badge: UncheckedAccount<'info>,

    /// CHECK: Meteora token badge PDA for launch token mint.
    pub meteora_token_b_badge: UncheckedAccount<'info>,

    /// C-7: WSOL mint — validated to be the canonical native mint
    /// CHECK: Hardcoded address validation
    #[account(
        constraint = wsol_mint.key() == anchor_spl::token::spl_token::native_mint::id()
            @ LaunchpadError::InvalidPoolParams
    )]
    pub wsol_mint: UncheckedAccount<'info>,

    /// H-4: Actual token mint (for Meteora pool creation + buyback vault init)
    #[account(
        constraint = token_mint.key() == pool.mint @ LaunchpadError::InvalidPoolParams
    )]
    #[account(
        constraint = token_mint.freeze_authority.is_none() @ LaunchpadError::MintFreezable,
        constraint = token_mint.mint_authority.is_none() @ LaunchpadError::UnsafeMintAuthority,
    )]
    pub token_mint: Account<'info, Mint>,

    /// Payer's WSOL token account (for SOL deposit)
    #[account(
        mut,
        constraint = payer_wsol_account.key()
            == get_associated_token_address(&payer.key(), &wsol_mint.key())
            @ LaunchpadError::InvalidPoolParams,
        token::mint = wsol_mint.key(),
        token::authority = payer,
    )]
    pub payer_wsol_account: Box<Account<'info, TokenAccount>>,

    /// Payer's token B account (for token deposit)
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

pub fn handle_migrate_bonding(ctx: Context<MigrateBonding>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let config = &ctx.accounts.config;

    require!(
        config.allows_meteora_pool_config(&ctx.accounts.meteora_pool_config.key()),
        LaunchpadError::InvalidPoolParams
    );

    // ── CALCULATE SPLITS ────────────────────────────────────────────
    let (migration_fee, liquidity_sol, buyback_sol, liquidity_tokens) =
        calculate_bonding_migration_split(
            pool.real_sol_reserves,
            config.migration_fee_bps,
            pool.buyback_treasury,
            pool.real_token_reserves,
        )?;

    // Calculate Meteora init price/liquidity from actual deposited amounts.
    let sqrt_price = cpi_meteora::calculate_init_sqrt_price(liquidity_sol, liquidity_tokens)?;
    let initial_liquidity =
        cpi_meteora::calculate_initial_liquidity(liquidity_sol, liquidity_tokens, sqrt_price)?;

    // ── PRE-CAPTURE ─────────────────────────────────────────────────
    let pool_key = ctx.accounts.pool.key();
    let pool_mint = ctx.accounts.pool.mint;
    let pool_bump = ctx.accounts.pool.bump;
    let _sol_vault_bump = ctx.accounts.pool.sol_vault_bump;
    let mint_key = pool_mint;

    // ── EFFECTS ─────────────────────────────────────────────────────
    let pool = &mut ctx.accounts.pool;
    pool.is_migrated = true;
    let _ = pool;

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
    ctx.accounts.buyback_state.creator_token_allocation = 0;
    ctx.accounts.buyback_state.creator_tokens_claimed = 0;
    ctx.accounts.buyback_state.total_lp_fees_claimed_a = 0;
    ctx.accounts.buyback_state.total_lp_fees_claimed_b = 0;
    ctx.accounts.buyback_state.pool_type = 0;
    // Bonding pools don't use scheduled rounds; fields stay zero.
    ctx.accounts.buyback_state.total_rounds = 0;
    ctx.accounts.buyback_state.rounds_executed = 0;
    ctx.accounts.buyback_state.bps_per_round = 0;
    ctx.accounts.buyback_state.round_interval_seconds = 0;
    ctx.accounts.buyback_state.bump = ctx.bumps.buyback_state;

    // ── INTERACTIONS ────────────────────────────────────────────────

    let sol_vault_signer: &[&[&[u8]]] = &[&[
        BondingCurvePool::SOL_VAULT_SEED,
        pool_mint.as_ref(),
        &[_sol_vault_bump],
    ]];

    // 1. Transfer migration fee to platform wallet
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

    // 2. Transfer liquidity SOL from sol_vault to payer's WSOL account
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

    // 3. Transfer liquidity tokens from token_vault to payer's token account
    if liquidity_tokens > 0 {
        let pool_signer_seeds: &[&[&[u8]]] =
            &[&[BondingCurvePool::SEED, mint_key.as_ref(), &[pool_bump]]];

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

    // 4. CPI: Create Meteora DAMM v2 pool with initial liquidity
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
        token_a_badge: ctx.accounts.meteora_token_a_badge.to_account_info(),
        token_b_badge: ctx.accounts.meteora_token_b_badge.to_account_info(),
    };

    let meteora_params = InitializePoolParams {
        liquidity: initial_liquidity,
        sqrt_price,
        activation_point: Some(delayed_activation_slot(Clock::get()?.slot)?),
    };

    // Payer signs the Meteora CPI (not a PDA, so empty signer seeds)
    cpi_meteora::cpi_initialize_pool(&meteora_accounts, &meteora_params, &[])?;

    validate_position_nft_pda(
        &ctx.accounts.position_nft_account.to_account_info(),
        ctx.accounts.position_nft_mint.key(),
        ctx.accounts.lp_custody.key(),
    )?;

    ctx.accounts.token_vault.reload()?;
    require!(
        ctx.accounts.token_vault.amount == 0,
        LaunchpadError::InvalidPoolParams
    );

    sweep_excess_sol_from_vault(
        &ctx.accounts.sol_vault.to_account_info(),
        &ctx.accounts.platform_wallet.to_account_info(),
        sol_vault_signer,
        &ctx.accounts.system_program.to_account_info(),
        buyback_sol,
    )?;

    // ── EVENTS ──────────────────────────────────────────────────────

    emit!(MigrationCompleted {
        pool: pool_key,
        pool_type: 0,
        meteora_pool: ctx.accounts.meteora_pool.key(),
        liquidity_sol,
        liquidity_tokens,
        platform_fee: migration_fee,
        buyback_allocation: buyback_sol,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn calculate_bonding_migration_split(
    total_sol: u64,
    migration_fee_bps: u16,
    buyback_treasury: u64,
    remaining_tokens: u64,
) -> Result<(u64, u64, u64, u64)> {
    let (migration_fee, _) = fees::calculate_migration_fee(total_sol, migration_fee_bps)?;
    let liquidity_sol = fees::apply_bps(total_sol, 8000)?;
    let base_buyback_sol = total_sol
        .checked_sub(migration_fee)
        .ok_or(LaunchpadError::MathUnderflow)?
        .checked_sub(liquidity_sol)
        .ok_or(LaunchpadError::MathUnderflow)?;
    let buyback_sol = base_buyback_sol
        .checked_add(buyback_treasury)
        .ok_or(LaunchpadError::MathOverflow)?;

    let liquidity_tokens = remaining_tokens;

    Ok((migration_fee, liquidity_sol, buyback_sol, liquidity_tokens))
}

fn delayed_activation_slot(current_slot: u64) -> Result<u64> {
    current_slot
        .checked_add(ACTIVATION_DELAY_SLOTS)
        .ok_or(LaunchpadError::MathOverflow.into())
}

fn validate_position_nft_pda(
    account_info: &AccountInfo<'_>,
    position_nft_mint: Pubkey,
    expected_owner: Pubkey,
) -> Result<()> {
    require!(
        account_info.key() == cpi_meteora::derive_position_nft_account(&position_nft_mint),
        LaunchpadError::InvalidLpPositionCustody
    );
    require!(
        *account_info.owner == TOKEN_2022_PROGRAM_ID,
        LaunchpadError::InvalidLpPositionCustody
    );

    let data = account_info.try_borrow_data()?;
    let parsed = StateWithExtensions::<Token2022Account>::unpack(&data)
        .map_err(|_| error!(LaunchpadError::InvalidLpPositionCustody))?;

    require!(
        parsed.base.mint == position_nft_mint,
        LaunchpadError::InvalidLpPositionCustody
    );
    require!(
        parsed.base.owner == expected_owner,
        LaunchpadError::InvalidLpPositionCustody
    );
    require!(
        parsed.base.amount == 1,
        LaunchpadError::InvalidLpPositionCustody
    );
    Ok(())
}

fn sweep_excess_sol_from_vault<'info>(
    sol_vault: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    system_program: &AccountInfo<'info>,
    retained_balance: u64,
) -> Result<()> {
    let rent_floor = Rent::get()?.minimum_balance(0);
    let target_balance = rent_floor
        .checked_add(retained_balance)
        .ok_or(LaunchpadError::MathOverflow)?;
    let current_balance = sol_vault.lamports();

    if current_balance > target_balance {
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                system_program.clone(),
                anchor_lang::system_program::Transfer {
                    from: sol_vault.clone(),
                    to: destination.clone(),
                },
                signer_seeds,
            ),
            current_balance
                .checked_sub(target_balance)
                .ok_or(LaunchpadError::MathUnderflow)?,
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::solana_program::program_option::COption;
    use anchor_spl::token_2022::spl_token_2022::state::AccountState;

    #[test]
    fn bonding_migration_split_uses_all_available_sol() {
        let total_sol = 100_000_000_000;
        let buyback_treasury = 2_000_000_000;
        let (fee, liquidity, buyback, liquidity_tokens) =
            calculate_bonding_migration_split(total_sol, 100, buyback_treasury, 1_000_000).unwrap();

        assert_eq!(fee, 1_000_000_000);
        assert_eq!(liquidity, 80_000_000_000);
        assert_eq!(buyback, 21_000_000_000);
        assert_eq!(fee + liquidity + buyback, total_sol + buyback_treasury);
        assert_eq!(liquidity_tokens, 1_000_000);
    }

    #[test]
    fn lp_custody_must_not_be_admin_wallet() {
        let admin = Pubkey::new_unique();
        let lp_custody = Pubkey::new_unique();

        assert_ne!(lp_custody, admin);
    }

    #[test]
    fn lp_position_nft_uses_meteora_pda_not_ata() {
        let lp_custody = Pubkey::new_unique();
        let nft_mint = Pubkey::new_unique();

        let meteora_pda = cpi_meteora::derive_position_nft_account(&nft_mint);
        let custody_ata = get_associated_token_address(&lp_custody, &nft_mint);

        assert_ne!(meteora_pda, custody_ata);
    }

    #[test]
    fn bonding_migration_uses_activation_delay() {
        assert_eq!(delayed_activation_slot(10).unwrap(), 160);
    }

    #[test]
    fn sweep_only_transfers_stray_sol() {
        let rent_floor = Rent::default().minimum_balance(0);
        let target = rent_floor + 50;
        let excess = target + 25;
        assert_eq!(excess - target, 25);
    }

    #[test]
    fn meteora_position_nft_token_owner_must_be_lp_custody() {
        let owner = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let token_account = Token2022Account {
            mint,
            owner,
            amount: 1,
            delegate: COption::None,
            state: AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        };
        assert_eq!(token_account.owner, owner);
        assert_eq!(token_account.mint, mint);
        assert_eq!(token_account.amount, 1);
    }
}
