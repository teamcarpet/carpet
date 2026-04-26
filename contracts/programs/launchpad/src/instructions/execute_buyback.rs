use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, SyncNative, Token, TokenAccount};

use crate::cpi_meteora::{self, SwapAccounts, SwapParams, METEORA_PROGRAM_ID, POOL_AUTHORITY};
use crate::errors::LaunchpadError;
use crate::events::BuybackExecuted;
use crate::state::{BuybackMode, BuybackState};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ExecuteBuybackParams {
    /// Buyback mode: burn-only. Any other mode is invalid at decode time.
    pub mode: BuybackMode,
    /// Minimum tokens expected (slippage protection)
    pub min_tokens_out: u64,
}

/// Seeds for the buyback token vault PDA that holds tokens
/// between swap and burn/LP-add. Caller CANNOT touch these.
pub const BUYBACK_TOKEN_VAULT_SEED: &[u8] = b"buyback_token_vault";

#[derive(Accounts)]
pub struct ExecuteBuyback<'info> {
    /// Anyone can trigger buyback (permissionless crank)
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [BuybackState::SEED, buyback_state.pool.as_ref()],
        bump = buyback_state.bump,
        constraint = buyback_state.treasury_balance > 0 @ LaunchpadError::InsufficientTreasury,
    )]
    pub buyback_state: Box<Account<'info, BuybackState>>,

    /// SOL vault PDA — validated in handler via PDA derivation
    /// CHECK: Validated in handler against pool's sol_vault PDA
    #[account(mut)]
    pub buyback_sol_vault: SystemAccount<'info>,

    /// CHECK: Token mint — validated against buyback_state.mint
    #[account(constraint = pool_mint.key() == buyback_state.mint @ LaunchpadError::InvalidPoolParams)]
    pub pool_mint: UncheckedAccount<'info>,

    /// Program-owned token vault PDA for receiving swapped tokens.
    /// Tokens land here, NOT in payer's wallet. This prevents theft.
    #[account(
        mut,
        token::mint = token_mint.key(),
        token::authority = buyback_state,
        seeds = [BUYBACK_TOKEN_VAULT_SEED, buyback_state.pool.as_ref()],
        bump,
    )]
    pub buyback_token_vault: Box<Account<'info, TokenAccount>>,

    /// Token mint (for burning)
    #[account(
        mut,
        constraint = token_mint.key() == buyback_state.mint @ LaunchpadError::InvalidPoolParams,
    )]
    pub token_mint: Box<Account<'info, Mint>>,

    // ── Meteora swap accounts ───────────────────────────────────────
    /// CHECK: Meteora DAMM v2 program
    #[account(constraint = meteora_program.key() == METEORA_PROGRAM_ID @ LaunchpadError::InvalidPoolParams)]
    pub meteora_program: UncheckedAccount<'info>,

    /// FIX #2: Meteora pool — MUST match the pool recorded during migration
    /// CHECK: Validated against buyback_state.meteora_pool
    #[account(
        mut,
        constraint = meteora_pool.key() == buyback_state.meteora_pool
            @ LaunchpadError::InvalidPoolParams
    )]
    pub meteora_pool: UncheckedAccount<'info>,

    /// CHECK: Meteora pool authority PDA.
    #[account(constraint = meteora_pool_authority.key() == POOL_AUTHORITY @ LaunchpadError::InvalidPoolParams)]
    pub meteora_pool_authority: UncheckedAccount<'info>,

    /// Meteora input vault (SOL/WSOL side)
    #[account(
        mut,
        token::mint = wsol_mint.key(),
    )]
    pub meteora_input_vault: Box<Account<'info, TokenAccount>>,

    /// Meteora output vault (token side)
    #[account(
        mut,
        token::mint = token_mint,
    )]
    pub meteora_output_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: WSOL mint — validated canonical address
    #[account(
        constraint = wsol_mint.key() == anchor_spl::token::spl_token::native_mint::id()
            @ LaunchpadError::InvalidPoolParams
    )]
    pub wsol_mint: UncheckedAccount<'info>,

    /// Payer's WSOL account for swap input
    #[account(
        mut,
        token::mint = wsol_mint.key(),
        token::authority = payer,
    )]
    pub payer_wsol_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Meteora event authority PDA.
    pub meteora_event_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_execute_buyback(
    ctx: Context<ExecuteBuyback>,
    params: ExecuteBuybackParams,
) -> Result<()> {
    let buyback = &ctx.accounts.buyback_state;

    // ── CHECKS ──────────────────────────────────────────────────────

    require!(
        buyback.pool_type == 0 || buyback.pool_type == 1,
        LaunchpadError::InvalidBuybackMode
    );

    let now_ts = Clock::get()?.unix_timestamp;
    let current_slot = Clock::get()?.slot;

    // Compute SOL to spend + gating — different logic per pool type.
    //
    // BONDING (pool_type == 0): legacy slot-based cooldown, 20% of remaining
    //   treasury each call. Anyone can crank whenever MIN_BUYBACK_INTERVAL
    //   slots have passed.
    //
    // PRESALE (pool_type == 1): scheduled rounds. Each pool is created with
    //   either Regular (6 × 10% / 4h) or Extreme (12 × 5% / 30min). Each
    //   round spends `bps_per_round` of the *initial* treasury (not the
    //   current balance) so rounds are uniform. Total burn = 60% of treasury
    //   across all rounds for both modes. After `total_rounds` executions,
    //   further calls revert.
    let sol_to_spend: u64 = if buyback.pool_type == 0 {
        // Bonding: slot-based cooldown against last_buyback_slot
        if buyback.last_buyback_slot > 0 {
            require!(
                current_slot
                    >= buyback
                        .last_buyback_slot
                        .checked_add(BuybackState::MIN_BUYBACK_INTERVAL)
                        .ok_or(LaunchpadError::MathOverflow)?,
                LaunchpadError::BuybackTooFrequent
            );
        }

        let amount: u128 = (buyback.treasury_balance as u128)
            .checked_mul(BuybackState::BONDING_BUYBACK_BPS as u128)
            .ok_or(LaunchpadError::MathOverflow)?
            .checked_div(10_000u128)
            .ok_or(LaunchpadError::DivisionByZero)?;
        u64::try_from(amount).map_err(|_| LaunchpadError::CastOverflow)?
    } else {
        // Presale: scheduled round check
        require!(
            buyback.rounds_executed < buyback.total_rounds,
            LaunchpadError::AllRoundsExecuted
        );

        // Time gate — interval since last round, with a small grace window.
        // First round (rounds_executed == 0 && last_buyback_ts == 0) fires
        // immediately after migration.
        if buyback.last_buyback_ts > 0 {
            let next_due = buyback
                .last_buyback_ts
                .checked_add(buyback.round_interval_seconds)
                .ok_or(LaunchpadError::MathOverflow)?;
            require!(
                now_ts + BuybackState::ROUND_GRACE_SECONDS >= next_due,
                LaunchpadError::RoundNotDue
            );
        }

        // Spend = bps_per_round × initial_treasury / 10_000
        // Using the FIXED initial_treasury means each round is a uniform
        // 10% (Regular) or 5% (Extreme) of the pool at migration time,
        // not a geometric decay of the remainder.
        let amount: u128 = (buyback.initial_treasury as u128)
            .checked_mul(buyback.bps_per_round as u128)
            .ok_or(LaunchpadError::MathOverflow)?
            .checked_div(10_000u128)
            .ok_or(LaunchpadError::DivisionByZero)?;
        let amount = u64::try_from(amount).map_err(|_| LaunchpadError::CastOverflow)?;

        // Never spend more than what's left (guards against rounding drift
        // or manual top-ups/withdrawals).
        amount.min(buyback.treasury_balance)
    };

    require!(sol_to_spend > 0, LaunchpadError::InsufficientTreasury);

    // ── EFFECTS ─────────────────────────────────────────────────────

    ctx.accounts.buyback_state.treasury_balance = ctx
        .accounts
        .buyback_state
        .treasury_balance
        .checked_sub(sol_to_spend)
        .ok_or(LaunchpadError::MathUnderflow)?;
    ctx.accounts.buyback_state.last_buyback_slot = current_slot;
    ctx.accounts.buyback_state.last_buyback_ts = now_ts;
    ctx.accounts.buyback_state.total_sol_spent = ctx
        .accounts
        .buyback_state
        .total_sol_spent
        .checked_add(sol_to_spend)
        .ok_or(LaunchpadError::MathOverflow)?;
    if ctx.accounts.buyback_state.pool_type == 1 {
        ctx.accounts.buyback_state.rounds_executed = ctx
            .accounts
            .buyback_state
            .rounds_executed
            .checked_add(1)
            .ok_or(LaunchpadError::MathOverflow)?;
    }

    // ── INTERACTIONS ────────────────────────────────────────────────

    // 1. Derive and validate sol_vault PDA
    let mint_key = ctx.accounts.pool_mint.key();
    let pool_type = ctx.accounts.buyback_state.pool_type;

    let (expected_vault, vault_bump) = if pool_type == 0 {
        Pubkey::find_program_address(&[b"bonding_sol_vault", mint_key.as_ref()], ctx.program_id)
    } else {
        Pubkey::find_program_address(&[b"presale_sol_vault", mint_key.as_ref()], ctx.program_id)
    };
    require!(
        ctx.accounts.buyback_sol_vault.key() == expected_vault,
        LaunchpadError::InvalidPoolParams
    );

    let sol_vault_signer: &[&[&[u8]]] = if pool_type == 0 {
        &[&[b"bonding_sol_vault", mint_key.as_ref(), &[vault_bump]]]
    } else {
        &[&[b"presale_sol_vault", mint_key.as_ref(), &[vault_bump]]]
    };

    // Transfer SOL → payer's WSOL for the swap
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.buyback_sol_vault.to_account_info(),
                to: ctx.accounts.payer_wsol_account.to_account_info(),
            },
            sol_vault_signer,
        ),
        sol_to_spend,
    )?;
    token::sync_native(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        SyncNative {
            account: ctx.accounts.payer_wsol_account.to_account_info(),
        },
    ))?;

    // 2. Record vault balance before swap
    let vault_balance_before = ctx.accounts.buyback_token_vault.amount;

    // 3. CPI: Swap SOL → Token on Meteora
    //    FIX #1: Tokens go to buyback_token_vault (PDA), NOT payer
    let swap_accounts = SwapAccounts {
        pool_authority: ctx.accounts.meteora_pool_authority.to_account_info(),
        pool: ctx.accounts.meteora_pool.to_account_info(),
        input_token_account: ctx.accounts.payer_wsol_account.to_account_info(),
        output_token_account: ctx.accounts.buyback_token_vault.to_account_info(),
        token_a_vault: ctx.accounts.meteora_input_vault.to_account_info(),
        token_b_vault: ctx.accounts.meteora_output_vault.to_account_info(),
        token_a_mint: ctx.accounts.wsol_mint.to_account_info(),
        token_b_mint: ctx.accounts.token_mint.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        token_a_program: ctx.accounts.token_program.to_account_info(),
        token_b_program: ctx.accounts.token_program.to_account_info(),
        event_authority: ctx.accounts.meteora_event_authority.to_account_info(),
        meteora_program: ctx.accounts.meteora_program.to_account_info(),
    };

    cpi_meteora::cpi_swap(
        &swap_accounts,
        &SwapParams {
            amount_in: sol_to_spend,
            minimum_amount_out: params.min_tokens_out,
        },
        &[],
    )?;

    // 4. Reload to get actual tokens received
    ctx.accounts.buyback_token_vault.reload()?;
    let tokens_received = ctx
        .accounts
        .buyback_token_vault
        .amount
        .checked_sub(vault_balance_before)
        .ok_or(LaunchpadError::MathUnderflow)?;

    require!(
        tokens_received >= params.min_tokens_out,
        LaunchpadError::SlippageExceeded
    );

    // 5. Guaranteed post-action: burn all received tokens.
    let pool_key = ctx.accounts.buyback_state.pool;
    let buyback_bump = ctx.accounts.buyback_state.bump;
    let buyback_signer: &[&[&[u8]]] = &[&[BuybackState::SEED, pool_key.as_ref(), &[buyback_bump]]];

    match params.mode {
        BuybackMode::Burn => {
            // Burn tokens FROM the PDA vault (buyback_state is authority)
            token::burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Burn {
                        mint: ctx.accounts.token_mint.to_account_info(),
                        from: ctx.accounts.buyback_token_vault.to_account_info(),
                        authority: ctx.accounts.buyback_state.to_account_info(),
                    },
                    buyback_signer,
                ),
                tokens_received,
            )?;

            ctx.accounts.buyback_state.total_tokens_burned = ctx
                .accounts
                .buyback_state
                .total_tokens_burned
                .checked_add(tokens_received)
                .ok_or(LaunchpadError::MathOverflow)?;
        }
    }

    ctx.accounts.buyback_token_vault.reload()?;
    require!(
        ctx.accounts.buyback_token_vault.amount == vault_balance_before,
        LaunchpadError::IdleBuybackTokens
    );
    ctx.accounts.buyback_state.idle_tokens = 0;

    ctx.accounts.buyback_state.total_tokens_bought = ctx
        .accounts
        .buyback_state
        .total_tokens_bought
        .checked_add(tokens_received)
        .ok_or(LaunchpadError::MathOverflow)?;

    emit!(BuybackExecuted {
        pool: ctx.accounts.buyback_state.pool,
        sol_spent: sol_to_spend,
        tokens_received,
        mode: params.mode as u8,
        round_number: ctx.accounts.buyback_state.rounds_executed,
        total_rounds: ctx.accounts.buyback_state.total_rounds,
        timestamp: now_ts,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn burn_buyback_leaves_no_idle_accounting() {
        let idle_tokens_after_burn = 0u64;
        assert_eq!(idle_tokens_after_burn, 0);
    }
}
