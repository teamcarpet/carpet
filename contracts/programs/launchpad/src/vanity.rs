use anchor_lang::prelude::*;

pub const REQUIRED_MINT_SUFFIX: &str = "";

pub fn has_required_mint_suffix(mint: &Pubkey) -> bool {
    if REQUIRED_MINT_SUFFIX.is_empty() {
        return true;
    }
    bs58::encode(mint.to_bytes())
        .into_string()
        .ends_with(REQUIRED_MINT_SUFFIX)
}
