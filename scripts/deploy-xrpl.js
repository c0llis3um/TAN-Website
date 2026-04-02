/**
 * scripts/deploy-xrpl.js — Generate and fund an XRPL escrow account for Tanda pods
 *
 * Usage:
 *   node scripts/deploy-xrpl.js
 *
 * Optional in .env:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  or  VITE_SUPABASE_ANON_KEY
 *
 * What this does:
 *   1. Connects to XRPL Testnet
 *   2. Generates a fresh wallet keypair
 *   3. Funds it via the testnet faucet (100 XRP)
 *   4. Logs the address and seed
 *   5. Optionally saves the address to Supabase platform_settings
 *
 * IMPORTANT: Keep the seed secret. In production encrypt it before storage.
 */

import * as xrpl from 'xrpl'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const TESTNET_WSS = 'wss://s.devnet.rippletest.net:51233'

// ── Connect ───────────────────────────────────────────────────

console.log('\nConnecting to XRPL Testnet...')
const client = new xrpl.Client(TESTNET_WSS)
await client.connect()
console.log('Connected.')

// ── Generate + fund ───────────────────────────────────────────

console.log('\nGenerating new wallet...')
const { wallet, balance } = await client.fundWallet()

console.log('\n========================================')
console.log('  XRPL Escrow Wallet Created')
console.log('========================================')
console.log(`  Address : ${wallet.address}`)
console.log(`  Seed    : ${wallet.seed}`)
console.log(`  Balance : ${balance} XRP (testnet)`)
console.log('========================================')
console.log('\nWARNING: Store the seed securely. Never commit it to version control.')

// ── Verify the account is live ────────────────────────────────

const info = await client.request({
  command:      'account_info',
  account:      wallet.address,
  ledger_index: 'validated',
})
const xrpBalance = Number(info.result.account_data.Balance) / 1_000_000
console.log(`\nVerified on-ledger balance: ${xrpBalance} XRP`)

await client.disconnect()
console.log('Disconnected from XRPL Testnet.')

// ── Save to Supabase ──────────────────────────────────────────

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

if (supabaseUrl && supabaseKey) {
  console.log('\nSaving to Supabase platform_settings...')
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { error } = await supabase
    .from('platform_settings')
    .upsert(
      {
        key:         'xrpl_escrow_account_dev',
        value:       wallet.address,
        description: 'XRPL testnet escrow wallet address for TandaPod payouts (auto-set by deploy-xrpl.js)',
      },
      { onConflict: 'key' }
    )

  if (error) {
    console.warn(`Warning: Could not save to Supabase: ${error.message}`)
    console.warn('The address is shown above — save it manually.')
  } else {
    console.log(`Saved address to Supabase (key: xrpl_escrow_account_dev)`)
    console.warn('NOTE: The seed was NOT saved to Supabase. Store it securely offline.')
  }
} else {
  console.warn('\nNo Supabase credentials found — skipping DB update.')
}

// ── Next steps ────────────────────────────────────────────────

console.log('\n========================================')
console.log('  Next Steps')
console.log('========================================')
console.log('1. Copy the seed above into your .env as XRPL_ESCROW_SEED_DEV')
console.log('   (encrypt it in production before committing)')
console.log('2. Update src/contracts/dev.json:')
console.log(`     "xrpl": { "fulfillmentAccount": "${wallet.address}", ... }`)
console.log('3. Use releaseXrplPayout() in src/lib/xrpl.js to send payouts')
console.log('   from this escrow wallet when a cycle completes.')
console.log('4. For Sprint 4 (multi-sig), replace single-sig with SignerList.')
console.log('========================================\n')
