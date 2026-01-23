/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/anchor_rock_paper_scissor.json`.
 */
export type AnchorRockPaperScissor = {
  "address": "HGddb95QNe62nMU9gB4Ga81PiBxL7ZpeLUtYcXcLWtgR",
  "metadata": {
    "name": "anchorRockPaperScissor",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "createGame",
      "discriminator": [
        124,
        69,
        75,
        66,
        184,
        220,
        72,
        206
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "playerChoice",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  99,
                  104,
                  111,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              },
              {
                "kind": "account",
                "path": "player1"
              }
            ]
          }
        },
        {
          "name": "player1",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createPermission",
      "docs": [
        "Creates a permission based on account type input.",
        "Derives the bump from the account type and seeds, then calls the permission program."
      ],
      "discriminator": [
        190,
        182,
        26,
        164,
        156,
        221,
        8,
        0
      ],
      "accounts": [
        {
          "name": "permissionedAccount"
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        },
        {
          "name": "members",
          "type": {
            "option": {
              "vec": {
                "defined": {
                  "name": "member"
                }
              }
            }
          }
        }
      ]
    },
    {
      "name": "delegatePda",
      "docs": [
        "Delegate account to the delegation program based on account type",
        "Set specific validator based on ER, see https://docs.magicblock.gg/pages/get-started/how-integrate-your-program/local-setup"
      ],
      "discriminator": [
        248,
        217,
        193,
        46,
        124,
        191,
        64,
        135
      ],
      "accounts": [
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                241,
                188,
                31,
                31,
                195,
                40,
                162,
                214,
                12,
                210,
                28,
                74,
                90,
                23,
                213,
                155,
                252,
                227,
                68,
                0,
                190,
                133,
                226,
                232,
                39,
                81,
                172,
                92,
                60,
                231,
                182,
                178
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "HGddb95QNe62nMU9gB4Ga81PiBxL7ZpeLUtYcXcLWtgR"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "initializePlayer",
      "discriminator": [
        79,
        249,
        88,
        177,
        220,
        62,
        56,
        128
      ],
      "accounts": [
        {
          "name": "playerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "elo",
          "type": "u64"
        }
      ]
    },
    {
      "name": "joinGame",
      "discriminator": [
        107,
        112,
        18,
        38,
        56,
        173,
        60,
        128
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "playerChoice",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  99,
                  104,
                  111,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "makeChoice",
      "discriminator": [
        207,
        18,
        251,
        32,
        135,
        122,
        160,
        77
      ],
      "accounts": [
        {
          "name": "playerChoice",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  99,
                  104,
                  111,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        },
        {
          "name": "choice",
          "type": {
            "defined": {
              "name": "choice"
            }
          }
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "revealWinner",
      "discriminator": [
        234,
        209,
        237,
        109,
        16,
        196,
        64,
        254
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player1Profile",
          "docs": [
            "Player1 Profile (for ELO update)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.player1",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player2Profile",
          "docs": [
            "Player2 Profile (for ELO update)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.player2",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player1Choice",
          "docs": [
            "Player1's choice PDA (derived automatically)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  99,
                  104,
                  111,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.player1",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player2Choice",
          "docs": [
            "Player2's choice PDA (derived automatically)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  99,
                  104,
                  111,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.player2",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "permissionGame",
          "writable": true
        },
        {
          "name": "permission1",
          "writable": true
        },
        {
          "name": "permission2",
          "writable": true
        },
        {
          "name": "payer",
          "docs": [
            "Anyone can trigger this"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "game",
      "discriminator": [
        27,
        90,
        166,
        125,
        74,
        100,
        121,
        18
      ]
    },
    {
      "name": "playerChoice",
      "discriminator": [
        116,
        20,
        210,
        159,
        85,
        200,
        132,
        149
      ]
    },
    {
      "name": "playerProfile",
      "discriminator": [
        82,
        226,
        99,
        87,
        164,
        130,
        181,
        80
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "alreadyChose",
      "msg": "You already made your choice."
    },
    {
      "code": 6001,
      "name": "cannotJoinOwnGame",
      "msg": "You cannot join your own game."
    },
    {
      "code": 6002,
      "name": "missingChoice",
      "msg": "Both players must make a choice first."
    },
    {
      "code": 6003,
      "name": "missingOpponent",
      "msg": "Opponent not found."
    },
    {
      "code": 6004,
      "name": "gameFull",
      "msg": "Game is already full."
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "game",
            "fields": [
              {
                "name": "gameId",
                "type": "u64"
              }
            ]
          },
          {
            "name": "playerChoice",
            "fields": [
              {
                "name": "gameId",
                "type": "u64"
              },
              {
                "name": "player",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "playerProfile",
            "fields": [
              {
                "name": "player",
                "type": "pubkey"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "choice",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "rock"
          },
          {
            "name": "paper"
          },
          {
            "name": "scissors"
          }
        ]
      }
    },
    {
      "name": "game",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "player1",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "player2",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "player1Choice",
            "type": {
              "option": {
                "defined": {
                  "name": "choice"
                }
              }
            }
          },
          {
            "name": "player2Choice",
            "type": {
              "option": {
                "defined": {
                  "name": "choice"
                }
              }
            }
          },
          {
            "name": "result",
            "type": {
              "defined": {
                "name": "gameResult"
              }
            }
          }
        ]
      }
    },
    {
      "name": "gameResult",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "winner",
            "fields": [
              "pubkey"
            ]
          },
          {
            "name": "tie"
          },
          {
            "name": "none"
          }
        ]
      }
    },
    {
      "name": "member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "flags",
            "type": "u8"
          },
          {
            "name": "pubkey",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "playerChoice",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "choice",
            "type": {
              "option": {
                "defined": {
                  "name": "choice"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "playerProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "elo",
            "type": "u64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "wins",
            "type": "u64"
          },
          {
            "name": "losses",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
