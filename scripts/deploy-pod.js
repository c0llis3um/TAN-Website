/**
 * scripts/deploy-pod.js — Deploy a single TandaPod to Sepolia
 *
 * Usage:
 *   npm run deploy:pod
 *   # or directly:
 *   node scripts/deploy-pod.js
 *
 * Required in .env:
 *   PRIVATE_KEY           — deployer wallet private key (with or without 0x prefix)
 *   SEPOLIA_RPC_URL       — e.g. https://sepolia.infura.io/v3/YOUR_KEY
 *   FACTORY_ADDRESS       — deployed TandaFactory address
 *   POD_ID                — numeric pod ID (should match what the factory assigned)
 *   CONTRIBUTION_AMOUNT   — contribution per cycle in token base units (e.g. 5000000 for $5 USDC)
 *   POD_SIZE              — number of members (2-20)
 *   CYCLE_DAYS            — duration of each cycle in days
 *   TREASURY_ADDRESS      — address that receives protocol fees
 *
 * Optional in .env:
 *   TOKEN_ADDRESS         — ERC-20 token address (default: Sepolia USDC)
 *                           Set to "0x0000000000000000000000000000000000000000" for native ETH.
 *
 * Optional Supabase (to persist the deployed address):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY
 *
 * After deploy:
 *   - ABI saved → src/contracts/TandaPod.json
 *   - dev.json updated (ethereum.tandaPod = <address>)
 *   - Supabase platform_settings updated (key: tanda_pod_address_eth_dev)
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

// ── Sepolia USDC default ─────────────────────────────────────
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

// ── Validate env ─────────────────────────────────────────────

const {
  PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  FACTORY_ADDRESS,
  POD_ID,
  TOKEN_ADDRESS,
  CONTRIBUTION_AMOUNT,
  POD_SIZE,
  CYCLE_DAYS,
  TREASURY_ADDRESS,
  VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env

function requireEnv(name, value) {
  if (!value) {
    console.error(`❌  Missing ${name} in .env`)
    process.exit(1)
  }
  return value
}

requireEnv('PRIVATE_KEY',         PRIVATE_KEY)
requireEnv('SEPOLIA_RPC_URL',     SEPOLIA_RPC_URL)
requireEnv('FACTORY_ADDRESS',     FACTORY_ADDRESS)
requireEnv('POD_ID',              POD_ID)
requireEnv('CONTRIBUTION_AMOUNT', CONTRIBUTION_AMOUNT)
requireEnv('POD_SIZE',            POD_SIZE)
requireEnv('CYCLE_DAYS',          CYCLE_DAYS)
requireEnv('TREASURY_ADDRESS',    TREASURY_ADDRESS)

// ── Resolve params ────────────────────────────────────────────

const tokenAddress        = TOKEN_ADDRESS ?? SEPOLIA_USDC
const podId               = BigInt(POD_ID)
const contributionAmount  = BigInt(CONTRIBUTION_AMOUNT)
const podSize             = Number(POD_SIZE)
const cycleDays           = BigInt(CYCLE_DAYS)
const treasuryAddress     = TREASURY_ADDRESS

if (podSize < 2 || podSize > 20) {
  console.error('❌  POD_SIZE must be between 2 and 20')
  process.exit(1)
}

// ── Load compiled artifact ────────────────────────────────────

const artifactPath = resolve(ROOT, 'artifacts/contracts/TandaPod.sol/TandaPod.json')
let artifact
try {
  artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
} catch {
  console.error('❌  Artifact not found. Run: npx hardhat compile')
  process.exit(1)
}

// ── Provider + Signer ─────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
const key      = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`
const deployer = new ethers.Wallet(key, provider)

const network = await provider.getNetwork()
console.log(`\n🔗  Network: ${network.name} (chainId ${network.chainId})`)
console.log(`👛  Deployer: ${deployer.address}`)

const balance = await provider.getBalance(deployer.address)
console.log(`💰  Balance: ${ethers.formatEther(balance)} ETH\n`)

if (balance === 0n) {
  console.error('❌  Deployer has no ETH. Fund it at https://sepoliafaucet.com')
  process.exit(1)
}

// ── Log config ────────────────────────────────────────────────

const isEth = tokenAddress === ethers.ZeroAddress || tokenAddress === '0x0000000000000000000000000000000000000000'

console.log('📋  Config:')
console.log(`    Factory:             ${FACTORY_ADDRESS}`)
console.log(`    Pod ID:              ${podId}`)
console.log(`    Token:               ${isEth ? 'Native ETH' : tokenAddress}`)
console.log(`    Contribution/cycle:  ${contributionAmount} ${isEth ? 'wei' : 'token units'}`)
console.log(`    Pod size:            ${podSize} members`)
console.log(`    Cycle duration:      ${cycleDays} days`)
console.log(`    Treasury:            ${treasuryAddress}`)
console.log()

// ── Deploy ────────────────────────────────────────────────────

const factory    = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer)
console.log('🚀  Deploying TandaPod...')

const resolvedToken = isEth ? ethers.ZeroAddress : tokenAddress

const contract = await factory.deploy(
  FACTORY_ADDRESS,
  podId,
  resolvedToken,
  contributionAmount,
  podSize,
  cycleDays,
  treasuryAddress,
)

console.log(`    tx: ${contract.deploymentTransaction()?.hash}`)
console.log('    Waiting for confirmation...')
await contract.waitForDeployment()

const address = await contract.getAddress()
console.log(`\n✅  TandaPod deployed at: ${address}`)
console.log(`    https://sepolia.etherscan.io/address/${address}\n`)

// ── Save ABI ─────────────────────────────────────────────────

const abiDest = resolve(ROOT, 'src/contracts/TandaPod.json')
writeFileSync(abiDest, JSON.stringify({ abi: artifact.abi }, null, 2))
console.log('📄  ABI saved → src/contracts/TandaPod.json')

// ── Update dev.json ──────────────────────────────────────────

const devJsonPath = resolve(ROOT, 'src/contracts/dev.json')
const devConfig   = JSON.parse(readFileSync(devJsonPath, 'utf8'))
devConfig.ethereum.tandaPod = address
writeFileSync(devJsonPath, JSON.stringify(devConfig, null, 2))
console.log(`📝  Updated src/contracts/dev.json  (ethereum.tandaPod = ${address})`)

// ── Push address to Supabase ─────────────────────────────────

const supabaseUrl = VITE_SUPABASE_URL
const supabaseKey = SUPABASE_SERVICE_ROLE_KEY ?? VITE_SUPABASE_ANON_KEY

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { error: dbErr } = await supabase
    .from('platform_settings')
    .upsert(
      {
        key:         'tanda_pod_address_eth_dev',
        value:       address,
        description: `TandaPod (podId=${podId}) on Sepolia — auto-set by deploy-pod.js`,
      },
      { onConflict: 'key' }
    )
  if (dbErr) {
    console.warn(`⚠️   Could not update Supabase: ${dbErr.message}`)
    console.warn('    The address is still saved in dev.json.')
  } else {
    console.log('☁️   Saved to Supabase platform_settings (key: tanda_pod_address_eth_dev)')
  }
} else {
  console.warn('⚠️   No Supabase credentials — skipping DB update. dev.json is the fallback.')
}

console.log('\n🎉  Done! Members can now join the pod.\n')
