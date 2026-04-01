/**
 * contracts.js — EVM contract interactions via ethers v6 + MetaMask
 *
 * Creation fee is paid in native ETH — no token approval or USDC needed.
 * Pod contributions token (ETH / USDC / etc.) is chosen by the organizer
 * and stored in Supabase; on-chain custody handled in TandaPod (Sprint 4).
 */

import { BrowserProvider, Contract, parseUnits, parseEther, formatEther, Interface } from 'ethers'
import { getSetting } from '@/lib/db'
import { sendXrplContribution } from '@/lib/xrpl'
import devContracts  from '@/contracts/dev.json'
import liveContracts from '@/contracts/live.json'

// ── ABIs ─────────────────────────────────────────────────────

const FACTORY_ABI = [
  'function createPod(uint8 size, uint8 payoutMethod, string token, string name) payable returns (uint256)',
  'function getPod(uint256 podId) view returns (tuple(uint256 id, address organizer, uint8 size, uint8 payoutMethod, string token, bool active, uint256 createdAt))',
  'function creationFee() view returns (uint256)',
  'function podCount() view returns (uint256)',
  'event PodCreated(uint256 indexed podId, address indexed organizer, uint8 size, uint8 payoutMethod, string token, uint256 createdAt)',
]

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

// Uniswap V3 QuoterV2 (for price display only — no swap needed for fee)
const QUOTER_V2_ABI = [
  'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]

// Uniswap V3 SwapRouter02 — exactInputSingle (ETH → USDC via WETH)
const SWAP_ROUTER_ABI = [
  'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
]

const UNISWAP = {
  dev:  { router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48', weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', quoter: '0xEd1f6473345F45b75833fd55D191b45f76d90Af' },
  live: { router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e' },
}

// ── Helpers ──────────────────────────────────────────────────

function getConfig(env) {
  return env === 'live' ? liveContracts : devContracts
}

async function resolveFactoryAddress(env) {
  const key    = env === 'live' ? 'factory_address_eth_live' : 'factory_address_eth_dev'
  const fromDB = await getSetting(key)
  if (fromDB) return fromDB
  return getConfig(env).ethereum?.factory ?? ''
}

export async function getProvider() {
  if (!window.ethereum) throw new Error('MetaMask not found. Install it at metamask.io')
  return new BrowserProvider(window.ethereum)
}

export async function getSigner() {
  const provider = await getProvider()
  return provider.getSigner()
}

// ── Network guard ─────────────────────────────────────────────

export async function assertCorrectNetwork(env) {
  const cfg      = getConfig(env)
  const expected = cfg.ethereum?.chainId
  if (!expected) return

  const provider = await getProvider()
  const network  = await provider.getNetwork()

  if (Number(network.chainId) !== expected) {
    const name = cfg.ethereum?.networkName ?? (env === 'live' ? 'Ethereum Mainnet' : 'Hardhat Local')
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${expected.toString(16)}` }],
      })
    } catch {
      throw new Error(`Wrong network. Switch MetaMask to ${name} (chainId ${expected}).`)
    }
  }
}

// ── Token balances ────────────────────────────────────────────

export async function getTokenBalances(env) {
  const cfg      = getConfig(env)
  const usdcAddr = cfg.ethereum?.usdc

  const signer     = await getSigner()
  const walletAddr = await signer.getAddress()
  const ethBalBN   = await signer.provider.getBalance(walletAddr)
  const ethBalance = parseFloat(formatEther(ethBalBN))

  if (!usdcAddr) return { eth: ethBalance, usdc: 0 }

  const usdc = new Contract(usdcAddr, ERC20_ABI, signer)
  const [usdcBN, dec] = await Promise.all([usdc.balanceOf(walletAddr), usdc.decimals()])
  const usdcBalance = Number(usdcBN) / 10 ** Number(dec)

  return { eth: ethBalance, usdc: usdcBalance }
}

// ── ETH price quote (display only) ───────────────────────────

export async function getSwapQuote(amountEth, env) {
  if (!amountEth || amountEth <= 0) return null

  const cfg      = getConfig(env)
  const usdcAddr = cfg.ethereum?.usdc
  const wethAddr = UNISWAP[env]?.weth
  const quoterAddr = UNISWAP[env]?.quoter

  if (!usdcAddr || !wethAddr) return null

  try {
    const provider = await getProvider()
    const quoter   = new Contract(quoterAddr, QUOTER_V2_ABI, provider)
    const amountIn = parseEther(String(Number(amountEth).toFixed(8)))

    const [amountOut] = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: wethAddr, tokenOut: usdcAddr,
      amountIn, fee: 500, sqrtPriceLimitX96: 0n,
    })

    const usdcOut = Number(amountOut) / 1e6
    return { usdcOut, rate: usdcOut / amountEth, isEstimate: false }
  } catch {
    return { usdcOut: amountEth * 2000, rate: 2000, isEstimate: true }
  }
}

// ── Deploy pod on-chain ───────────────────────────────────────

/**
 * @param {string} params.name
 * @param {number} params.size
 * @param {string} params.token          — 'ETH' | 'USDC' | 'USDT' | 'SOL'
 * @param {string} params.payoutMethod   — 'random' | 'fixed' | 'volunteer'
 * @param {string} params.env
 */
export async function deployPodEVM({ name, size, token, payoutMethod, env }) {
  const factoryAddr = await resolveFactoryAddress(env)

  if (!factoryAddr) {
    return simulateDeploy({ name, size, token, payoutMethod })
  }

  await assertCorrectNetwork(env)

  const signer  = await getSigner()
  const factory = new Contract(factoryAddr, FACTORY_ABI, signer)

  // Fee in ETH (wei) — default to 0 if contract not responding
  let fee = 0n
  try { fee = await factory.creationFee() } catch { /* contract not deployed or fee=0 */ }
  const walletAddr = await signer.getAddress()

  // Check ETH balance covers fee + gas buffer
  const ethBal = await signer.provider.getBalance(walletAddr)
  const gasBuffer = parseEther('0.005')
  if (ethBal < fee + gasBuffer) {
    const have = parseFloat(formatEther(ethBal)).toFixed(5)
    const need = parseFloat(formatEther(fee + gasBuffer)).toFixed(5)
    throw new Error(`Insufficient ETH. Need ~${need} ETH (fee + gas), wallet has ${have} ETH.`)
  }

  const methodMap = { random: 0, fixed: 2, volunteer: 2 }
  const methodInt = methodMap[payoutMethod] ?? 0

  const tx      = await factory.createPod(size, methodInt, token, name, { value: fee })
  const receipt = await tx.wait()

  const iface = factory.interface
  let podId   = null
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log)
      if (parsed?.name === 'PodCreated') { podId = parsed.args.podId.toString(); break }
    } catch { /* skip */ }
  }

  return { podId, txHash: receipt.hash, contractAddress: factoryAddr, blockNumber: receipt.blockNumber }
}

// ── Simulation (dev, no factory deployed yet) ─────────────────

async function simulateDeploy({ name, size, token, payoutMethod }) {
  const signer    = await getSigner()
  const payload   = JSON.stringify({ name, size, token, payoutMethod, ts: Date.now() })
  const signature = await signer.signMessage(`DeFi Tanda create pod:\n${payload}`)

  return {
    podId:           null,
    txHash:          signature.slice(0, 66),
    contractAddress: '0x' + signature.slice(2, 42),
    simulated:       true,
  }
}

// ── TandaPod contract interactions ───────────────────────────

const TANDA_POD_ABI = [
  'function joinPod() payable',
  'function contribute(uint256 cycle) payable',
  'function currentCycle() view returns (uint256)',
  'function podStatus() view returns (uint8)',
  'function contributionAmount() view returns (uint256)',
  'function getPayoutRecipient(uint256 cycle) view returns (address)',
]

/**
 * Resolve the TandaPod contract address for a given env.
 * Uses per-pod contract_address if it's a real TandaPod,
 * otherwise falls back to the shared TandaPod from config (dev testing).
 */
function resolveTandaPodAddress(env, podContractAddress) {
  const cfg = getConfig(env)
  const shared = cfg.ethereum?.tandaPod
  // If pod has its own contract address that differs from factory, use it
  const factory = cfg.ethereum?.factory
  if (podContractAddress && podContractAddress !== factory && podContractAddress.length === 42) {
    return podContractAddress
  }
  return shared
}

/**
 * Join a TandaPod on-chain. Sends 2× contributionAmount as collateral.
 */
export async function tandaPodJoin(env, contributionAmount, podContractAddress) {
  const address = resolveTandaPodAddress(env, podContractAddress)
  if (!address) throw new Error('No TandaPod contract configured for this network.')
  await assertCorrectNetwork(env)
  const signer     = await getSigner()
  const contract   = new Contract(address, TANDA_POD_ABI, signer)
  const collateral = parseEther(String(Number(contributionAmount * 2).toFixed(8)))
  const tx         = await contract.joinPod({ value: collateral })
  const receipt    = await tx.wait()
  return { txHash: receipt.hash, contractAddress: address }
}

/**
 * Pay contribution for the current cycle via TandaPod contract.
 * Contract auto-releases pot when all active members have paid.
 * @param {number} currentCycle — DB current_cycle (1-indexed); contract uses 0-indexed
 */
export async function tandaPodContribute(env, currentCycle, contributionAmount, podContractAddress) {
  const address = resolveTandaPodAddress(env, podContractAddress)
  if (!address) throw new Error('No TandaPod contract configured for this network.')
  await assertCorrectNetwork(env)
  const signer   = await getSigner()
  const contract = new Contract(address, TANDA_POD_ABI, signer)
  const amount   = parseEther(String(Number(contributionAmount).toFixed(8)))
  const cycle    = Math.max(0, (currentCycle ?? 1) - 1)   // contract is 0-indexed
  const tx       = await contract.contribute(cycle, { value: amount })
  const receipt  = await tx.wait()
  return { txHash: receipt.hash }
}

// ── Factory admin ─────────────────────────────────────────────

const FACTORY_ADMIN_ABI = [
  'function setTreasury(address _treasury) external',
  'function treasury() view returns (address)',
  'function owner() view returns (address)',
]

/**
 * Update the treasury address on the TandaFactory contract.
 * Caller must be the factory owner.
 */
export async function setFactoryTreasury(newAddress, env) {
  const factoryAddr = await resolveFactoryAddress(env)
  if (!factoryAddr) throw new Error('No factory address configured.')
  await assertCorrectNetwork(env)
  const signer  = await getSigner()
  const factory = new Contract(factoryAddr, FACTORY_ADMIN_ABI, signer)
  const tx      = await factory.setTreasury(newAddress)
  const receipt = await tx.wait()
  return { txHash: receipt.hash }
}

/**
 * Cancel an OPEN TandaPod so members can claim their collateral back.
 */
export async function cancelTandaPod(env, podContractAddress) {
  const address = resolveTandaPodAddress(env, podContractAddress)
  if (!address) throw new Error('No TandaPod contract configured for this network.')
  await assertCorrectNetwork(env)
  const signer   = await getSigner()
  const contract = new Contract(address, TANDA_POD_ABI, signer)
  const tx       = await contract.cancelPod()
  const receipt  = await tx.wait()
  return { txHash: receipt.hash }
}

// ── Solana (Sprint 2) ─────────────────────────────────────────

export async function deployPodSolana() {
  return { podId: null, txHash: null, contractAddress: null, simulated: true }
}

// ── Send contribution to payout recipient ─────────────────────

const ERC20_TRANSFER_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]

/**
 * Send contribution_amount of the pod's token directly to the current
 * cycle's payout recipient wallet. Routes by chain.
 *
 * @param {string} toAddress  — recipient wallet address
 * @param {number} amount     — contribution amount (human-readable, e.g. 3)
 * @param {string} token      — 'ETH' | 'USDC' | 'USDT' | 'SOL' | 'XRP' | 'RLUSD'
 * @param {string} chain      — 'Ethereum' | 'Solana' | 'XRPL'
 * @param {string} env        — 'dev' | 'live'
 * @returns {{ txHash: string }}
 */
export async function sendContribution(toAddress, amount, token, chain, env) {
  // ── XRPL ─────────────────────────────────────────────────────
  if (chain === 'XRPL') {
    return sendXrplContribution(toAddress, amount, token, env)
  }

  // ── Ethereum ──────────────────────────────────────────────────
  await assertCorrectNetwork(env)
  const signer = await getSigner()
  const cfg    = getConfig(env)

  if (token === 'ETH') {
    const tx = await signer.sendTransaction({
      to:    toAddress,
      value: parseEther(String(Number(amount).toFixed(8))),
    })
    const receipt = await tx.wait()
    return { txHash: receipt.hash }
  }

  // ERC-20 (USDC, USDT)
  const tokenAddresses = { USDC: cfg.ethereum?.usdc, USDT: cfg.ethereum?.usdt }
  const tokenAddr = tokenAddresses[token]
  if (!tokenAddr) throw new Error(`Token ${token} not configured for ${env} Ethereum network.`)

  const contract = new Contract(tokenAddr, ERC20_TRANSFER_ABI, signer)
  const decimals = await contract.decimals()
  const amountBN = parseUnits(String(Number(amount).toFixed(Number(decimals))), decimals)

  const tx      = await contract.transfer(toAddress, amountBN)
  const receipt = await tx.wait()
  return { txHash: receipt.hash }
}

// ── Swap ETH → USDC via Uniswap V3 ───────────────────────────

/**
 * Swap native ETH for USDC using Uniswap V3 exactInputSingle.
 * Slippage tolerance: 0.5% (amountOutMinimum = 99.5% of quoted output).
 *
 * @param {number} amountEth  — ETH to send (e.g. 0.01)
 * @param {string} env        — 'dev' | 'live'
 * @returns {{ txHash: string, amountOut: number }}
 */
export async function swapEthForUsdc(amountEth, env) {
  const cfg      = getConfig(env)
  const usdcAddr = cfg.ethereum?.usdc
  const uni      = UNISWAP[env]

  if (!usdcAddr || !uni?.router || !uni?.weth) {
    throw new Error('Swap not supported on this network.')
  }

  await assertCorrectNetwork(env)

  const signer      = await getSigner()
  const walletAddr  = await signer.getAddress()
  const amountIn    = parseEther(String(Number(amountEth).toFixed(8)))

  // Get a quote for minimum out (0.5% slippage)
  const quoter = new Contract(uni.quoter, QUOTER_V2_ABI, signer.provider)
  let amountOutMin = 0n
  try {
    const [quoted] = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: uni.weth, tokenOut: usdcAddr,
      amountIn, fee: 500, sqrtPriceLimitX96: 0n,
    })
    amountOutMin = (quoted * 995n) / 1000n   // 0.5% slippage
  } catch {
    // proceed without minimum (live only — dev is blocked at UI layer)
  }

  const router = new Contract(uni.router, SWAP_ROUTER_ABI, signer)
  const tx = await router.exactInputSingle(
    {
      tokenIn:            uni.weth,
      tokenOut:           usdcAddr,
      fee:                500,
      recipient:          walletAddr,
      amountIn,
      amountOutMinimum:   amountOutMin,
      sqrtPriceLimitX96:  0n,
    },
    { value: amountIn },
  )

  const receipt   = await tx.wait()
  const amountOut = Number(amountOutMin) / 1e6   // approximate; exact parsing requires log decoding

  return { txHash: receipt.hash, amountOut }
}
