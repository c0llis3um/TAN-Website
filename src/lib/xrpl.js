/**
 * xrpl.js — XUMM (Xaman) wallet + XRP/RLUSD transfers
 *
 * Uses the Xumm SDK (npm: xumm) which works on mobile and desktop.
 * Set VITE_XUMM_API_KEY in .env — get one free at apps.xumm.dev
 *
 * RLUSD issuer (testnet): rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh (placeholder)
 * For mainnet RLUSD issuer contact Ripple.
 */

import * as xrpl from 'xrpl'
import { Client, xrpToDrops } from 'xrpl'
import { Xumm } from 'xumm'

// ── Xumm SDK singleton ────────────────────────────────────────

let _xumm = null

export function getXumm() {
  if (!_xumm) {
    const apiKey = (import.meta.env.VITE_XUMM_API_KEY ?? '').trim()
    if (!apiKey) throw new Error('VITE_XUMM_API_KEY is not set. Add it to Netlify environment variables.')
    // UUID format check: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRe.test(apiKey)) throw new Error(`VITE_XUMM_API_KEY looks invalid (got: "${apiKey.slice(0,8)}…"). Check for extra spaces or quotes in Netlify env vars.`)
    _xumm = new Xumm(apiKey)
  }
  return _xumm
}

const NODES = {
  dev:  'wss://s.altnet.rippletest.net:51233',
  live: 'wss://xrplcluster.com',
}

// RLUSD issuer addresses
const RLUSD_ISSUER = {
  dev:  'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',  // testnet placeholder
  live: '',  // fill in when Ripple publishes mainnet RLUSD issuer
}

// ── Wallet detection ──────────────────────────────────────────

/** Always true — SDK works on mobile and desktop without browser extension */
export function isXummInstalled() {
  return true
}

export async function connectXumm() {
  const xumm = getXumm()
  return new Promise((resolve, reject) => {
    xumm.on('success', async () => {
      try {
        const account = await xumm.user.account
        resolve(account ?? null)
      } catch (e) { reject(e) }
    })
    xumm.on('error', reject)
    xumm.authorize().catch(reject)
  })
}

export async function getXummAddress() {
  try {
    return await getXumm().user.account ?? null
  } catch {
    return null
  }
}

// ── Balances ──────────────────────────────────────────────────

export async function getXrplBalances(walletAddress, env) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  let xrp = 0
  let rlusd = 0

  try {
    const info = await client.request({
      command: 'account_info',
      account: walletAddress,
      ledger_index: 'validated',
    })
    // XRP balance is in drops (1 XRP = 1,000,000 drops), minus 10 XRP reserve
    xrp = (Number(info.result.account_data.Balance) / 1_000_000) - 10
    if (xrp < 0) xrp = 0
  } catch {
    // Account not funded on testnet
  }

  try {
    const issuer = RLUSD_ISSUER[env]
    if (issuer) {
      const lines = await client.request({
        command: 'account_lines',
        account: walletAddress,
        peer: issuer,
      })
      const rlusdLine = lines.result.lines?.find(l => l.currency === 'RLUSD')
      rlusd = rlusdLine ? parseFloat(rlusdLine.balance) : 0
    }
  } catch {
    // No trust line
  }

  await client.disconnect()
  return { xrp, rlusd }
}

// ── Send XRP or RLUSD ─────────────────────────────────────────

/**
 * Build a payment transaction and sign it via XUMM.
 * XUMM returns a SignRequest — the user approves on their phone or extension.
 *
 * @param {string} toAddress
 * @param {number} amount
 * @param {'XRP'|'RLUSD'} token
 * @param {'dev'|'live'} env
 * @returns {{ txHash: string }}
 */
export async function sendXrplContribution(toAddress, amount, token, env) {
  const xumm = getXumm()

  const fromAddress = await getXummAddress()
  if (!fromAddress) throw new Error('Connect your Xaman wallet first.')

  let payment

  if (token === 'XRP') {
    payment = {
      TransactionType: 'Payment',
      Account:         fromAddress,
      Destination:     toAddress,
      Amount:          xrpToDrops(String(amount)),
    }
  } else if (token === 'RLUSD') {
    const issuer = RLUSD_ISSUER[env]
    if (!issuer) throw new Error('RLUSD issuer not configured.')
    payment = {
      TransactionType: 'Payment',
      Account:         fromAddress,
      Destination:     toAddress,
      Amount: {
        currency: 'RLUSD',
        issuer,
        value:    String(amount),
      },
    }
  } else {
    throw new Error(`Token ${token} not supported on XRPL.`)
  }

  // Submit to Xumm SDK — handles QR code on desktop, deep link on mobile
  const { resolved } = await xumm.payload.createAndSubscribe(
    { txjson: payment },
    (event) => {
      if ('signed' in event.data) return event.data
    }
  )

  const result = await resolved
  if (!result?.signed) throw new Error('Transaction rejected in Xaman.')

  return { txHash: result.txid }
}

// ── Pod escrow account management ─────────────────────────────

/**
 * Generate and (on testnet) fund a new XRPL escrow wallet for a pod.
 *
 * In production (env === 'live') this only generates the wallet without
 * attempting to use the testnet faucet — you must fund it manually.
 *
 * @param {string|number} podId           — Pod identifier (for logging only)
 * @param {string}        organizerAddress — Organizer's XRPL address (for logging)
 * @param {'dev'|'live'}  env
 * @returns {{ escrowAddress: string, escrowSeed: string }}
 */
export async function createXrplPodEscrow(podId, organizerAddress, env) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  let wallet
  if (env === 'dev') {
    // Fund via testnet faucet — returns { wallet, balance }
    const result = await client.fundWallet()
    wallet = result.wallet
  } else {
    // Mainnet: generate only — caller must fund externally
    wallet = xrpl.Wallet.generate()
  }

  // NOTE: In a production setup the seed should be encrypted (e.g. with KMS)
  // before persisting. This pilot version stores it as plaintext — replace
  // the storage mechanism before going to mainnet.

  await client.disconnect()

  console.log(`[XRPL] Pod ${podId} escrow created: ${wallet.address}`)
  console.log(`[XRPL] Organizer: ${organizerAddress} | env: ${env}`)

  return {
    escrowAddress: wallet.address,
    escrowSeed:    wallet.seed,
  }
}

/**
 * Send a payment (XRP or RLUSD) from the pod escrow wallet to a recipient.
 *
 * Used when a Tanda cycle completes and the pot must be released to the
 * payout recipient. The escrow wallet is loaded from its seed; in production
 * this seed should be decrypted from secure storage before being passed here.
 *
 * @param {string}        escrowSeed        — Seed of the escrow wallet
 * @param {string}        recipientAddress  — Destination XRPL address
 * @param {number|string} amount            — Human-readable amount (XRP or RLUSD)
 * @param {'XRP'|'RLUSD'} token
 * @param {'dev'|'live'}  env
 * @returns {{ txHash: string }}
 */
export async function releaseXrplPayout(escrowSeed, recipientAddress, amount, token, env) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  const escrowWallet = xrpl.Wallet.fromSeed(escrowSeed)

  const payment = {
    TransactionType: 'Payment',
    Account:         escrowWallet.address,
    Destination:     recipientAddress,
    Amount:
      token === 'XRP'
        ? xrpToDrops(String(amount))
        : {
            currency: 'RLUSD',
            issuer:   RLUSD_ISSUER[env] ?? RLUSD_ISSUER.dev,
            value:    String(amount),
          },
  }

  const prepared = await client.autofill(payment)
  const signed   = escrowWallet.sign(prepared)
  const result   = await client.submitAndWait(signed.tx_blob)

  await client.disconnect()

  const txHash = result.result.hash
  console.log(`[XRPL] Payout released: ${amount} ${token} → ${recipientAddress} | tx: ${txHash}`)

  return { txHash }
}
