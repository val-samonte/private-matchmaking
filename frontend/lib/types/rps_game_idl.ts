/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rps_game.json`.
 */
export type RpsGame = {
  "address": "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos",
  "metadata": {
    "name": "rpsGame",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "closePlayer",
      "discriminator": [
        225,
        227,
        204,
        63,
        32,
        122,
        58,
        227
      ],
      "accounts": [
        {
          "name": "profile",
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
                  101,
                  95,
                  118,
                  51,
                  53
                ]
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
          "signer": true
        },
        {
          "name": "payer",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "delegatePda",
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
                115,
                248,
                196,
                181,
                159,
                143,
                138,
                238,
                148,
                225,
                132,
                191,
                0,
                72,
                2,
                22,
                197,
                130,
                14,
                154,
                122,
                229,
                203,
                173,
                165,
                128,
                238,
                37,
                164,
                236,
                244,
                250
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
          "writable": true,
          "signer": true
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos"
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
          "name": "profile",
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
                  101,
                  95,
                  118,
                  51,
                  53
                ]
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
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
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
          "name": "gameSession",
          "writable": true
        },
        {
          "name": "player1Profile",
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
                  101,
                  95,
                  118,
                  51,
                  53
                ]
              },
              {
                "kind": "account",
                "path": "game_session.player1",
                "account": "gameSession"
              }
            ]
          }
        },
        {
          "name": "player2Profile",
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
                  101,
                  95,
                  118,
                  51,
                  53
                ]
              },
              {
                "kind": "account",
                "path": "game_session.player2",
                "account": "gameSession"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
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
      "name": "persistResults",
      "discriminator": [
        9,
        175,
        42,
        217,
        2,
        48,
        80,
        81
      ],
      "accounts": [
        {
          "name": "gameSession",
          "writable": true
        },
        {
          "name": "player1Profile",
          "writable": true
        },
        {
          "name": "player2Profile",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
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
      "name": "startGame",
      "discriminator": [
        249,
        47,
        252,
        172,
        184,
        162,
        245,
        14
      ],
      "accounts": [
        {
          "name": "gameSession",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101,
                  95,
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "arg",
                "path": "opponent"
              },
              {
                "kind": "arg",
                "path": "gameId"
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
        },
        {
          "name": "opponent",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "gameSession",
      "discriminator": [
        150,
        116,
        20,
        197,
        205,
        121,
        220,
        240
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
      "msg": "Already chose"
    },
    {
      "code": 6001,
      "name": "invalidPlayer",
      "msg": "Invalid player"
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "playerProfile",
            "fields": [
              {
                "name": "player",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "gameSession",
            "fields": [
              {
                "name": "p1",
                "type": "pubkey"
              },
              {
                "name": "p2",
                "type": "pubkey"
              },
              {
                "name": "id",
                "type": "u64"
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
      "name": "gameSession",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "player1",
            "type": "pubkey"
          },
          {
            "name": "player2",
            "type": "pubkey"
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
      "name": "playerProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "elo",
            "type": "u64"
          },
          {
            "name": "gamesPlayed",
            "type": "u64"
          },
          {
            "name": "gamesWon",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
export const RpsGameIDL: RpsGame = {
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rps_game.json`.
 */
export type RpsGame = {
  "address": "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos",
  "metadata": {
    "name": "rpsGame",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "closePlayer",
      "discriminator": [
        225,
        227,
        204,
        63,
        32,
        122,
        58,
        227
      ],
      "accounts": [
        {
          "name": "profile",
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
                  101,
                  95,
                  118,
                  51,
                  53
                ]
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
          "signer": true
        },
        {
          "name": "payer",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "delegatePda",
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
                115,
                248,
                196,
                181,
                159,
                143,
                138,
                238,
                148,
                225,
                132,
                191,
                0,
                72,
                2,
                22,
                197,
                130,
                14,
                154,
                122,
                229,
                203,
                173,
                165,
                128,
                238,
                37,
                164,
                236,
                244,
                250
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
          "writable": true,
          "signer": true
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos"
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
          "name": "profile",
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
                  101,
                  95,
                  118,
                  51,
                  53
                ]
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
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
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
          "name": "gameSession",
          "writable": true
        },
        {
          "name": "player1Profile",
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
                  101,
                  95,
                  118,
                  51,
                  53
                ]
              },
              {
                "kind": "account",
                "path": "game_session.player1",
                "account": "gameSession"
              }
            ]
          }
        },
        {
          "name": "player2Profile",
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
                  101,
                  95,
                  118,
                  51,
                  53
                ]
              },
              {
                "kind": "account",
                "path": "game_session.player2",
                "account": "gameSession"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
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
      "name": "persistResults",
      "discriminator": [
        9,
        175,
        42,
        217,
        2,
        48,
        80,
        81
      ],
      "accounts": [
        {
          "name": "gameSession",
          "writable": true
        },
        {
          "name": "player1Profile",
          "writable": true
        },
        {
          "name": "player2Profile",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
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
      "name": "startGame",
      "discriminator": [
        249,
        47,
        252,
        172,
        184,
        162,
        245,
        14
      ],
      "accounts": [
        {
          "name": "gameSession",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101,
                  95,
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "arg",
                "path": "opponent"
              },
              {
                "kind": "arg",
                "path": "gameId"
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
        },
        {
          "name": "opponent",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "gameSession",
      "discriminator": [
        150,
        116,
        20,
        197,
        205,
        121,
        220,
        240
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
      "msg": "Already chose"
    },
    {
      "code": 6001,
      "name": "invalidPlayer",
      "msg": "Invalid player"
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "playerProfile",
            "fields": [
              {
                "name": "player",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "gameSession",
            "fields": [
              {
                "name": "p1",
                "type": "pubkey"
              },
              {
                "name": "p2",
                "type": "pubkey"
              },
              {
                "name": "id",
                "type": "u64"
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
      "name": "gameSession",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "player1",
            "type": "pubkey"
          },
          {
            "name": "player2",
            "type": "pubkey"
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
      "name": "playerProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "elo",
            "type": "u64"
          },
          {
            "name": "gamesPlayed",
            "type": "u64"
          },
          {
            "name": "gamesWon",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
export default RpsGameIDL;
