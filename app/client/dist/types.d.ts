/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/private_matchmaking.json`.
 */
export type PrivateMatchmaking = {
    "address": "sUcFSbEig6ydu7ddNhb1dvRksqmC5eRuLxg77wK4PDz";
    "metadata": {
        "name": "privateMatchmaking";
        "version": "0.1.0";
        "spec": "0.1.0";
    };
    "instructions": [
        {
            "name": "delegateQueue";
            "discriminator": [
                31,
                200,
                139,
                125,
                93,
                239,
                83,
                87
            ];
            "accounts": [
                {
                    "name": "bufferPda";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    98,
                                    117,
                                    102,
                                    102,
                                    101,
                                    114
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "pda";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                12,
                                238,
                                65,
                                178,
                                64,
                                233,
                                105,
                                143,
                                22,
                                60,
                                201,
                                246,
                                107,
                                142,
                                181,
                                17,
                                16,
                                27,
                                40,
                                197,
                                240,
                                53,
                                220,
                                78,
                                120,
                                107,
                                39,
                                143,
                                8,
                                72,
                                154,
                                225
                            ];
                        };
                    };
                },
                {
                    "name": "delegationRecordPda";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
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
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "pda";
                            }
                        ];
                        "program": {
                            "kind": "account";
                            "path": "delegationProgram";
                        };
                    };
                },
                {
                    "name": "delegationMetadataPda";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
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
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "pda";
                            }
                        ];
                        "program": {
                            "kind": "account";
                            "path": "delegationProgram";
                        };
                    };
                },
                {
                    "name": "pda";
                    "writable": true;
                },
                {
                    "name": "payer";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "validator";
                    "optional": true;
                },
                {
                    "name": "ownerProgram";
                    "address": "sUcFSbEig6ydu7ddNhb1dvRksqmC5eRuLxg77wK4PDz";
                },
                {
                    "name": "delegationProgram";
                    "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "accountType";
                    "type": {
                        "defined": {
                            "name": "accountType";
                        };
                    };
                }
            ];
        },
        {
            "name": "initializeQueue";
            "discriminator": [
                174,
                102,
                132,
                232,
                90,
                202,
                27,
                20
            ];
            "accounts": [
                {
                    "name": "queue";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    113,
                                    117,
                                    101,
                                    117,
                                    101
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "authority";
                            }
                        ];
                    };
                },
                {
                    "name": "tenant";
                },
                {
                    "name": "authority";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [];
        },
        {
            "name": "initializeTenant";
            "discriminator": [
                94,
                120,
                34,
                186,
                57,
                167,
                241,
                206
            ];
            "accounts": [
                {
                    "name": "tenant";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    116,
                                    101,
                                    110,
                                    97,
                                    110,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "authority";
                            }
                        ];
                    };
                },
                {
                    "name": "authority";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "tenantProgramId";
                    "type": "pubkey";
                },
                {
                    "name": "eloOffset";
                    "type": "u32";
                },
                {
                    "name": "eloWindow";
                    "type": "u64";
                }
            ];
        },
        {
            "name": "joinQueue";
            "discriminator": [
                157,
                115,
                48,
                109,
                65,
                86,
                203,
                238
            ];
            "accounts": [
                {
                    "name": "queue";
                    "writable": true;
                },
                {
                    "name": "tenant";
                },
                {
                    "name": "playerData";
                    "writable": true;
                },
                {
                    "name": "signer";
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "processMatch";
            "discriminator": [
                139,
                58,
                77,
                101,
                46,
                54,
                202,
                140
            ];
            "accounts": [
                {
                    "name": "queue";
                    "writable": true;
                },
                {
                    "name": "tenant";
                },
                {
                    "name": "authority";
                    "signer": true;
                    "relations": [
                        "tenant"
                    ];
                }
            ];
            "args": [];
        },
        {
            "name": "processUndelegation";
            "discriminator": [
                196,
                28,
                41,
                206,
                48,
                37,
                51,
                167
            ];
            "accounts": [
                {
                    "name": "baseAccount";
                    "writable": true;
                },
                {
                    "name": "buffer";
                },
                {
                    "name": "payer";
                    "writable": true;
                },
                {
                    "name": "systemProgram";
                }
            ];
            "args": [
                {
                    "name": "accountSeeds";
                    "type": {
                        "vec": "bytes";
                    };
                }
            ];
        }
    ];
    "accounts": [
        {
            "name": "queue";
            "discriminator": [
                204,
                167,
                6,
                247,
                20,
                33,
                2,
                188
            ];
        },
        {
            "name": "tenant";
            "discriminator": [
                61,
                43,
                215,
                51,
                232,
                242,
                209,
                170
            ];
        }
    ];
    "errors": [
        {
            "code": 6000;
            "name": "invalidTenant";
            "msg": "Account does not belong to the specified Tenant Program";
        },
        {
            "code": 6001;
            "name": "dataTooSmall";
            "msg": "Account data too small for ELO read";
        },
        {
            "code": 6002;
            "name": "unauthorized";
            "msg": "Unauthorized access";
        }
    ];
    "types": [
        {
            "name": "accountType";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "queue";
                        "fields": [
                            {
                                "name": "authority";
                                "type": "pubkey";
                            }
                        ];
                    }
                ];
            };
        },
        {
            "name": "queue";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "tenant";
                        "type": "pubkey";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    },
                    {
                        "name": "entries";
                        "type": {
                            "vec": {
                                "defined": {
                                    "name": "queueEntry";
                                };
                            };
                        };
                    }
                ];
            };
        },
        {
            "name": "queueEntry";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "player";
                        "type": "pubkey";
                    },
                    {
                        "name": "elo";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "tenant";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "tenantProgramId";
                        "type": "pubkey";
                    },
                    {
                        "name": "eloOffset";
                        "type": "u32";
                    },
                    {
                        "name": "eloWindow";
                        "type": "u64";
                    }
                ];
            };
        }
    ];
};
