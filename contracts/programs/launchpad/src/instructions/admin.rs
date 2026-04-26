use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};

use crate::errors::LaunchpadError;
use crate::events::ConfigUpdated;
use crate::state::{GlobalConfig, KEEPER_WALLET};

const CONFIG_DISCRIMINATOR_LEN: usize = 8;
const LEGACY_CONFIG_SPACE: usize = 172;
const OLD_CONFIG_SPACE: usize = 176;
const NEW_CONFIG_SPACE: usize = GlobalConfig::INIT_SPACE;
const CONFIG_ADMIN_OFFSET: usize = CONFIG_DISCRIMINATOR_LEN;
const LEGACY_PENDING_ADMIN_OFFSET: usize = 146;
const LEGACY_IS_PAUSED_OFFSET: usize = 178;
const LEGACY_BUMP_OFFSET: usize = 179;
const OLD_CREATOR_FEE_BPS_OFFSET: usize = 146;
const OLD_PROTOCOL_FEE_BPS_OFFSET: usize = 148;
const OLD_PENDING_ADMIN_OFFSET: usize = 150;
const OLD_IS_PAUSED_OFFSET: usize = 182;
const OLD_BUMP_OFFSET: usize = 183;
const NEW_CREATOR_FEE_BPS_OFFSET: usize = 146;
const NEW_PROTOCOL_FEE_BPS_OFFSET: usize = 148;
const NEW_KEEPER_FEE_BPS_OFFSET: usize = 150;
const CURRENT_KEEPER_FEE_BPS_OFFSET: usize = 150;
const CURRENT_PENDING_ADMIN_OFFSET: usize = 152;
const CURRENT_IS_PAUSED_OFFSET: usize = 184;
const CURRENT_BUMP_OFFSET: usize = 185;
const NEW_KEEPER_WALLET_OFFSET: usize = 152;
const NEW_PENDING_ADMIN_OFFSET: usize = 184;
const NEW_IS_PAUSED_OFFSET: usize = 216;
const NEW_BUMP_OFFSET: usize = 217;
const DEFAULT_CREATOR_FEE_BPS: u16 = 7000;
const DEFAULT_PROTOCOL_FEE_BPS: u16 = 2950;

// ── Update Config (fees, wallets — NOT admin) ───────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateConfigParams {
    pub new_pause_authority: Option<Pubkey>,
    pub new_dev_wallet: Option<Pubkey>,
    pub new_platform_wallet: Option<Pubkey>,
    pub new_dev_fee_bps: Option<u16>,
    pub new_platform_fee_bps: Option<u16>,
    pub new_sell_tax_bps: Option<u16>,
    pub new_presale_platform_fee_bps: Option<u16>,
    pub new_migration_fee_bps: Option<u16>,
    pub new_creator_fee_bps: Option<u16>,
    pub new_protocol_fee_bps: Option<u16>,
    pub new_keeper_fee_bps: Option<u16>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        constraint = config.admin == admin.key() @ LaunchpadError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,
}

pub fn handle_update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(v) = params.new_pause_authority {
        config.pause_authority = v;
    }
    if let Some(v) = params.new_dev_wallet {
        config.dev_wallet = v;
    }
    if let Some(v) = params.new_platform_wallet {
        config.platform_wallet = v;
    }
    if let Some(v) = params.new_dev_fee_bps {
        require!(v <= 500, LaunchpadError::InvalidFeeConfig);
        config.dev_fee_bps = v;
    }
    if let Some(v) = params.new_platform_fee_bps {
        require!(v <= 500, LaunchpadError::InvalidFeeConfig);
        config.platform_fee_bps = v;
    }
    if let Some(v) = params.new_sell_tax_bps {
        require!(v <= 5000, LaunchpadError::InvalidFeeConfig);
        config.sell_tax_bps = v;
    }
    if let Some(v) = params.new_presale_platform_fee_bps {
        require!(v <= 500, LaunchpadError::InvalidFeeConfig);
        config.presale_platform_fee_bps = v;
    }
    if let Some(v) = params.new_migration_fee_bps {
        require!(v <= 500, LaunchpadError::InvalidFeeConfig);
        config.migration_fee_bps = v;
    }
    let creator_fee_bps = params.new_creator_fee_bps.unwrap_or(config.creator_fee_bps);
    let protocol_fee_bps = params
        .new_protocol_fee_bps
        .unwrap_or(config.protocol_fee_bps);
    let keeper_fee_bps = params.new_keeper_fee_bps.unwrap_or(config.keeper_fee_bps);
    require!(
        (creator_fee_bps as u32) + (protocol_fee_bps as u32) + (keeper_fee_bps as u32) == 10_000,
        LaunchpadError::InvalidFeeConfig
    );
    config.creator_fee_bps = creator_fee_bps;
    config.protocol_fee_bps = protocol_fee_bps;
    config.keeper_fee_bps = keeper_fee_bps;

    emit!(ConfigUpdated {
        admin: ctx.accounts.admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ── One-time Config Migration ───────────────────────────────────────────

#[derive(Accounts)]
pub struct UpgradeConfigV2<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Handles the legacy GlobalConfig layout before keeper_fee_bps was added.
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump,
        owner = crate::ID,
    )]
    pub config: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_upgrade_config_v2(ctx: Context<UpgradeConfigV2>, keeper_fee_bps: u16) -> Result<()> {
    require!(keeper_fee_bps <= 500, LaunchpadError::InvalidFeeConfig);

    let config_info = ctx.accounts.config.to_account_info();
    let old_len = config_info.data_len();
    let new_len = CONFIG_DISCRIMINATOR_LEN + NEW_CONFIG_SPACE;

    let legacy_len = CONFIG_DISCRIMINATOR_LEN + LEGACY_CONFIG_SPACE;
    let old_config_len = CONFIG_DISCRIMINATOR_LEN + OLD_CONFIG_SPACE;
    require!(old_len >= legacy_len, LaunchpadError::InvalidPoolParams);

    let admin = {
        let data = config_info.data.borrow();
        Pubkey::new_from_array(
            data[CONFIG_ADMIN_OFFSET..CONFIG_ADMIN_OFFSET + 32]
                .try_into()
                .map_err(|_| LaunchpadError::InvalidPoolParams)?,
        )
    };
    require_keys_eq!(
        admin,
        ctx.accounts.admin.key(),
        LaunchpadError::UnauthorizedAdmin
    );

    if old_len >= new_len {
        return Ok(());
    }

    let (creator_fee_bps, protocol_fee_bps, pending_admin, is_paused, bump) = {
        let data = config_info.data.borrow();
        if old_len == legacy_len {
            (
                DEFAULT_CREATOR_FEE_BPS,
                DEFAULT_PROTOCOL_FEE_BPS,
                data[LEGACY_PENDING_ADMIN_OFFSET..LEGACY_PENDING_ADMIN_OFFSET + 32].to_vec(),
                data[LEGACY_IS_PAUSED_OFFSET],
                data[LEGACY_BUMP_OFFSET],
            )
        } else if old_len == old_config_len {
            (
                u16::from_le_bytes(
                    data[OLD_CREATOR_FEE_BPS_OFFSET..OLD_CREATOR_FEE_BPS_OFFSET + 2]
                        .try_into()
                        .map_err(|_| LaunchpadError::InvalidPoolParams)?,
                ),
                u16::from_le_bytes(
                    data[OLD_PROTOCOL_FEE_BPS_OFFSET..OLD_PROTOCOL_FEE_BPS_OFFSET + 2]
                        .try_into()
                        .map_err(|_| LaunchpadError::InvalidPoolParams)?,
                ),
                data[OLD_PENDING_ADMIN_OFFSET..OLD_PENDING_ADMIN_OFFSET + 32].to_vec(),
                data[OLD_IS_PAUSED_OFFSET],
                data[OLD_BUMP_OFFSET],
            )
        } else if old_len == CONFIG_DISCRIMINATOR_LEN + LEGACY_CONFIG_SPACE + 14 {
            (
                u16::from_le_bytes(
                    data[NEW_CREATOR_FEE_BPS_OFFSET..NEW_CREATOR_FEE_BPS_OFFSET + 2]
                        .try_into()
                        .map_err(|_| LaunchpadError::InvalidPoolParams)?,
                ),
                u16::from_le_bytes(
                    data[NEW_PROTOCOL_FEE_BPS_OFFSET..NEW_PROTOCOL_FEE_BPS_OFFSET + 2]
                        .try_into()
                        .map_err(|_| LaunchpadError::InvalidPoolParams)?,
                ),
                data[CURRENT_PENDING_ADMIN_OFFSET..CURRENT_PENDING_ADMIN_OFFSET + 32].to_vec(),
                data[CURRENT_IS_PAUSED_OFFSET],
                data[CURRENT_BUMP_OFFSET],
            )
        } else {
            return err!(LaunchpadError::InvalidPoolParams);
        }
    };

    require!(
        (creator_fee_bps as u32) + (protocol_fee_bps as u32) + (keeper_fee_bps as u32) == 10_000,
        LaunchpadError::InvalidFeeConfig
    );

    let rent = Rent::get()?;
    let required_lamports = rent.minimum_balance(new_len);
    let current_lamports = config_info.lamports();
    if required_lamports > current_lamports {
        invoke(
            &system_instruction::transfer(
                &ctx.accounts.admin.key(),
                &config_info.key(),
                required_lamports
                    .checked_sub(current_lamports)
                    .ok_or(LaunchpadError::MathUnderflow)?,
            ),
            &[
                ctx.accounts.admin.to_account_info(),
                config_info.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
    }

    config_info.realloc(new_len, false)?;

    let mut data = config_info.data.borrow_mut();
    data[NEW_CREATOR_FEE_BPS_OFFSET..NEW_CREATOR_FEE_BPS_OFFSET + 2]
        .copy_from_slice(&creator_fee_bps.to_le_bytes());
    data[NEW_PROTOCOL_FEE_BPS_OFFSET..NEW_PROTOCOL_FEE_BPS_OFFSET + 2]
        .copy_from_slice(&protocol_fee_bps.to_le_bytes());
    data[NEW_KEEPER_FEE_BPS_OFFSET..NEW_KEEPER_FEE_BPS_OFFSET + 2]
        .copy_from_slice(&keeper_fee_bps.to_le_bytes());
    data[NEW_KEEPER_WALLET_OFFSET..NEW_KEEPER_WALLET_OFFSET + 32]
        .copy_from_slice(KEEPER_WALLET.as_ref());
    data[NEW_PENDING_ADMIN_OFFSET..NEW_PENDING_ADMIN_OFFSET + 32].copy_from_slice(&pending_admin);
    data[NEW_IS_PAUSED_OFFSET] = is_paused;
    data[NEW_BUMP_OFFSET] = bump;

    emit!(ConfigUpdated {
        admin: ctx.accounts.admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ── Two-Step Admin Transfer ─────────────────────────────────────────────

#[derive(Accounts)]
pub struct ProposeAdmin<'info> {
    #[account(
        constraint = config.admin == admin.key() @ LaunchpadError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,
}

pub fn handle_propose_admin(ctx: Context<ProposeAdmin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = new_admin;
    msg!("Admin transfer proposed to {}", new_admin);
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(
        constraint = config.pending_admin == new_admin.key() @ LaunchpadError::UnauthorizedAdmin
    )]
    pub new_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,
}

pub fn handle_accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = config.pending_admin;
    config.pending_admin = Pubkey::default();

    emit!(ConfigUpdated {
        admin: config.admin,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ── Pause / Unpause ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        constraint = (
            config.admin == authority.key() || config.pause_authority == authority.key()
        ) @ LaunchpadError::UnauthorizedPauseAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,
}

pub fn handle_pause(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.config.is_paused = true;
    msg!("Platform paused by {}", ctx.accounts.authority.key());
    Ok(())
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        constraint = config.admin == authority.key() @ LaunchpadError::UnauthorizedAdmin
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,
}

pub fn handle_unpause(ctx: Context<Unpause>) -> Result<()> {
    ctx.accounts.config.is_paused = false;
    msg!("Platform unpaused by {}", ctx.accounts.authority.key());
    Ok(())
}
