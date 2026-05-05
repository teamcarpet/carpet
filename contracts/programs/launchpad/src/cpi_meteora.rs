//! Meteora DAMM v2 CPI interface.
//!
//! Manual CPI construction — Meteora doesn't publish a crate,
//! so we construct instructions with raw discriminators + serialized params.
//! Discriminators sourced from the on-chain IDL (cp_amm.json).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use crate::errors::LaunchpadError;

/// Meteora DAMM v2 program ID: cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
pub static METEORA_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    9, 45, 33, 53, 101, 122, 21, 156, 43, 135, 212, 182, 106, 112, 219, 142, 151, 82, 56, 159, 247,
    106, 175, 32, 108, 237, 6, 58, 56, 249, 90, 237,
]);

/// Meteora DAMM v2 pool authority PDA.
pub static POOL_AUTHORITY: Pubkey = Pubkey::new_from_array([
    242, 204, 213, 53, 172, 165, 241, 115, 106, 200, 34, 221, 7, 115, 228, 217, 47, 189, 138, 89,
    178, 148, 3, 80, 2, 149, 169, 1, 28, 115, 169, 229,
]);

/// SPL Token-2022 program, required by Meteora for position NFTs.
pub static TOKEN_2022_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 238, 117, 143, 222, 24, 66, 93, 188, 228, 108, 205, 218, 182, 26, 252, 77,
    131, 185, 13, 39, 254, 189, 249, 40, 216, 161, 139, 252,
]);

pub const TOKEN_VAULT_SEED: &[u8] = b"token_vault";
pub const EVENT_AUTHORITY_SEED: &[u8] = b"__event_authority";

/// Anchor instruction discriminator for `initialize_pool`
const INITIALIZE_POOL_DISC: [u8; 8] = [95, 180, 10, 172, 84, 174, 232, 40];

/// Anchor instruction discriminator for `swap`
/// sha256("global:swap")[..8]
const SWAP_DISC: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];

/// Anchor instruction discriminator for `claim_position_fee`
/// sha256("global:claim_position_fee")[..8]
const CLAIM_POSITION_FEE_DISC: [u8; 8] = [180, 38, 154, 17, 133, 33, 162, 211];

// ── Initialize Pool CPI ─────────────────────────────────────────────────

/// Accounts required by Meteora's `initialize_pool` instruction.
pub struct InitializePoolAccounts<'info> {
    /// Pool creator
    pub creator: AccountInfo<'info>,
    /// Transaction payer (signer)
    pub payer: AccountInfo<'info>,
    /// Position NFT mint (signer — keypair generated off-chain)
    pub position_nft_mint: AccountInfo<'info>,
    /// Position NFT token account
    pub position_nft_account: AccountInfo<'info>,
    /// Token A mint (SOL/WSOL)
    pub token_a_mint: AccountInfo<'info>,
    /// Token B mint (project token)
    pub token_b_mint: AccountInfo<'info>,
    /// Pool token A vault
    pub token_a_vault: AccountInfo<'info>,
    /// Pool token B vault
    pub token_b_vault: AccountInfo<'info>,
    /// Payer's token A account (source of token A deposit)
    pub payer_token_a: AccountInfo<'info>,
    /// Payer's token B account (source of token B deposit)
    pub payer_token_b: AccountInfo<'info>,
    /// Pool state account
    pub pool: AccountInfo<'info>,
    /// Pool config (fee config)
    pub pool_config: AccountInfo<'info>,
    /// Pool authority PDA
    pub pool_authority: AccountInfo<'info>,
    /// Position state account
    pub position: AccountInfo<'info>,
    /// Token program A
    pub token_program_a: AccountInfo<'info>,
    /// Token program B
    pub token_program_b: AccountInfo<'info>,
    /// SPL Token-2022 program
    pub token_2022_program: AccountInfo<'info>,
    /// System program
    pub system_program: AccountInfo<'info>,
    /// Anchor event authority PDA for Meteora
    pub event_authority: AccountInfo<'info>,
    /// Meteora DAMM v2 program
    pub meteora_program: AccountInfo<'info>,
    /// Token badge PDA for token A mint
    pub token_a_badge: AccountInfo<'info>,
    /// Token badge PDA for token B mint
    pub token_b_badge: AccountInfo<'info>,
}

/// Parameters for pool initialization.
pub struct InitializePoolParams {
    /// Initial liquidity amount (u128)
    pub liquidity: u128,
    /// Initial sqrt price (u128, Q64.64 fixed-point)
    pub sqrt_price: u128,
    /// Optional activation point (slot number)
    pub activation_point: Option<u64>,
}

/// Call Meteora's `initialize_pool` via CPI.
///
/// `signer_seeds` — PDA seeds if the creator/payer is a PDA.
pub fn cpi_initialize_pool<'info>(
    accounts: &InitializePoolAccounts<'info>,
    params: &InitializePoolParams,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 16 + 16 + 9);
    data.extend_from_slice(&INITIALIZE_POOL_DISC);
    data.extend_from_slice(&params.liquidity.to_le_bytes());
    data.extend_from_slice(&params.sqrt_price.to_le_bytes());

    // Option<u64> serialization: 1 byte discriminator + 8 bytes if Some
    match params.activation_point {
        Some(ap) => {
            data.push(1);
            data.extend_from_slice(&ap.to_le_bytes());
        }
        None => {
            data.push(0);
        }
    }

    let account_metas = vec![
        AccountMeta::new_readonly(accounts.creator.key(), false),
        AccountMeta::new(accounts.position_nft_mint.key(), true),
        AccountMeta::new(accounts.position_nft_account.key(), false),
        AccountMeta::new(accounts.payer.key(), true),
        AccountMeta::new_readonly(accounts.pool_config.key(), false),
        AccountMeta::new_readonly(accounts.pool_authority.key(), false),
        AccountMeta::new(accounts.pool.key(), false),
        AccountMeta::new(accounts.position.key(), false),
        AccountMeta::new_readonly(accounts.token_a_mint.key(), false),
        AccountMeta::new_readonly(accounts.token_b_mint.key(), false),
        AccountMeta::new(accounts.token_a_vault.key(), false),
        AccountMeta::new(accounts.token_b_vault.key(), false),
        AccountMeta::new(accounts.payer_token_a.key(), false),
        AccountMeta::new(accounts.payer_token_b.key(), false),
        AccountMeta::new_readonly(accounts.token_program_a.key(), false),
        AccountMeta::new_readonly(accounts.token_program_b.key(), false),
        AccountMeta::new_readonly(accounts.token_2022_program.key(), false),
        AccountMeta::new_readonly(accounts.system_program.key(), false),
        AccountMeta::new_readonly(accounts.event_authority.key(), false),
        AccountMeta::new_readonly(accounts.meteora_program.key(), false),
        AccountMeta::new_readonly(accounts.token_a_badge.key(), false),
        AccountMeta::new_readonly(accounts.token_b_badge.key(), false),
    ];

    let ix = Instruction {
        program_id: METEORA_PROGRAM_ID,
        accounts: account_metas,
        data,
    };

    let account_infos = &[
        accounts.creator.clone(),
        accounts.position_nft_mint.clone(),
        accounts.position_nft_account.clone(),
        accounts.payer.clone(),
        accounts.pool_config.clone(),
        accounts.pool_authority.clone(),
        accounts.pool.clone(),
        accounts.position.clone(),
        accounts.token_a_mint.clone(),
        accounts.token_b_mint.clone(),
        accounts.token_a_vault.clone(),
        accounts.token_b_vault.clone(),
        accounts.payer_token_a.clone(),
        accounts.payer_token_b.clone(),
        accounts.token_program_a.clone(),
        accounts.token_program_b.clone(),
        accounts.token_2022_program.clone(),
        accounts.system_program.clone(),
        accounts.event_authority.clone(),
        accounts.meteora_program.clone(),
        accounts.token_a_badge.clone(),
        accounts.token_b_badge.clone(),
    ];

    invoke_signed(&ix, account_infos, signer_seeds)
        .map_err(|_| error!(LaunchpadError::InvalidPoolParams))?;

    Ok(())
}

pub fn derive_token_vault_address(token_mint: &Pubkey, pool: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[TOKEN_VAULT_SEED, token_mint.as_ref(), pool.as_ref()],
        &METEORA_PROGRAM_ID,
    )
    .0
}

pub fn derive_event_authority() -> Pubkey {
    Pubkey::find_program_address(&[EVENT_AUTHORITY_SEED], &METEORA_PROGRAM_ID).0
}

// ── Swap CPI ────────────────────────────────────────────────────────────

/// Accounts required by Meteora's `swap` instruction.
pub struct SwapAccounts<'info> {
    /// Meteora pool authority
    pub pool_authority: AccountInfo<'info>,
    /// Pool state
    pub pool: AccountInfo<'info>,
    /// User's input token account
    pub input_token_account: AccountInfo<'info>,
    /// User's output token account
    pub output_token_account: AccountInfo<'info>,
    /// Token A vault (pool side)
    pub token_a_vault: AccountInfo<'info>,
    /// Token B vault (pool side)
    pub token_b_vault: AccountInfo<'info>,
    /// Token A mint
    pub token_a_mint: AccountInfo<'info>,
    /// Token B mint
    pub token_b_mint: AccountInfo<'info>,
    /// User/authority (signer)
    pub payer: AccountInfo<'info>,
    /// Token A program
    pub token_a_program: AccountInfo<'info>,
    /// Token B program
    pub token_b_program: AccountInfo<'info>,
    /// Meteora event authority
    pub event_authority: AccountInfo<'info>,
    /// Meteora program
    pub meteora_program: AccountInfo<'info>,
}

/// Parameters for swap.
pub struct SwapParams {
    /// Amount of input token
    pub amount_in: u64,
    /// Minimum output token (slippage protection)
    pub minimum_amount_out: u64,
}

/// Call Meteora's `swap` via CPI.
pub fn cpi_swap<'info>(
    accounts: &SwapAccounts<'info>,
    params: &SwapParams,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8 + 8);
    data.extend_from_slice(&SWAP_DISC);
    data.extend_from_slice(&params.amount_in.to_le_bytes());
    data.extend_from_slice(&params.minimum_amount_out.to_le_bytes());

    let account_metas = vec![
        AccountMeta::new_readonly(accounts.pool_authority.key(), false),
        AccountMeta::new(accounts.pool.key(), false),
        AccountMeta::new(accounts.input_token_account.key(), false),
        AccountMeta::new(accounts.output_token_account.key(), false),
        AccountMeta::new(accounts.token_a_vault.key(), false),
        AccountMeta::new(accounts.token_b_vault.key(), false),
        AccountMeta::new_readonly(accounts.token_a_mint.key(), false),
        AccountMeta::new_readonly(accounts.token_b_mint.key(), false),
        AccountMeta::new(accounts.payer.key(), true),
        AccountMeta::new_readonly(accounts.token_a_program.key(), false),
        AccountMeta::new_readonly(accounts.token_b_program.key(), false),
        // Optional referral_token_account. Anchor clients represent None with
        // the callee program id as a readonly placeholder.
        AccountMeta::new_readonly(accounts.meteora_program.key(), false),
        AccountMeta::new_readonly(accounts.event_authority.key(), false),
        AccountMeta::new_readonly(accounts.meteora_program.key(), false),
    ];

    let ix = Instruction {
        program_id: METEORA_PROGRAM_ID,
        accounts: account_metas,
        data,
    };

    let account_infos = &[
        accounts.pool_authority.clone(),
        accounts.pool.clone(),
        accounts.input_token_account.clone(),
        accounts.output_token_account.clone(),
        accounts.token_a_vault.clone(),
        accounts.token_b_vault.clone(),
        accounts.token_a_mint.clone(),
        accounts.token_b_mint.clone(),
        accounts.payer.clone(),
        accounts.token_a_program.clone(),
        accounts.token_b_program.clone(),
        accounts.meteora_program.clone(),
        accounts.event_authority.clone(),
        accounts.meteora_program.clone(),
    ];

    invoke_signed(&ix, account_infos, signer_seeds)
        .map_err(|_| error!(LaunchpadError::SlippageExceeded))?;

    Ok(())
}

// ── Claim Position Fee CPI ──────────────────────────────────────────────

/// Accounts required by Meteora's `claim_position_fee` instruction.
pub struct ClaimPositionFeeAccounts<'info> {
    pub pool_authority: AccountInfo<'info>,
    pub pool: AccountInfo<'info>,
    pub position: AccountInfo<'info>,
    pub token_a_account: AccountInfo<'info>,
    pub token_b_account: AccountInfo<'info>,
    pub token_a_vault: AccountInfo<'info>,
    pub token_b_vault: AccountInfo<'info>,
    pub token_a_mint: AccountInfo<'info>,
    pub token_b_mint: AccountInfo<'info>,
    pub position_nft_account: AccountInfo<'info>,
    pub owner: AccountInfo<'info>,
    pub token_a_program: AccountInfo<'info>,
    pub token_b_program: AccountInfo<'info>,
    pub event_authority: AccountInfo<'info>,
    pub meteora_program: AccountInfo<'info>,
}

pub fn cpi_claim_position_fee<'info>(
    accounts: &ClaimPositionFeeAccounts<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let account_metas = vec![
        AccountMeta::new_readonly(accounts.pool_authority.key(), false),
        AccountMeta::new_readonly(accounts.pool.key(), false),
        AccountMeta::new(accounts.position.key(), false),
        AccountMeta::new(accounts.token_a_account.key(), false),
        AccountMeta::new(accounts.token_b_account.key(), false),
        AccountMeta::new(accounts.token_a_vault.key(), false),
        AccountMeta::new(accounts.token_b_vault.key(), false),
        AccountMeta::new_readonly(accounts.token_a_mint.key(), false),
        AccountMeta::new_readonly(accounts.token_b_mint.key(), false),
        AccountMeta::new_readonly(accounts.position_nft_account.key(), false),
        AccountMeta::new_readonly(accounts.owner.key(), true),
        AccountMeta::new_readonly(accounts.token_a_program.key(), false),
        AccountMeta::new_readonly(accounts.token_b_program.key(), false),
        AccountMeta::new_readonly(accounts.event_authority.key(), false),
        AccountMeta::new_readonly(accounts.meteora_program.key(), false),
    ];

    let ix = Instruction {
        program_id: METEORA_PROGRAM_ID,
        accounts: account_metas,
        data: CLAIM_POSITION_FEE_DISC.to_vec(),
    };

    let account_infos = &[
        accounts.pool_authority.clone(),
        accounts.pool.clone(),
        accounts.position.clone(),
        accounts.token_a_account.clone(),
        accounts.token_b_account.clone(),
        accounts.token_a_vault.clone(),
        accounts.token_b_vault.clone(),
        accounts.token_a_mint.clone(),
        accounts.token_b_mint.clone(),
        accounts.position_nft_account.clone(),
        accounts.owner.clone(),
        accounts.token_a_program.clone(),
        accounts.token_b_program.clone(),
        accounts.event_authority.clone(),
        accounts.meteora_program.clone(),
    ];

    invoke_signed(&ix, account_infos, signer_seeds)
        .map_err(|_| error!(LaunchpadError::InvalidPoolParams))?;

    Ok(())
}

// ── Price helpers ────────────────────────────────────────────────────────

/// Calculate initial sqrt_price for Meteora pool from launch liquidity.
///
/// Meteora expects sqrt_price = sqrt(token_b / token_a) * 2^64, where token A
/// is WSOL and token B is the launched token.
///
/// Approach: sqrt_price = isqrt(tokens) * 2^64 / isqrt(sol)
/// This avoids the impossible `shl(128)` on u128.
pub fn calculate_init_sqrt_price(sol_amount: u64, token_amount: u64) -> Result<u128> {
    require!(token_amount > 0, LaunchpadError::DivisionByZero);
    require!(sol_amount > 0, LaunchpadError::ZeroAmount);

    let sqrt_sol = isqrt_u128(sol_amount as u128);
    let sqrt_tokens = isqrt_u128(token_amount as u128);

    require!(sqrt_sol > 0, LaunchpadError::DivisionByZero);

    let numerator = sqrt_tokens
        .checked_mul(1u128 << 64)
        .ok_or(LaunchpadError::MathOverflow)?;

    let sqrt_price = numerator
        .checked_div(sqrt_sol)
        .ok_or(LaunchpadError::DivisionByZero)?;

    require!(sqrt_price > 0, LaunchpadError::ZeroAmount);

    Ok(sqrt_price)
}

/// Derive a full-range liquidity delta compatible with Meteora's
/// `initialize_pool` math.
pub fn calculate_initial_liquidity(
    sol_amount: u64,
    token_amount: u64,
    sqrt_price: u128,
) -> Result<u128> {
    require!(sol_amount > 0, LaunchpadError::ZeroAmount);
    require!(token_amount > 0, LaunchpadError::ZeroAmount);
    require!(sqrt_price > 0, LaunchpadError::ZeroAmount);

    // Our migration flow derives `sqrt_price` from the actual deposit amounts,
    // so the token-A side yields the correct compounding-pool liquidity delta
    // without requiring a 256-bit `amount_b << 128` intermediate.
    let liquidity = (sol_amount as u128)
        .checked_mul(sqrt_price)
        .ok_or(LaunchpadError::MathOverflow)?;

    require!(liquidity > 0, LaunchpadError::ZeroAmount);
    Ok(liquidity)
}

/// Integer square root for u128.
fn isqrt_u128(n: u128) -> u128 {
    if n < 2 {
        return n;
    }

    let mut x = n / 2 + 1;
    let mut y = (x + n / x) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_isqrt() {
        assert_eq!(isqrt_u128(0), 0);
        assert_eq!(isqrt_u128(1), 1);
        assert_eq!(isqrt_u128(4), 2);
        assert_eq!(isqrt_u128(9), 3);
        assert_eq!(isqrt_u128(100), 10);
        assert_eq!(isqrt_u128(u128::MAX), 18446744073709551615); // 2^64 - 1
    }

    #[test]
    fn test_sqrt_price_calculation() {
        // 100 SOL with 1B tokens (6 decimals)
        let sqrt_price = calculate_init_sqrt_price(
            100_000_000_000,       // 100 SOL in lamports
            1_000_000_000_000_000, // 1B tokens (6 decimals)
        )
        .unwrap();

        assert!(sqrt_price > 0);
        // sqrt(1e15 / 100e9) * 2^64 = 100 * 2^64-ish
        assert!(sqrt_price > (1u128 << 64));
    }

    #[test]
    fn test_sqrt_price_equal_amounts() {
        // 1:1 ratio → sqrt(1) * 2^64 = 2^64
        let sqrt_price = calculate_init_sqrt_price(1_000_000_000, 1_000_000_000).unwrap();
        // Should be close to 2^64 = 18446744073709551616
        assert!(sqrt_price > 18_000_000_000_000_000_000u128);
        assert!(sqrt_price < 19_000_000_000_000_000_000u128);
    }

    #[test]
    fn test_initial_liquidity_is_non_zero() {
        let sqrt_price = calculate_init_sqrt_price(4_000_000_000, 800_000_000_000_000).unwrap();
        let liquidity =
            calculate_initial_liquidity(4_000_000_000, 800_000_000_000_000, sqrt_price).unwrap();
        assert!(liquidity > 0);
    }

    #[test]
    fn initial_liquidity_recreates_launch_amounts() {
        let sol_amount = 4_118_400_000u64;
        let token_amount = 829_293_274_155_000u64;
        let sqrt_price = calculate_init_sqrt_price(sol_amount, token_amount).unwrap();
        let liquidity = calculate_initial_liquidity(sol_amount, token_amount, sqrt_price).unwrap();

        assert!(liquidity > (sol_amount as u128));
        assert!(liquidity > sqrt_price);
    }
}
