/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/duel.json`.
 */
export type Duel = {
    "address": "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X";
    "metadata": {
        "name": "duel";
        "version": "0.1.0";
        "spec": "0.1.0";
    };
    "instructions": [
        {
            "name": "cancelTicket";
            "discriminator": number[];
            "accounts": [
                {
                    "name": "ticket";
                    "writable": true;
                },
                {
                    "name": "tenant";
                },
                {
                    "name": "player";
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "closeTicket";
            "discriminator": number[];
            "accounts": [
                {
                    "name": "ticket";
                    "writable": true;
                },
                {
                    "name": "tenant";
                },
                {
                    "name": "player";
                    "writable": true;
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "commitTickets";
            "discriminator": number[];
            "accounts": [
                {
                    "name": "tenant";
                },
                {
                    "name": "payer";
                    "writable": true;
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "createTicket";
            "discriminator": number[];
            "accounts": [
                {
                    "name": "ticket";
                    "writable": true;
                },
                {
                    "name": "tenant";
                },
                {
                    "name": "player";
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
            "name": "delegateQueue";
            "discriminator": number[];
            "accounts": [
                {
                    "name": "bufferPda";
                    "writable": true;
                },
                {
                    "name": "delegationRecordPda";
                    "writable": true;
                },
                {
                    "name": "delegationMetadataPda";
                    "writable": true;
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
                },
                {
                    "name": "delegationProgram";
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
            "name": "delegateTicket";
            "discriminator": number[];
            "accounts": [
                {
                    "name": "bufferPda";
                    "writable": true;
                },
                {
                    "name": "delegationRecordPda";
                    "writable": true;
                },
                {
                    "name": "delegationMetadataPda";
                    "writable": true;
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
                },
                {
                    "name": "delegationProgram";
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
            "name": "flushMatches";
            "discriminator": number[];
            "accounts": [
                {
                    "name": "queue";
                    "writable": true;
                },
                {
                    "name": "tenant";
                },
                {
                    "name": "signer";
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "initializeQueue";
            "discriminator": number[];
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
            "discriminator": number[];
            "accounts": [
                {
                    "name": "tenant";
                    "writable": true;
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
                    "name": "eloSize";
                    "type": "u8";
                },
                {
                    "name": "eloWindow";
                    "type": "u64";
                },
                {
                    "name": "callbackProgramId";
                    "type": {
                        "option": "pubkey";
                    };
                },
                {
                    "name": "callbackDiscriminator";
                    "type": {
                        "option": {
                            "array": ["u8", 8];
                        };
                    };
                }
            ];
        },
        {
            "name": "joinQueue";
            "discriminator": number[];
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
                    "name": "playerTicket";
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
            "name": "processUndelegation";
            "discriminator": number[];
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
            "name": "matchTicket";
            "discriminator": number[];
        },
        {
            "name": "queue";
            "discriminator": number[];
        },
        {
            "name": "tenant";
            "discriminator": number[];
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
        },
        {
            "code": 6003;
            "name": "invalidEloSize";
            "msg": "Invalid ELO size (must be 1, 2, 4, or 8 bytes)";
        },
        {
            "code": 6004;
            "name": "invalidTicketStatus";
            "msg": "Invalid ticket status for this operation";
        },
        {
            "code": 6005;
            "name": "invalidTicketAccount";
            "msg": "Invalid ticket account";
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
                    },
                    {
                        "name": "ticket";
                        "fields": [
                            {
                                "name": "player";
                                "type": "pubkey";
                            },
                            {
                                "name": "tenant";
                                "type": "pubkey";
                            }
                        ];
                    }
                ];
            };
        },
        {
            "name": "matchTicket";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "player";
                        "type": "pubkey";
                    },
                    {
                        "name": "tenant";
                        "type": "pubkey";
                    },
                    {
                        "name": "status";
                        "type": {
                            "defined": {
                                "name": "ticketStatus";
                            };
                        };
                    },
                    {
                        "name": "createdAt";
                        "type": "i64";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "pendingMatch";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "player";
                        "type": "pubkey";
                    },
                    {
                        "name": "opponent";
                        "type": "pubkey";
                    },
                    {
                        "name": "matchId";
                        "type": "u64";
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
                        "name": "matchCounter";
                        "type": "u64";
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
                    },
                    {
                        "name": "matches";
                        "type": {
                            "vec": {
                                "defined": {
                                    "name": "matchEntry";
                                };
                            };
                        };
                    },
                    {
                        "name": "pendingMatches";
                        "type": {
                            "vec": {
                                "defined": {
                                    "name": "pendingMatch";
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
            "name": "matchEntry";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "player1";
                        "type": "pubkey";
                    },
                    {
                        "name": "player2";
                        "type": "pubkey";
                    },
                    {
                        "name": "matchId";
                        "type": "u64";
                    },
                    {
                        "name": "timestamp";
                        "type": "i64";
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
                        "name": "eloSize";
                        "type": "u8";
                    },
                    {
                        "name": "eloWindow";
                        "type": "u64";
                    },
                    {
                        "name": "callbackProgramId";
                        "type": {
                            "option": "pubkey";
                        };
                    },
                    {
                        "name": "callbackDiscriminator";
                        "type": {
                            "option": {
                                "array": ["u8", 8];
                            };
                        };
                    }
                ];
            };
        },
        {
            "name": "ticketStatus";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "searching";
                    },
                    {
                        "name": "matched";
                        "fields": [
                            {
                                "name": "opponent";
                                "type": "pubkey";
                            },
                            {
                                "name": "matchId";
                                "type": "u64";
                            }
                        ];
                    },
                    {
                        "name": "expired";
                    },
                    {
                        "name": "cancelled";
                    }
                ];
            };
        }
    ];
};
