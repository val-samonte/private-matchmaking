/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/private_matchmaking.json`.
 */
export type PrivateMatchmaking = {
  "address": "GvJ8sk3SAQfCHVAFdFyadFRsMjDojqWzeVteksAbsTJy",
  "metadata": {
    "name": "privateMatchmaking",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "createMockPlayer",
      "discriminator": [
        168,
        23,
        255,
        112,
        93,
        42,
        58,
        223
      ],
      "accounts": [
        {
          "name": "playerAccount",
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
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
      "name": "delegateQueue",
      "discriminator": [
        31,
        200,
        139,
        125,
        93,
        239,
        83,
        87
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
                236,
                134,
                118,
                86,
                123,
                251,
                40,
                83,
                243,
                243,
                47,
                156,
                210,
                187,
                227,
                192,
                41,
                10,
                27,
                114,
                159,
                200,
                43,
                167,
                18,
                212,
                10,
                202,
                114,
                71,
                43,
                74
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
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  117,
                  101,
                  45,
                  104,
                  101,
                  97,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "queueId"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
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
          "address": "GvJ8sk3SAQfCHVAFdFyadFRsMjDojqWzeVteksAbsTJy"
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
          "name": "queueId",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializePage",
      "discriminator": [
        26,
        128,
        8,
        201,
        196,
        58,
        74,
        74
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true
        },
        {
          "name": "page",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "queue"
              },
              {
                "kind": "arg",
                "path": "pageIndex"
              }
            ]
          }
        },
        {
          "name": "authority",
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
          "name": "pageIndex",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeQueue",
      "discriminator": [
        174,
        102,
        132,
        232,
        90,
        202,
        27,
        20
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  117,
                  101,
                  45,
                  104,
                  101,
                  97,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "queueId"
              }
            ]
          }
        },
        {
          "name": "tenantProgramId"
        },
        {
          "name": "authority",
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
          "name": "queueId",
          "type": "string"
        },
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "queueConfig"
            }
          }
        },
        {
          "name": "capacity",
          "type": "u16"
        },
        {
          "name": "pageSize",
          "type": "u8"
        }
      ]
    },
    {
      "name": "joinQueue",
      "discriminator": [
        157,
        115,
        48,
        109,
        65,
        86,
        203,
        238
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true
        },
        {
          "name": "page",
          "writable": true
        },
        {
          "name": "playerStatus",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  117,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "playerGameAccount"
              }
            ]
          }
        },
        {
          "name": "playerAuthority",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerGameAccount",
          "docs": [
            "The account containing ELO data"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "processMatch",
      "discriminator": [
        139,
        58,
        77,
        101,
        46,
        54,
        202,
        140
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true
        },
        {
          "name": "page",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "queue"
              },
              {
                "kind": "arg",
                "path": "pageIndex"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "pageIndex",
          "type": "u64"
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
      "name": "resizeQueue",
      "discriminator": [
        140,
        145,
        226,
        236,
        71,
        103,
        230,
        105
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "queue"
          ]
        }
      ],
      "args": [
        {
          "name": "newCapacity",
          "type": "u16"
        }
      ]
    },
    {
      "name": "unlockPlayer",
      "discriminator": [
        226,
        41,
        76,
        17,
        253,
        9,
        82,
        188
      ],
      "accounts": [
        {
          "name": "queue"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "queue"
          ]
        },
        {
          "name": "playerStatus",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  117,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "playerGameAccount"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true
        },
        {
          "name": "playerGameAccount"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "mockPlayer",
      "discriminator": [
        128,
        205,
        19,
        217,
        238,
        150,
        18,
        255
      ]
    },
    {
      "name": "playerStatus",
      "discriminator": [
        28,
        122,
        125,
        124,
        167,
        143,
        216,
        176
      ]
    },
    {
      "name": "queueHead",
      "discriminator": [
        252,
        245,
        9,
        149,
        18,
        35,
        210,
        142
      ]
    },
    {
      "name": "queuePage",
      "discriminator": [
        44,
        9,
        254,
        108,
        121,
        225,
        80,
        69
      ]
    }
  ],
  "events": [
    {
      "name": "matchFound",
      "discriminator": [
        73,
        161,
        70,
        145,
        232,
        249,
        72,
        211
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAccountOwner",
      "msg": "Account owner is invalid"
    },
    {
      "code": 6001,
      "name": "queueFull",
      "msg": "Queue is full"
    },
    {
      "code": 6002,
      "name": "accountTooSmall",
      "msg": "Account data too small for ELO offset"
    },
    {
      "code": 6003,
      "name": "invalidEloType",
      "msg": "Invalid ELO type configuration"
    },
    {
      "code": 6004,
      "name": "indexOutOfBounds",
      "msg": "Page index out of bounds"
    }
  ],
  "types": [
    {
      "name": "matchFound",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "queue",
            "type": "pubkey"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": "pubkey"
          },
          {
            "name": "eloA",
            "type": "u64"
          },
          {
            "name": "eloB",
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
      "name": "mockPlayer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "elo",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "playerEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "account",
            "type": "pubkey"
          },
          {
            "name": "elo",
            "type": "u64"
          },
          {
            "name": "joinedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "playerStatus",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "queue",
            "type": "pubkey"
          },
          {
            "name": "inMatch",
            "type": "bool"
          },
          {
            "name": "joinedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "queueConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "eloOffset",
            "type": "u32"
          },
          {
            "name": "eloType",
            "type": "u8"
          },
          {
            "name": "matchThreshold",
            "type": "u32"
          },
          {
            "name": "searchWindow",
            "type": "u32"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "queueHead",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "tenantProgramId",
            "type": "pubkey"
          },
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "queueConfig"
              }
            }
          },
          {
            "name": "capacity",
            "type": "u16"
          },
          {
            "name": "pageSize",
            "type": "u8"
          },
          {
            "name": "writePageIndex",
            "type": "u64"
          },
          {
            "name": "readPageIndex",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "queuePage",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "players",
            "type": {
              "vec": {
                "defined": {
                  "name": "playerEntry"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
