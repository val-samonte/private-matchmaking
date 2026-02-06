#!/bin/bash

# Frontend Setup Script for RPS Matchmaking Game
# Run this ONCE to configure the frontend

set -e

echo "🎮 RPS Frontend Setup"
echo "===================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the project root directory"
    exit 1
fi

# Check if queue is initialized
echo "📋 Checking queue status..."
QUEUE_STATUS=$(anchor run check-queue 2>&1 || echo "not_initialized")

if echo "$QUEUE_STATUS" | grep -q "Queue already exists"; then
    echo "✅ Queue is already initialized"
    
    # Extract queue authority from the output
    QUEUE_AUTHORITY=$(echo "$QUEUE_STATUS" | grep "Queue Authority" | awk '{print $NF}')
    echo "   Queue Authority: $QUEUE_AUTHORITY"
else
    echo "⚠️  Queue not initialized. Run: anchor run init-queue"
    exit 1
fi

# Create/update .env.local
echo ""
echo "📝 Updating frontend/.env.local..."

cat > frontend/.env.local << EOF
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_RPS_PROGRAM_ID=8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos
NEXT_PUBLIC_DUEL_PROGRAM_ID=EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X
NEXT_PUBLIC_ER_VALIDATOR=FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA
NEXT_PUBLIC_TEE_RPC_URL=https://tee.magicblock.app
NEXT_PUBLIC_TEE_WS_URL=wss://tee.magicblock.app

# Queue Authority - the wallet address that initialized the matchmaking queue
NEXT_PUBLIC_QUEUE_AUTHORITY=$QUEUE_AUTHORITY
EOF

echo "✅ Environment file updated"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "⚠️  IMPORTANT: Restart your dev server to apply changes:"
echo "   1. Stop the current dev server (Ctrl+C)"
echo "   2. Run: cd frontend && npm run dev -- --webpack"
echo ""
