/**
 * scripts/deploy-local.js — Deploy TandaFactory + TandaPod to local Hardhat node
 *
 * Usage:
 *   1. npx hardhat node           (in one terminal)
 *   2. node scripts/deploy-local.js  (in another)
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { ethers } from 'ethers'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545')

// Hardhat default account #0
const DEPLOYER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const deployer = new ethers.Wallet(DEPLOYER_PK, provider)

console.log(`\n🔗  Network: localhost:8545`)
console.log(`👛  Deployer: ${deployer.address}`)

// ── Load artifacts ────────────────────────────────────────────

function loadArtifact(name) {
  const path = resolve(ROOT, `artifacts/contracts/${name}.sol/${name}.json`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

const factoryArtifact = loadArtifact('TandaFactory')
const podArtifact     = loadArtifact('TandaPod')

// ── Deploy TandaFactory ──────────────────────────────────────

const TREASURY    = deployer.address   // use deployer as treasury for local test
const CREATION_FEE = ethers.parseEther('0.001')  // 0.001 ETH creation fee

console.log('\n🚀  Deploying TandaFactory...')
const FactoryCF  = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, deployer)
const factory    = await FactoryCF.deploy(TREASURY, CREATION_FEE)
await factory.waitForDeployment()
const factoryAddr = await factory.getAddress()
console.log(`✅  TandaFactory: ${factoryAddr}`)

// ── Deploy a sample TandaPod (ETH, 3 members, 7-day cycles) ──

const CONTRIBUTION = ethers.parseEther('0.01')   // 0.01 ETH per member per cycle
const SIZE         = 3
const CYCLE_DAYS   = 7
const POD_ID       = 1

// Wait for factory tx to fully confirm and reset nonce
await new Promise(r => setTimeout(r, 1000))

console.log('\n🚀  Deploying TandaPod (ETH, 3 members, 0.01 ETH/cycle, 7-day cycles)...')
const PodCF = new ethers.ContractFactory(podArtifact.abi, podArtifact.bytecode, deployer)
const pod   = await PodCF.deploy(
  factoryAddr,
  POD_ID,
  ethers.ZeroAddress,  // address(0) = native ETH
  CONTRIBUTION,
  SIZE,
  CYCLE_DAYS,
  TREASURY,
)
await pod.waitForDeployment()
const podAddr = await pod.getAddress()
console.log(`✅  TandaPod:     ${podAddr}`)

// ── Save ABIs ────────────────────────────────────────────────

writeFileSync(
  resolve(ROOT, 'src/contracts/TandaFactory.json'),
  JSON.stringify({ abi: factoryArtifact.abi }, null, 2)
)
writeFileSync(
  resolve(ROOT, 'src/contracts/TandaPod.json'),
  JSON.stringify({ abi: podArtifact.abi }, null, 2)
)
console.log('\n📄  ABIs saved → src/contracts/TandaFactory.json + TandaPod.json')

// ── Update dev.json ───────────────────────────────────────────

const devJsonPath = resolve(ROOT, 'src/contracts/dev.json')
let devConfig = {}
try { devConfig = JSON.parse(readFileSync(devJsonPath, 'utf8')) } catch {}

devConfig.ethereum = devConfig.ethereum ?? {}
devConfig.ethereum.factory  = factoryAddr
devConfig.ethereum.tandaPod = podAddr
devConfig.ethereum.chainId  = 31337
devConfig.ethereum.rpc      = 'http://127.0.0.1:8545'

writeFileSync(devJsonPath, JSON.stringify(devConfig, null, 2))
console.log(`📝  Updated src/contracts/dev.json`)

// ── Print test accounts ───────────────────────────────────────

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉  Local deployment complete!

  TandaFactory : ${factoryAddr}
  TandaPod     : ${podAddr}
  Pod ID       : ${POD_ID}
  Contribution : 0.01 ETH  (collateral = 0.02 ETH)
  Members      : 3
  Cycle        : 7 days

📋  Hardhat test accounts (pre-funded with 10000 ETH each):
  #0 (deployer/treasury): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  #1 (member 1):          0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  #2 (member 2):          0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  #3 (member 3):          0x90F79bf6EB2c4f870365E785982E1f101E93b906

  Private keys for MetaMask import:
  #1: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
  #2: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
  #3: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

Add http://127.0.0.1:8545 (Chain ID: 31337) to MetaMask to test.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
