/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/launchpad.json`.
 */
export type Launchpad = {
  "address": "DywpVp5YfLiX4M3xfEp333Y2dmq8xywdNAYaWDw6v9XV",
  "metadata": {
    "name": "launchpad",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana token launchpad with bonding curve and presale modes"
  },
  "instructions": [
    {
      "name": "acceptAdmin",
      "discriminator": [
        112,
        42,
        45,
        90,
        116,
        181,
        13,
        170
      ],
      "accounts": [
        {
          "name": "newAdmin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "buyBonding",
      "discriminator": [
        223,
        204,
        211,
        74,
        11,
        184,
        179,
        111
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "buyerPosition",
          "docs": [
            "Per-wallet position tracking for max buy enforcement (H-2 fix)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "docs": [
            "SOL vault PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "docs": [
            "Token vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "buyerTokenAccount",
          "docs": [
            "Buyer's token account"
          ],
          "writable": true
        },
        {
          "name": "creatorWallet",
          "writable": true
        },
        {
          "name": "platformWallet",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "solAmount",
          "type": "u64"
        },
        {
          "name": "minTokensOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimCreatorTokens",
      "discriminator": [
        126,
        208,
        113,
        43,
        222,
        70,
        91,
        48
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "buybackState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimLpFees",
      "discriminator": [
        72,
        86,
        212,
        142,
        60,
        38,
        74,
        75
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "buybackState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              }
            ]
          }
        },
        {
          "name": "lpFeeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              },
              {
                "kind": "account",
                "path": "lp_fee_vault.mint",
                "account": "tokenAccount"
              }
            ]
          }
        },
        {
          "name": "creatorWallet"
        },
        {
          "name": "protocolWallet"
        },
        {
          "name": "pool"
        },
        {
          "name": "creatorFeeAccount",
          "writable": true
        },
        {
          "name": "protocolFeeAccount",
          "writable": true
        },
        {
          "name": "keeperFeeAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimPresale",
      "discriminator": [
        82,
        240,
        122,
        5,
        109,
        66,
        86,
        190
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "docs": [
            "Token vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "docs": [
            "User's token account"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "contributePresale",
      "discriminator": [
        248,
        72,
        28,
        96,
        70,
        166,
        8,
        117
      ],
      "accounts": [
        {
          "name": "contributor",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "docs": [
            "SOL vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "docs": [
            "User's position for this pool (init-if-needed for first contribution)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "contributor"
              }
            ]
          }
        },
        {
          "name": "platformWallet",
          "docs": [
            "Platform wallet for presale fee"
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "solAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createBondingPool",
      "discriminator": [
        240,
        13,
        25,
        154,
        169,
        153,
        25,
        43
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "Token mint — creator must be mint authority initially"
          ],
          "writable": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "docs": [
            "SOL vault PDA holding native SOL lamports."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "docs": [
            "Token vault holding the token supply"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createBondingPoolParams"
            }
          }
        }
      ]
    },
    {
      "name": "createPresalePool",
      "discriminator": [
        255,
        111,
        192,
        70,
        143,
        255,
        232,
        85
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "Token mint — creator must be mint authority"
          ],
          "writable": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "docs": [
            "SOL vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "docs": [
            "Token vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createPresalePoolParams"
            }
          }
        }
      ]
    },
    {
      "name": "executeBuyback",
      "discriminator": [
        47,
        32,
        19,
        100,
        184,
        96,
        144,
        49
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone can trigger buyback (permissionless crank)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "buybackState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              }
            ]
          }
        },
        {
          "name": "buybackSolVault",
          "docs": [
            "SOL vault PDA — validated in handler via PDA derivation"
          ],
          "writable": true
        },
        {
          "name": "poolMint"
        },
        {
          "name": "buybackTokenVault",
          "docs": [
            "Program-owned token vault PDA for receiving swapped tokens.",
            "Tokens land here, NOT in payer's wallet. This prevents theft."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "docs": [
            "Token mint (for burning)"
          ],
          "writable": true
        },
        {
          "name": "meteoraProgram"
        },
        {
          "name": "meteoraPool",
          "docs": [
            "FIX #2: Meteora pool — MUST match the pool recorded during migration"
          ],
          "writable": true
        },
        {
          "name": "meteoraPoolAuthority"
        },
        {
          "name": "meteoraInputVault",
          "docs": [
            "Meteora input vault (SOL/WSOL side)"
          ],
          "writable": true
        },
        {
          "name": "meteoraOutputVault",
          "docs": [
            "Meteora output vault (token side)"
          ],
          "writable": true
        },
        {
          "name": "wsolMint"
        },
        {
          "name": "payerWsolAccount",
          "docs": [
            "Payer's WSOL account for swap input"
          ],
          "writable": true
        },
        {
          "name": "meteoraEventAuthority"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "executeBuybackParams"
            }
          }
        }
      ]
    },
    {
      "name": "harvestAndSplitLpFees",
      "discriminator": [
        213,
        215,
        28,
        113,
        143,
        32,
        151,
        150
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "buybackState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              }
            ]
          }
        },
        {
          "name": "lpCustody",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  99,
                  117,
                  115,
                  116,
                  111,
                  100,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              }
            ]
          }
        },
        {
          "name": "tokenAFeeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              },
              {
                "kind": "account",
                "path": "tokenAMint"
              }
            ]
          }
        },
        {
          "name": "tokenBFeeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              },
              {
                "kind": "account",
                "path": "tokenBMint"
              }
            ]
          }
        },
        {
          "name": "creatorWallet"
        },
        {
          "name": "protocolWallet"
        },
        {
          "name": "pool"
        },
        {
          "name": "creatorFeeAccountA",
          "writable": true
        },
        {
          "name": "protocolFeeAccountA",
          "writable": true
        },
        {
          "name": "keeperFeeAccountA",
          "writable": true
        },
        {
          "name": "creatorFeeAccountB",
          "writable": true
        },
        {
          "name": "protocolFeeAccountB",
          "writable": true
        },
        {
          "name": "keeperFeeAccountB",
          "writable": true
        },
        {
          "name": "meteoraProgram"
        },
        {
          "name": "meteoraPool"
        },
        {
          "name": "meteoraPoolAuthority"
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "positionNftAccount"
        },
        {
          "name": "meteoraTokenAVault",
          "writable": true
        },
        {
          "name": "meteoraTokenBVault",
          "writable": true
        },
        {
          "name": "tokenAMint",
          "docs": [
            "WSOL/token A mint."
          ]
        },
        {
          "name": "tokenBMint",
          "docs": [
            "Launch token mint."
          ]
        },
        {
          "name": "meteoraEventAuthority"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeParams"
            }
          }
        }
      ]
    },
    {
      "name": "migrateBonding",
      "discriminator": [
        171,
        184,
        81,
        127,
        253,
        22,
        158,
        206
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "C-6: Only admin can trigger migration"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "docs": [
            "SOL vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "docs": [
            "Token vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "buybackState",
          "docs": [
            "Buyback state account (init)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "buybackTokenVault",
          "docs": [
            "Token vault for buyback — tokens land here during buyback, not in payer wallet"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "platformWallet",
          "docs": [
            "Platform wallet receives migration fee"
          ],
          "writable": true
        },
        {
          "name": "meteoraProgram"
        },
        {
          "name": "meteoraPool",
          "writable": true
        },
        {
          "name": "meteoraPoolConfig"
        },
        {
          "name": "meteoraPoolAuthority"
        },
        {
          "name": "token2022Program"
        },
        {
          "name": "meteoraEventAuthority"
        },
        {
          "name": "lpCustody",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  99,
                  117,
                  115,
                  116,
                  111,
                  100,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "positionNftMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "positionNftAccount",
          "writable": true
        },
        {
          "name": "positionAccount",
          "writable": true
        },
        {
          "name": "positionNftMetadata",
          "writable": true
        },
        {
          "name": "meteoraVaultA",
          "writable": true
        },
        {
          "name": "meteoraVaultB",
          "writable": true
        },
        {
          "name": "wsolMint",
          "docs": [
            "C-7: WSOL mint — validated to be the canonical native mint"
          ]
        },
        {
          "name": "tokenMint",
          "docs": [
            "H-4: Actual token mint (for Meteora pool creation + buyback vault init)"
          ]
        },
        {
          "name": "payerWsolAccount",
          "docs": [
            "Payer's WSOL token account (for SOL deposit)"
          ],
          "writable": true
        },
        {
          "name": "payerTokenAccount",
          "docs": [
            "Payer's token B account (for token deposit)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "migratePresale",
      "discriminator": [
        10,
        76,
        8,
        246,
        151,
        28,
        91,
        25
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "C-6: Only admin can trigger migration"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "docs": [
            "SOL vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "docs": [
            "Token vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "buybackState",
          "docs": [
            "Buyback state account"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "buybackTokenVault",
          "docs": [
            "Token vault for buyback — tokens land here during buyback"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "platformWallet",
          "docs": [
            "Platform wallet"
          ],
          "writable": true
        },
        {
          "name": "creatorWallet",
          "docs": [
            "Creator wallet receives the creator SOL allocation."
          ],
          "writable": true
        },
        {
          "name": "meteoraProgram"
        },
        {
          "name": "meteoraPool",
          "writable": true
        },
        {
          "name": "meteoraPoolConfig"
        },
        {
          "name": "meteoraPoolAuthority"
        },
        {
          "name": "token2022Program"
        },
        {
          "name": "meteoraEventAuthority"
        },
        {
          "name": "lpCustody",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  99,
                  117,
                  115,
                  116,
                  111,
                  100,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "positionNftMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "positionNftAccount",
          "writable": true
        },
        {
          "name": "positionAccount",
          "writable": true
        },
        {
          "name": "positionNftMetadata",
          "writable": true
        },
        {
          "name": "meteoraVaultA",
          "writable": true
        },
        {
          "name": "meteoraVaultB",
          "writable": true
        },
        {
          "name": "wsolMint",
          "docs": [
            "C-7: WSOL mint validated"
          ]
        },
        {
          "name": "tokenMint",
          "docs": [
            "H-4: Token mint for Meteora + buyback vault init"
          ]
        },
        {
          "name": "payerWsolAccount",
          "docs": [
            "Payer WSOL account"
          ],
          "writable": true
        },
        {
          "name": "payerTokenAccount",
          "docs": [
            "Payer token account"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "pause",
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "proposeAdmin",
      "discriminator": [
        121,
        214,
        199,
        212,
        87,
        39,
        117,
        234
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "refundPresale",
      "discriminator": [
        70,
        192,
        242,
        198,
        106,
        202,
        142,
        48
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "docs": [
            "SOL vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  115,
                  97,
                  108,
                  101,
                  95,
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "presalePool"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "sellBonding",
      "discriminator": [
        160,
        199,
        9,
        23,
        236,
        33,
        49,
        0
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "docs": [
            "SOL vault PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "docs": [
            "Token vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mint",
                "account": "bondingCurvePool"
              }
            ]
          }
        },
        {
          "name": "sellerTokenAccount",
          "docs": [
            "Seller's token account"
          ],
          "writable": true
        },
        {
          "name": "creatorWallet",
          "writable": true
        },
        {
          "name": "platformWallet",
          "docs": [
            "Platform wallet receives platform fee"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tokenAmount",
          "type": "u64"
        },
        {
          "name": "minSolOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "splitClaimedFees",
      "discriminator": [
        133,
        27,
        242,
        87,
        63,
        146,
        169,
        4
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "buybackState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              }
            ]
          }
        },
        {
          "name": "lpFeeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "buyback_state.pool",
                "account": "buybackState"
              },
              {
                "kind": "account",
                "path": "lp_fee_vault.mint",
                "account": "tokenAccount"
              }
            ]
          }
        },
        {
          "name": "creatorWallet"
        },
        {
          "name": "protocolWallet"
        },
        {
          "name": "pool"
        },
        {
          "name": "creatorFeeAccount",
          "writable": true
        },
        {
          "name": "protocolFeeAccount",
          "writable": true
        },
        {
          "name": "keeperFeeAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "unpause",
      "discriminator": [
        169,
        144,
        4,
        38,
        10,
        141,
        188,
        255
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateConfigParams"
            }
          }
        }
      ]
    },
    {
      "name": "upgradeConfigV2",
      "discriminator": [
        19,
        182,
        14,
        42,
        207,
        154,
        117,
        88
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "keeperFeeBps",
          "type": "u16"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bondingCurvePool",
      "discriminator": [
        167,
        155,
        150,
        227,
        65,
        117,
        3,
        86
      ]
    },
    {
      "name": "buybackState",
      "discriminator": [
        247,
        168,
        248,
        43,
        167,
        32,
        210,
        84
      ]
    },
    {
      "name": "globalConfig",
      "discriminator": [
        149,
        8,
        156,
        202,
        160,
        252,
        176,
        217
      ]
    },
    {
      "name": "presalePool",
      "discriminator": [
        40,
        45,
        173,
        158,
        138,
        60,
        76,
        118
      ]
    },
    {
      "name": "userPosition",
      "discriminator": [
        251,
        248,
        209,
        245,
        83,
        234,
        17,
        27
      ]
    }
  ],
  "events": [
    {
      "name": "buybackExecuted",
      "discriminator": [
        150,
        109,
        157,
        10,
        124,
        24,
        38,
        189
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "migrationCompleted",
      "discriminator": [
        223,
        45,
        123,
        192,
        106,
        249,
        6,
        241
      ]
    },
    {
      "name": "migrationReady",
      "discriminator": [
        15,
        71,
        184,
        9,
        194,
        36,
        174,
        235
      ]
    },
    {
      "name": "poolCreated",
      "discriminator": [
        202,
        44,
        41,
        88,
        104,
        220,
        157,
        82
      ]
    },
    {
      "name": "presaleClaimed",
      "discriminator": [
        71,
        206,
        74,
        134,
        208,
        95,
        73,
        99
      ]
    },
    {
      "name": "presaleContribution",
      "discriminator": [
        236,
        32,
        200,
        82,
        145,
        235,
        141,
        28
      ]
    },
    {
      "name": "presaleRefunded",
      "discriminator": [
        136,
        243,
        241,
        106,
        87,
        219,
        231,
        232
      ]
    },
    {
      "name": "tokensBought",
      "discriminator": [
        151,
        148,
        173,
        226,
        128,
        30,
        249,
        190
      ]
    },
    {
      "name": "tokensSold",
      "discriminator": [
        217,
        83,
        68,
        137,
        134,
        225,
        94,
        45
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6001,
      "name": "mathUnderflow",
      "msg": "Arithmetic underflow"
    },
    {
      "code": 6002,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6003,
      "name": "castOverflow",
      "msg": "Result exceeds u64 range"
    },
    {
      "code": 6004,
      "name": "unauthorizedAdmin",
      "msg": "Unauthorized: not admin"
    },
    {
      "code": 6005,
      "name": "unauthorizedPauseAuthority",
      "msg": "Unauthorized: not pause authority"
    },
    {
      "code": 6006,
      "name": "unauthorizedCreator",
      "msg": "Unauthorized: not pool creator"
    },
    {
      "code": 6007,
      "name": "platformPaused",
      "msg": "Platform is paused"
    },
    {
      "code": 6008,
      "name": "poolPaused",
      "msg": "Pool is paused"
    },
    {
      "code": 6009,
      "name": "alreadyMigrated",
      "msg": "Pool already migrated"
    },
    {
      "code": 6010,
      "name": "notMigrated",
      "msg": "Pool not migrated yet"
    },
    {
      "code": 6011,
      "name": "migrationTargetNotReached",
      "msg": "Migration target not reached"
    },
    {
      "code": 6012,
      "name": "poolNotActive",
      "msg": "Pool is not active"
    },
    {
      "code": 6013,
      "name": "exceedsMaxBuy",
      "msg": "Buy amount exceeds max 1% per wallet"
    },
    {
      "code": 6014,
      "name": "insufficientTokenReserves",
      "msg": "Insufficient token reserves"
    },
    {
      "code": 6015,
      "name": "insufficientSolReserves",
      "msg": "Insufficient SOL reserves"
    },
    {
      "code": 6016,
      "name": "slippageExceeded",
      "msg": "Slippage tolerance exceeded"
    },
    {
      "code": 6017,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6018,
      "name": "presaleEnded",
      "msg": "Presale has ended"
    },
    {
      "code": 6019,
      "name": "presaleNotEnded",
      "msg": "Presale has not ended yet"
    },
    {
      "code": 6020,
      "name": "exceedsMaxContribution",
      "msg": "Contribution exceeds max 1% per wallet"
    },
    {
      "code": 6021,
      "name": "alreadyClaimed",
      "msg": "Tokens already claimed"
    },
    {
      "code": 6022,
      "name": "alreadyRefunded",
      "msg": "Refund already claimed"
    },
    {
      "code": 6023,
      "name": "targetReached",
      "msg": "Presale target was reached, no refund"
    },
    {
      "code": 6024,
      "name": "invalidMigrationTarget",
      "msg": "Invalid migration target: must be 100-10000 SOL"
    },
    {
      "code": 6025,
      "name": "invalidEndTime",
      "msg": "Invalid end time: must be in the future"
    },
    {
      "code": 6026,
      "name": "buybackTooFrequent",
      "msg": "Buyback rate limit: too frequent"
    },
    {
      "code": 6027,
      "name": "insufficientTreasury",
      "msg": "Insufficient treasury balance for buyback"
    },
    {
      "code": 6028,
      "name": "invalidBuybackMode",
      "msg": "Invalid buyback mode"
    },
    {
      "code": 6029,
      "name": "idleBuybackTokens",
      "msg": "Buyback left idle token balance"
    },
    {
      "code": 6030,
      "name": "allRoundsExecuted",
      "msg": "All scheduled buyback rounds already executed"
    },
    {
      "code": 6031,
      "name": "roundNotDue",
      "msg": "Next buyback round not yet due"
    },
    {
      "code": 6032,
      "name": "invalidFeeConfig",
      "msg": "Invalid fee configuration"
    },
    {
      "code": 6033,
      "name": "invalidPoolParams",
      "msg": "Invalid pool parameters"
    },
    {
      "code": 6034,
      "name": "invalidMintSuffix",
      "msg": "Mint address must end with required launchpad suffix"
    },
    {
      "code": 6035,
      "name": "mintFreezable",
      "msg": "Mint freeze authority must be revoked"
    },
    {
      "code": 6036,
      "name": "unsafeMintAuthority",
      "msg": "Mint authority must be revoked or program controlled"
    },
    {
      "code": 6037,
      "name": "adminLpCustody",
      "msg": "LP position cannot be custodied by admin"
    },
    {
      "code": 6038,
      "name": "nothingToClaim",
      "msg": "Creator token allocation already fully claimed"
    },
    {
      "code": 6039,
      "name": "creatorOverclaim",
      "msg": "Creator claim exceeds allocation"
    }
  ],
  "types": [
    {
      "name": "bondingCurvePool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "docs": [
              "Pool creator"
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "Token mint"
            ],
            "type": "pubkey"
          },
          {
            "name": "virtualSolReserves",
            "docs": [
              "Virtual SOL reserves for price calculation"
            ],
            "type": "u64"
          },
          {
            "name": "virtualTokenReserves",
            "docs": [
              "Virtual token reserves for price calculation"
            ],
            "type": "u64"
          },
          {
            "name": "realSolReserves",
            "docs": [
              "Actual SOL collected (in lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "realTokenReserves",
            "docs": [
              "Actual tokens remaining in vault"
            ],
            "type": "u64"
          },
          {
            "name": "initialRealTokenReserves",
            "docs": [
              "Initial token supply loaded into vault"
            ],
            "type": "u64"
          },
          {
            "name": "migrationTarget",
            "docs": [
              "SOL target for migration (lamports, default: 100 SOL)"
            ],
            "type": "u64"
          },
          {
            "name": "maxBuyBps",
            "docs": [
              "Max buy percentage in basis points (100 = 1%)"
            ],
            "type": "u16"
          },
          {
            "name": "buybackTreasury",
            "docs": [
              "Accumulated sell tax SOL for buyback treasury (lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "isMigrated",
            "docs": [
              "Pool has been migrated to Meteora"
            ],
            "type": "bool"
          },
          {
            "name": "isPaused",
            "docs": [
              "Pool-level pause"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "solVaultBump",
            "docs": [
              "SOL vault bump"
            ],
            "type": "u8"
          },
          {
            "name": "tokenVaultBump",
            "docs": [
              "Token vault bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "buybackExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "solSpent",
            "type": "u64"
          },
          {
            "name": "tokensReceived",
            "type": "u64"
          },
          {
            "name": "mode",
            "type": "u8"
          },
          {
            "name": "roundNumber",
            "docs": [
              "Round number after this execution (1-indexed). 0 for bonding pools."
            ],
            "type": "u8"
          },
          {
            "name": "totalRounds",
            "docs": [
              "Total scheduled rounds. 0 for bonding pools."
            ],
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "buybackMode",
      "docs": [
        "Buyback modes for presale"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "burn"
          }
        ]
      }
    },
    {
      "name": "buybackState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "docs": [
              "Associated pool pubkey"
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "Associated token mint"
            ],
            "type": "pubkey"
          },
          {
            "name": "meteoraPool",
            "docs": [
              "Meteora DAMM pool created during migration — validated on every buyback"
            ],
            "type": "pubkey"
          },
          {
            "name": "lpCustody",
            "docs": [
              "Program PDA that owns/custodies the LP position."
            ],
            "type": "pubkey"
          },
          {
            "name": "positionNftMint",
            "docs": [
              "Meteora position NFT mint for the principal LP position."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasuryBalance",
            "docs": [
              "SOL remaining in buyback treasury (lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "initialTreasury",
            "docs": [
              "Initial treasury at migration time — used as the *fixed* base for",
              "`bps_per_round` calculations so every round spends the same absolute",
              "SOL regardless of remaining balance. Without this the 5th round",
              "would spend 10% of what's left, not 10% of the original pool."
            ],
            "type": "u64"
          },
          {
            "name": "lastBuybackSlot",
            "docs": [
              "Last slot a buyback was executed"
            ],
            "type": "u64"
          },
          {
            "name": "lastBuybackTs",
            "docs": [
              "Last unix timestamp a buyback was executed (for presale interval gating)"
            ],
            "type": "i64"
          },
          {
            "name": "totalSolSpent",
            "docs": [
              "Total SOL spent on buybacks"
            ],
            "type": "u64"
          },
          {
            "name": "totalTokensBought",
            "docs": [
              "Total tokens bought back"
            ],
            "type": "u64"
          },
          {
            "name": "totalTokensBurned",
            "docs": [
              "Total tokens burned"
            ],
            "type": "u64"
          },
          {
            "name": "idleTokens",
            "docs": [
              "Explicit idle token accounting. Must remain zero for burn-only buybacks."
            ],
            "type": "u64"
          },
          {
            "name": "creatorFeeBps",
            "docs": [
              "Creator share of claimed LP fees in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "protocolFeeBps",
            "docs": [
              "Protocol share of claimed LP fees in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "keeperFeeBps",
            "docs": [
              "Keeper reward share of claimed LP fees in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "creatorTokenAllocation",
            "docs": [
              "Creator token allocation claimable from the presale vault."
            ],
            "type": "u64"
          },
          {
            "name": "creatorTokensClaimed",
            "docs": [
              "Creator tokens already claimed."
            ],
            "type": "u64"
          },
          {
            "name": "totalLpFeesClaimedA",
            "docs": [
              "Total token-A LP fees distributed."
            ],
            "type": "u64"
          },
          {
            "name": "totalLpFeesClaimedB",
            "docs": [
              "Total token-B LP fees distributed."
            ],
            "type": "u64"
          },
          {
            "name": "poolType",
            "docs": [
              "Pool type (0 = bonding, 1 = presale)"
            ],
            "type": "u8"
          },
          {
            "name": "totalRounds",
            "docs": [
              "── Presale scheduled-round fields (unused for bonding) ─────────",
              "Total rounds configured (6 for Regular, 12 for Extreme; 0 for bonding)"
            ],
            "type": "u8"
          },
          {
            "name": "roundsExecuted",
            "docs": [
              "Rounds already executed"
            ],
            "type": "u8"
          },
          {
            "name": "bpsPerRound",
            "docs": [
              "BPS of `initial_treasury` spent per round (1000 = 10%, 500 = 5%)"
            ],
            "type": "u16"
          },
          {
            "name": "roundIntervalSeconds",
            "docs": [
              "Seconds between rounds (14_400 or 1_800 for presale)"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "createBondingPoolParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "virtualSolReserves",
            "docs": [
              "Token name (for mint metadata, not stored on-chain in this program)"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "virtualTokenReserves",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "tokenSupply",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "migrationTarget",
            "type": {
              "option": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "createPresalePoolParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "migrationTarget",
            "docs": [
              "Migration target in lamports (100-10,000 SOL)"
            ],
            "type": "u64"
          },
          {
            "name": "tokenSupply",
            "docs": [
              "Total token supply to distribute"
            ],
            "type": "u64"
          },
          {
            "name": "endTime",
            "docs": [
              "Presale end time (unix timestamp)"
            ],
            "type": "i64"
          },
          {
            "name": "creatorPoolBps",
            "docs": [
              "Creator pool percentage in bps (default 2000 = 20%)"
            ],
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "presaleMode",
            "docs": [
              "Post-migration buyback schedule mode (Regular or Extreme)"
            ],
            "type": {
              "defined": {
                "name": "presaleMode"
              }
            }
          }
        ]
      }
    },
    {
      "name": "executeBuybackParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mode",
            "docs": [
              "Buyback mode: burn-only. Any other mode is invalid at decode time."
            ],
            "type": {
              "defined": {
                "name": "buybackMode"
              }
            }
          },
          {
            "name": "minTokensOut",
            "docs": [
              "Minimum tokens expected (slippage protection)"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "globalConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Full admin authority"
            ],
            "type": "pubkey"
          },
          {
            "name": "pauseAuthority",
            "docs": [
              "Can pause/unpause only"
            ],
            "type": "pubkey"
          },
          {
            "name": "devWallet",
            "docs": [
              "Receives dev portion of fees"
            ],
            "type": "pubkey"
          },
          {
            "name": "platformWallet",
            "docs": [
              "Receives platform portion of fees"
            ],
            "type": "pubkey"
          },
          {
            "name": "devFeeBps",
            "docs": [
              "Dev fee in basis points (default: 50 = 0.5%)"
            ],
            "type": "u16"
          },
          {
            "name": "platformFeeBps",
            "docs": [
              "Platform fee in basis points (default: 50 = 0.5%)"
            ],
            "type": "u16"
          },
          {
            "name": "sellTaxBps",
            "docs": [
              "Sell tax in basis points (default: 2400 = 24%)"
            ],
            "type": "u16"
          },
          {
            "name": "presalePlatformFeeBps",
            "docs": [
              "Presale buy fee in basis points (default: 100 = 1%)"
            ],
            "type": "u16"
          },
          {
            "name": "migrationFeeBps",
            "docs": [
              "Migration fee in basis points (default: 100 = 1%)"
            ],
            "type": "u16"
          },
          {
            "name": "creatorFeeBps",
            "docs": [
              "Creator share of claimed LP fees in basis points"
            ],
            "type": "u16"
          },
          {
            "name": "protocolFeeBps",
            "docs": [
              "Protocol share of claimed LP fees in basis points"
            ],
            "type": "u16"
          },
          {
            "name": "keeperFeeBps",
            "docs": [
              "Keeper reward share of claimed LP fees in basis points"
            ],
            "type": "u16"
          },
          {
            "name": "keeperWallet",
            "docs": [
              "Fixed protocol keeper wallet for LP fee harvesting and rewards"
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "docs": [
              "Pending admin for two-step transfer (Pubkey::default() = none)"
            ],
            "type": "pubkey"
          },
          {
            "name": "isPaused",
            "docs": [
              "Global pause flag"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "initializeParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pauseAuthority",
            "type": "pubkey"
          },
          {
            "name": "devWallet",
            "type": "pubkey"
          },
          {
            "name": "platformWallet",
            "type": "pubkey"
          },
          {
            "name": "devFeeBps",
            "type": "u16"
          },
          {
            "name": "platformFeeBps",
            "type": "u16"
          },
          {
            "name": "sellTaxBps",
            "type": "u16"
          },
          {
            "name": "presalePlatformFeeBps",
            "type": "u16"
          },
          {
            "name": "migrationFeeBps",
            "type": "u16"
          },
          {
            "name": "creatorFeeBps",
            "type": "u16"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          },
          {
            "name": "keeperFeeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "migrationCompleted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "poolType",
            "type": "u8"
          },
          {
            "name": "meteoraPool",
            "type": "pubkey"
          },
          {
            "name": "liquiditySol",
            "type": "u64"
          },
          {
            "name": "liquidityTokens",
            "type": "u64"
          },
          {
            "name": "platformFee",
            "type": "u64"
          },
          {
            "name": "buybackAllocation",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "migrationReady",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "solRaised",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "poolCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "poolType",
            "type": "u8"
          },
          {
            "name": "migrationTarget",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "presaleClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "presaleContribution",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "contributor",
            "type": "pubkey"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "totalRaised",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "presaleMode",
      "docs": [
        "Presale round schedule mode"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "regular"
          },
          {
            "name": "extreme"
          }
        ]
      }
    },
    {
      "name": "presalePool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "docs": [
              "Pool creator"
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "Token mint"
            ],
            "type": "pubkey"
          },
          {
            "name": "migrationTarget",
            "docs": [
              "SOL target for migration (lamports, 100-10000 SOL)"
            ],
            "type": "u64"
          },
          {
            "name": "currentRaised",
            "docs": [
              "Total SOL raised so far (lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "totalTokenSupply",
            "docs": [
              "Total token supply for distribution"
            ],
            "type": "u64"
          },
          {
            "name": "maxBuyBps",
            "docs": [
              "Max contribution per wallet in basis points (100 = 1%)"
            ],
            "type": "u16"
          },
          {
            "name": "creatorPoolBps",
            "docs": [
              "Creator pool percentage in basis points (2000 = 20%)"
            ],
            "type": "u16"
          },
          {
            "name": "endTime",
            "docs": [
              "Presale end time (unix timestamp)"
            ],
            "type": "i64"
          },
          {
            "name": "numContributors",
            "docs": [
              "Number of unique contributors"
            ],
            "type": "u32"
          },
          {
            "name": "presaleMode",
            "docs": [
              "Buyback schedule mode — chosen at pool creation, immutable"
            ],
            "type": {
              "defined": {
                "name": "presaleMode"
              }
            }
          },
          {
            "name": "isMigrated",
            "docs": [
              "Pool has been migrated to Meteora"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "solVaultBump",
            "docs": [
              "SOL vault bump"
            ],
            "type": "u8"
          },
          {
            "name": "tokenVaultBump",
            "docs": [
              "Token vault bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "presaleRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tokensBought",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "creatorFee",
            "type": "u64"
          },
          {
            "name": "platformFee",
            "type": "u64"
          },
          {
            "name": "newPrice",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tokensSold",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "creatorFee",
            "type": "u64"
          },
          {
            "name": "platformFee",
            "type": "u64"
          },
          {
            "name": "sellTax",
            "type": "u64"
          },
          {
            "name": "newPrice",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "updateConfigParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newPauseAuthority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "newDevWallet",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "newPlatformWallet",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "newDevFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "newPlatformFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "newSellTaxBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "newPresalePlatformFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "newMigrationFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "newCreatorFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "newProtocolFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "newKeeperFeeBps",
            "type": {
              "option": "u16"
            }
          }
        ]
      }
    },
    {
      "name": "userPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "docs": [
              "User public key"
            ],
            "type": "pubkey"
          },
          {
            "name": "pool",
            "docs": [
              "Pool this position belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "solContributed",
            "docs": [
              "Total SOL contributed (lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "tokensClaimed",
            "docs": [
              "Whether tokens have been claimed (presale only)"
            ],
            "type": "bool"
          },
          {
            "name": "refundClaimed",
            "docs": [
              "Whether refund has been claimed (presale only)"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
