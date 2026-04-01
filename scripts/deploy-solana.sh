#!/bin/bash
set -e

echo "Building Anchor program..."
anchor build

echo "Deploying to devnet..."
anchor deploy --provider.cluster devnet

echo "Getting program ID..."
anchor keys list

echo "Done. Copy the program ID into Anchor.toml and src/contracts/dev.json solana.programId"
