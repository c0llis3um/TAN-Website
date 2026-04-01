/**
 * scripts/deploy.js — Deploy TandaFactory to Sepolia (or any EVM testnet)
 *
 * Usage:
 *   npm run deploy:sepolia
 *
 * Required in .env:
 *   PRIVATE_KEY      — deployer wallet private key (no 0x prefix)
 *   SEPOLIA_RPC_URL  — e.g. https://sepolia.infura.io/v3/YOUR_KEY
 *
 * Optional in .env:
 *   TREASURY_ADDRESS — defaults to deployer wallet
 *   CREATION_FEE     — in USDC units (default: 2000000 = $2)
 *
 * After deploy, src/contracts/dev.json is updated automatically.
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { ethers } from 'ethers'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Validate env ─────────────────────────────────────────────

const {
  PRIVATE_KEY, SEPOLIA_RPC_URL, TREASURY_ADDRESS, CREATION_FEE,
  VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
} = process.env

if (!PRIVATE_KEY)     { console.error('❌  Missing PRIVATE_KEY in .env');     process.exit(1) }
if (!SEPOLIA_RPC_URL) { console.error('❌  Missing SEPOLIA_RPC_URL in .env'); process.exit(1) }

// ── Load compiled artifact ────────────────────────────────────

const artifactPath = resolve(ROOT, 'artifacts/contracts/TandaFactory.sol/TandaFactory.json')
let artifact
try {
  artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
} catch {
  console.error('❌  Artifact not found. Run: npx hardhat compile')
  process.exit(1)
}

// ── Deploy ────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
const deployer  = new ethers.Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`, provider)

const network = await provider.getNetwork()
console.log(`\n🔗  Network: ${network.name} (chainId ${network.chainId})`)
console.log(`👛  Deployer: ${deployer.address}`)

const balance = await provider.getBalance(deployer.address)
console.log(`💰  Balance: ${ethers.formatEther(balance)} ETH\n`)

if (balance === 0n) {
  console.error('❌  Deployer has no ETH. Fund it at https://sepoliafaucet.com')
  process.exit(1)
}

// Sepolia USDC (Circle's test token)
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const treasury     = TREASURY_ADDRESS ?? deployer.address
const creationFee  = CREATION_FEE     ?? '2000000'  // $2 USDC (6 decimals)

console.log(`📋  Config:`)
console.log(`    USDC:         ${SEPOLIA_USDC}`)
console.log(`    Treasury:     ${treasury}`)
console.log(`    Creation fee: ${creationFee} units ($${Number(creationFee) / 1e6})`)
console.log()

const factory    = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer)
console.log('🚀  Deploying TandaFactory...')
const contract   = await factory.deploy(SEPOLIA_USDC, treasury, creationFee)

console.log(`    tx: ${contract.deploymentTransaction()?.hash}`)
console.log('    Waiting for confirmation...')
await contract.waitForDeployment()

const address = await contract.getAddress()
console.log(`\n✅  TandaFactory deployed at: ${address}`)
console.log(`    https://sepolia.etherscan.io/address/${address}\n`)

// ── Save ABI to src/contracts ────────────────────────────────

const abiDest = resolve(ROOT, 'src/contracts/TandaFactory.json')
writeFileSync(abiDest, JSON.stringify({ abi: artifact.abi }, null, 2))
console.log(`📄  ABI saved → src/contracts/TandaFactory.json`)

// ── Update dev.json (local fallback) ─────────────────────────

const devJsonPath = resolve(ROOT, 'src/contracts/dev.json')
const devConfig   = JSON.parse(readFileSync(devJsonPath, 'utf8'))
devConfig.ethereum.factory = address
writeFileSync(devJsonPath, JSON.stringify(devConfig, null, 2))
console.log(`📝  Updated src/contracts/dev.json  (ethereum.factory = ${address})`)

// ── Push address to Supabase platform_settings ───────────────
// All live clients will pick this up automatically without a file change.

const supabaseUrl = VITE_SUPABASE_URL
const supabaseKey = SUPABASE_SERVICE_ROLE_KEY ?? VITE_SUPABASE_ANON_KEY

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { error: dbErr } = await supabase
    .from('platform_settings')
    .upsert(
      { key: 'factory_address_eth_dev', value: address, description: 'TandaFactory address on Sepolia (auto-set by deploy script)' },
      { onConflict: 'key' }
    )
  if (dbErr) {
    console.warn(`⚠️   Could not update Supabase platform_settings: ${dbErr.message}`)
    console.warn('    The address is still saved in dev.json — run the app and it will work.')
  } else {
    console.log(`☁️   Saved to Supabase platform_settings (key: factory_address_eth_dev)`)
  }
} else {
  console.warn('⚠️   No Supabase credentials found — skipping DB update. dev.json is the fallback.')
}

console.log('\n🎉  Done! Restart the dev server and create a tanda.\n')
