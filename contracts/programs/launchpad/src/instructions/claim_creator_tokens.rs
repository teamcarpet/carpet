use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::LaunchpadError;
use crate::state::{BuybackState, PresalePool};

#[derive(Accounts)]
pub struct ClaimCreatorTokens<'info> {
    pub creator: Signer<'info>,

    #[account(
        seeds = [PresalePool::SEED, pool.mint.as_ref()],
        bump = pool.bump,
        constraint = pool.creator == creator.key() @ LaunchpadError::UnauthorizedCreator,
        constraint = pool.is_migrated @ LaunchpadError::NotMigrated,
    )]
    pub pool: Account<'info, PresalePool>,

    #[account(
        mut,
        seeds = [BuybackState::SEED, pool.key().as_ref()],
        bump = buyback_state.bump,
        constraint = buyback_state.pool == pool.key() @ LaunchpadError::InvalidPoolParams,
        constraint = buyback_state.pool_type == 1 @ LaunchpadError::InvalidPoolParams,
    )]
    pub buyback_state: Account<'info, BuybackState>,

    #[account(
        mut,
        token::mint = pool.mint,
        token::authority = pool,
        seeds = [PresalePool::TOKEN_VAULT_SEED, pool.mint.as_ref()],
        bump = pool.token_vault_bump,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = pool.mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_creator_tokens(ctx: Context<ClaimCreatorTokens>) -> Result<()> {
    let allocation = ctx.accounts.buyback_state.creator_token_allocation;
    let already_claimed = ctx.accounts.buyback_state.creator_tokens_claimed;
    let claimable = allocation
        .checked_sub(already_claimed)
        .ok_or(LaunchpadError::CreatorOverclaim)?;

    require!(claimable > 0, LaunchpadError::NothingToClaim);
    require!(
        already_claimed
            .checked_add(claimable)
            .ok_or(LaunchpadError::MathOverflow)?
            <= allocation,
        LaunchpadError::CreatorOverclaim
    );

    ctx.accounts.buyback_state.creator_tokens_claimed = already_claimed
        .checked_add(claimable)
        .ok_or(LaunchpadError::MathOverflow)?;

    let mint = ctx.accounts.pool.mint;
    let pool_signer: &[&[&[u8]]] =
        &[&[PresalePool::SEED, mint.as_ref(), &[ctx.accounts.pool.bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            pool_signer,
        ),
        claimable,
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn creator_cannot_overclaim() {
        let allocation = 1_000u64;
        let already_claimed = 600u64;
        let claimable = allocation.checked_sub(already_claimed).unwrap();

        assert_eq!(claimable, 400);
        assert!(already_claimed + claimable <= allocation);
        assert!(already_claimed + claimable + 1 > allocation);
    }
}
