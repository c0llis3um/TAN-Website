/**
 * xrpl.js — XUMM (Xaman) wallet + XRP/RLUSD transfers
 *
 * Uses the Xumm SDK (npm: xumm) which works on mobile and desktop.
 * Set VITE_XUMM_API_KEY in .env — get one free at apps.xumm.dev
 *
 * RLUSD issuer (testnet): rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV (real Ripple-issued testnet RLUSD)
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
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

// RLUSD issuer addresses
const RLUSD_ISSUER = {
  dev:  'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',  // real XRPL Testnet RLUSD issuer
  live: '',  // fill in when Ripple publishes mainnet RLUSD issuer
}

// XRPL requires non-3-char currency codes as 40-char hex
// "RLUSD" = 52 4C 55 53 44, padded to 20 bytes
const RLUSD_HEX = '524C555344000000000000000000000000000000'

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
      const rlusdLine = lines.result.lines?.find(l => l.currency === RLUSD_HEX || l.currency === 'RLUSD')
      rlusd = rlusdLine ? parseFloat(rlusdLine.balance) : 0
    }
  } catch {
    // No trust line
  }

  await client.disconnect()
  return { xrp, rlusd }
}

// ── Ledger-level verification ───────────────────────────────────
//
// Xaman resolving with `signed: true` only means the user approved the
// transaction in their wallet — it does NOT mean XRPL accepted it. A signed
// payment can still fail on-chain (insufficient balance, no path, bad trust
// line) and Xaman has no way to tell us that. Every send routes through
// verifyXrplPayment() below so callers (join, cycle payments, creation fee)
// only ever see a resolved promise once the ledger has actually confirmed
// tesSUCCESS and the full expected amount was delivered — never on a merely
// signed-but-failed transaction.

function deliveredAmountToNumber(delivered) {
  if (delivered == null) return 0
  if (typeof delivered === 'string') return Number(delivered) / 1_000_000 // XRP drops
  return Number(delivered.value ?? 0) // issued currency
}

/**
 * Polls the ledger for a submitted transaction until it's validated, then
 * confirms it actually succeeded and delivered at least the expected amount.
 * Throws a user-readable error otherwise.
 *
 * @param {string} txHash
 * @param {'dev'|'live'} env
 * @param {{ expectedAmount?: number, timeoutMs?: number }} [opts]
 */
export async function verifyXrplPayment(txHash, env, { expectedAmount, timeoutMs = 20000 } = {}) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  try {
    const start = Date.now()
    let txResult = null

    while (Date.now() - start < timeoutMs) {
      try {
        const resp = await client.request({ command: 'tx', transaction: txHash })
        if (resp.result?.validated) { txResult = resp.result; break }
      } catch {
        // Not found yet — the ledger hasn't caught up to this tx. Keep polling.
      }
      await new Promise((r) => setTimeout(r, 1500))
    }

    if (!txResult) {
      throw new Error('Could not confirm the transaction on-chain in time. Check your wallet before retrying — do not pay twice.')
    }

    const engineResult = txResult.meta?.TransactionResult
    if (engineResult !== 'tesSUCCESS') {
      throw new Error(`Payment failed on-chain: ${engineResult}`)
    }

    if (expectedAmount != null) {
      const delivered = txResult.meta?.delivered_amount ?? txResult.meta?.DeliveredAmount
      const deliveredValue = deliveredAmountToNumber(delivered)
      if (deliveredValue < expectedAmount - 1e-6) {
        throw new Error(`Only ${deliveredValue} of ${expectedAmount} was actually delivered on-chain.`)
      }
    }

    return { ok: true }
  } finally {
    await client.disconnect()
  }
}

function deliveredMatchesToken(delivered, token, env) {
  if (token === 'XRP') return typeof delivered === 'string'
  const issuer = RLUSD_ISSUER[env]
  return !!delivered && typeof delivered === 'object' &&
    delivered.currency === RLUSD_HEX && delivered.issuer === issuer
}

/**
 * Checks whether `fromAddress` already has a confirmed on-ledger payment of
 * at least `expectedAmount` to `toAddress`. Used to make wallet-to-escrow
 * flows (pod join, cycle payment) idempotent: if a previous attempt's
 * payment succeeded on-chain but the app's DB write never ran (closed tab,
 * dropped network, popup blocked mid-flow), a retry should complete the
 * record instead of sending collateral again.
 *
 * @param {string} fromAddress
 * @param {string} toAddress
 * @param {number} expectedAmount
 * @param {'XRP'|'RLUSD'} token
 * @param {'dev'|'live'} env
 */
export async function hasAlreadyPaid(fromAddress, toAddress, expectedAmount, token, env) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  try {
    const { result } = await client.request({
      command: 'account_tx',
      account: fromAddress,
      limit:   50,
    })

    for (const entry of result.transactions ?? []) {
      const tx = entry.tx_json ?? entry.tx
      if (
        tx?.TransactionType === 'Payment' &&
        tx?.Destination === toAddress &&
        entry.validated &&
        entry.meta?.TransactionResult === 'tesSUCCESS'
      ) {
        const delivered = entry.meta?.delivered_amount ?? entry.meta?.DeliveredAmount
        if (!deliveredMatchesToken(delivered, token, env)) continue
        if (deliveredAmountToNumber(delivered) >= expectedAmount - 1e-6) return true
      }
    }
    return false
  } finally {
    await client.disconnect()
  }
}

/**
 * Scans a pod escrow's inbound payment history and flags senders whose total
 * paid-in isn't accounted for by pod membership: either a wallet that sent
 * collateral but never became a member (e.g. a join that succeeded on-chain
 * but whose DB write never landed), or a member who paid in more than their
 * expected collateral.
 *
 * @param {string} escrowAddress
 * @param {'XRP'|'RLUSD'} token
 * @param {'dev'|'live'} env
 * @param {{ address: string, expectedAmount: number }[]} expectedSenders — current
 *   pod members and the collateral each is expected to have sent to this escrow
 * @returns {{ sender: string, totalSent: number, expected: number, excess: number,
 *   reason: 'non_member_payment'|'overpaid_member', sampleTxHash: string }[]}
 */
export async function scanEscrowAnomalies(escrowAddress, token, env, expectedSenders) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  try {
    const { result } = await client.request({
      command: 'account_tx',
      account: escrowAddress,
      limit:   100,
    })

    const totals = new Map() // sender address -> { amount, sampleTxHash }
    for (const entry of result.transactions ?? []) {
      const tx = entry.tx_json ?? entry.tx
      if (
        tx?.TransactionType !== 'Payment' ||
        tx?.Destination !== escrowAddress ||
        !entry.validated ||
        entry.meta?.TransactionResult !== 'tesSUCCESS'
      ) continue

      const delivered = entry.meta?.delivered_amount ?? entry.meta?.DeliveredAmount
      if (!deliveredMatchesToken(delivered, token, env)) continue

      const value = deliveredAmountToNumber(delivered)
      const prev  = totals.get(tx.Account) ?? { amount: 0, sampleTxHash: entry.hash ?? tx.hash }
      totals.set(tx.Account, { amount: prev.amount + value, sampleTxHash: prev.sampleTxHash })
    }

    const expectedMap = new Map(expectedSenders.map(s => [s.address, s.expectedAmount]))
    const anomalies = []

    for (const [sender, { amount, sampleTxHash }] of totals) {
      const expected = expectedMap.get(sender) ?? 0
      if (amount > expected + 1e-6) {
        anomalies.push({
          sender,
          totalSent: Number(amount.toFixed(6)),
          expected,
          excess:    Number((amount - expected).toFixed(6)),
          reason:    expectedMap.has(sender) ? 'overpaid_member' : 'non_member_payment',
          sampleTxHash,
        })
      }
    }
    return anomalies
  } finally {
    await client.disconnect()
  }
}

// ── Send XRP or RLUSD ─────────────────────────────────────────

/**
 * Build a payment transaction, sign it via XUMM, and verify on the ledger
 * that it actually succeeded (see verifyXrplPayment above) before resolving.
 *
 * @param {string} toAddress
 * @param {number} amount
 * @param {'XRP'|'RLUSD'} token
 * @param {'dev'|'live'} env
 * @param {Window|null} [popup] — a window already opened synchronously inside
 *   the triggering click (see callers). Brave/iOS blocks `window.open` once
 *   any `await` has run, so opening fresh here is too late — we navigate the
 *   pre-opened tab instead and only fall back to a fresh `window.open`.
 * @returns {{ txHash: string }}
 */
export async function sendXrplContribution(toAddress, amount, token, env, popup = null) {
  const xumm = getXumm()

  const fromAddress = await getXummAddress()
  if (!fromAddress) {
    popup?.close()
    throw new Error('Connect your Xaman wallet first.')
  }

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
        currency: RLUSD_HEX,
        issuer,
        value:    String(amount),
      },
    }
  } else {
    popup?.close()
    throw new Error(`Token ${token} not supported on XRPL.`)
  }

  // Create payload and open sign URL in a popup so the user always sees it
  const { created, resolved } = await xumm.payload.createAndSubscribe(
    { txjson: payment },
    (event) => {
      if ('signed' in event.data) return event.data
    }
  )

  // Navigate the pre-opened popup to the Xaman sign page — works on mobile
  // (deep link) and desktop (web). Only open a fresh window as a fallback
  // if the caller didn't hand us a live one (e.g. it got blocked anyway).
  const signUrl = created?.next?.always
  if (signUrl) {
    if (popup && !popup.closed) {
      popup.location.href = signUrl
    } else {
      window.open(signUrl, '_blank', 'width=480,height=720,noopener')
    }
  }

  const result = await resolved
  if (!result?.signed) {
    popup?.close()
    throw new Error('Transaction rejected in Xaman.')
  }

  const txHash = result.txid
  // Signed != succeeded — confirm the ledger actually accepted it and
  // delivered the full amount before telling the caller this payment happened.
  await verifyXrplPayment(txHash, env, { expectedAmount: Number(amount) })

  return { txHash }
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
            currency: RLUSD_HEX,
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
