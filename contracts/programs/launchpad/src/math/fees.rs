use crate::errors::LaunchpadError;
use anchor_lang::prelude::*;

pub const BPS_DENOMINATOR: u64 = 10_000;

/// Fee breakdown for a bonding curve buy.
#[derive(Debug, Clone, Copy)]
pub struct BuyFees {
    /// Fee going to the token creator
    pub creator_fee: u64,
    /// Fee going to platform wallet
    pub platform_fee: u64,
    /// Total fee deducted
    pub total_fee: u64,
    /// Net SOL after fees (goes to bonding curve)
    pub net_amount: u64,
}

/// Fee breakdown for a bonding curve sell.
#[derive(Debug, Clone, Copy)]
pub struct SellFees {
    /// Fee going to the token creator
    pub creator_fee: u64,
    /// Fee going to platform wallet
    pub platform_fee: u64,
    /// Sell tax going to buyback treasury (24% of SOL output)
    pub sell_tax: u64,
    /// Total deducted
    pub total_fee: u64,
    /// Net SOL user receives
    pub net_amount: u64,
}

/// Calculate basis points of an amount.
/// `amount * bps / 10_000` using u128 intermediate.
pub fn apply_bps(amount: u64, bps: u16) -> Result<u64> {
    let result: u128 = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(LaunchpadError::DivisionByZero)?;

    u64::try_from(result).map_err(|_| error!(LaunchpadError::CastOverflow))
}

/// Calculate buy fees for bonding curve.
///
/// Total buy fee = creator_fee_bps + platform_fee_bps (deducted from SOL input).
/// Net SOL = input - total_fee → goes into bonding curve.
pub fn calculate_buy_fees(
    sol_amount: u64,
    creator_fee_bps: u16,
    platform_fee_bps: u16,
) -> Result<BuyFees> {
    let total_bps = creator_fee_bps
        .checked_add(platform_fee_bps)
        .ok_or(LaunchpadError::MathOverflow)?;

    let total_fee = apply_bps(sol_amount, total_bps)?;

    // Split proportionally: creator gets creator_bps / total_bps of total_fee
    let creator_fee = if total_bps > 0 {
        let creator: u128 = (total_fee as u128)
            .checked_mul(creator_fee_bps as u128)
            .ok_or(LaunchpadError::MathOverflow)?
            .checked_div(total_bps as u128)
            .ok_or(LaunchpadError::DivisionByZero)?;
        u64::try_from(creator).map_err(|_| error!(LaunchpadError::CastOverflow))?
    } else {
        0
    };

    // Platform gets remainder to avoid rounding dust
    let platform_fee = total_fee
        .checked_sub(creator_fee)
        .ok_or(LaunchpadError::MathUnderflow)?;

    let net_amount = sol_amount
        .checked_sub(total_fee)
        .ok_or(LaunchpadError::MathUnderflow)?;

    Ok(BuyFees {
        creator_fee,
        platform_fee,
        total_fee,
        net_amount,
    })
}

/// Calculate sell fees for bonding curve.
///
/// From the gross SOL output of the curve:
/// - creator_fee_bps → creator wallet
/// - platform_fee_bps → platform wallet
/// - sell_tax_bps → buyback treasury
/// - remainder → user
pub fn calculate_sell_fees(
    gross_sol_out: u64,
    creator_fee_bps: u16,
    platform_fee_bps: u16,
    sell_tax_bps: u16,
) -> Result<SellFees> {
    let creator_fee = apply_bps(gross_sol_out, creator_fee_bps)?;
    let platform_fee = apply_bps(gross_sol_out, platform_fee_bps)?;
    let sell_tax = apply_bps(gross_sol_out, sell_tax_bps)?;

    let total_fee = creator_fee
        .checked_add(platform_fee)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_add(sell_tax)
        .ok_or(LaunchpadError::MathOverflow)?;

    let net_amount = gross_sol_out
        .checked_sub(total_fee)
        .ok_or(LaunchpadError::MathUnderflow)?;

    Ok(SellFees {
        creator_fee,
        platform_fee,
        sell_tax,
        total_fee,
        net_amount,
    })
}

/// Calculate presale contribution fee (1% platform fee on SOL input).
pub fn calculate_presale_fee(sol_amount: u64, platform_fee_bps: u16) -> Result<(u64, u64)> {
    let fee = apply_bps(sol_amount, platform_fee_bps)?;
    let net = sol_amount
        .checked_sub(fee)
        .ok_or(LaunchpadError::MathUnderflow)?;
    Ok((fee, net))
}

/// Calculate migration fee splits.
pub fn calculate_migration_fee(total_sol: u64, migration_fee_bps: u16) -> Result<(u64, u64)> {
    let fee = apply_bps(total_sol, migration_fee_bps)?;
    let remainder = total_sol
        .checked_sub(fee)
        .ok_or(LaunchpadError::MathUnderflow)?;
    Ok((fee, remainder))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_bps() {
        // 1 SOL at 50 bps = 0.005 SOL = 5_000_000 lamports
        let result = apply_bps(1_000_000_000, 50).unwrap();
        assert_eq!(result, 5_000_000);
    }

    #[test]
    fn test_buy_fees() {
        let fees = calculate_buy_fees(1_000_000_000, 50, 50).unwrap();
        // 1% total = 10_000_000
        assert_eq!(fees.total_fee, 10_000_000);
        assert_eq!(fees.creator_fee, 5_000_000);
        assert_eq!(fees.platform_fee, 5_000_000);
        assert_eq!(fees.net_amount, 990_000_000);
    }

    #[test]
    fn test_sell_fees() {
        let fees = calculate_sell_fees(1_000_000_000, 50, 50, 2400).unwrap();
        // 0.5% creator = 5M, 0.5% platform = 5M, 24% tax = 240M
        assert_eq!(fees.creator_fee, 5_000_000);
        assert_eq!(fees.platform_fee, 5_000_000);
        assert_eq!(fees.sell_tax, 240_000_000);
        assert_eq!(fees.net_amount, 750_000_000);
    }

    #[test]
    fn test_presale_fee() {
        let (fee, net) = calculate_presale_fee(1_000_000_000, 100).unwrap();
        assert_eq!(fee, 10_000_000);
        assert_eq!(net, 990_000_000);
    }
}
