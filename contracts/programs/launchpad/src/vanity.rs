use anchor_lang::prelude::*;

pub const REQUIRED_MINT_SUFFIX: &str = "rug";

pub fn has_required_mint_suffix(mint: &Pubkey) -> bool {
    bs58::encode(mint.to_bytes())
        .into_string()
        .ends_with(REQUIRED_MINT_SUFFIX)
}
