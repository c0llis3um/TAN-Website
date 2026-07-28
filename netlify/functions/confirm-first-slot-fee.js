/**
 * Netlify Function: confirm-first-slot-fee
 *
 * POST /.netlify/functions/confirm-first-slot-fee
 * Body: { podId: string }
 *
 * Live-XRPL-only step: verifies the organizer's flat 3 XRP "take the first
 * payout slot" fee landed on the active XRPL treasury wallet, then marks
 * pods.first_slot_fee_paid — which pod-join.js requires (alongside
 * organizer_first_slot) before it will reserve payout_slot 1 for the
 * organizer's own join. Structurally a close mirror of
 * confirm-pod-creation-fee.js, but NOT identical — see the two differences
 * called out below, both needed because this fee is a known fixed amount
 * (unlike the creation fee, a live-price-converted USD figure that
 * deliberately isn't amount-checked).
 *
 * Required env vars (no VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client } from 'xrpl'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

const FIRST_SLOT_FEE_XRP = 3

const RETRY_ATTEMPTS = 2
const RETRY_DELAY_MS = 2000

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function deliveredAmountToNumber(delivered) {
  if (delivered == null) return 0
  if (typeof delivered === 'string') return Number(delivered) / 1_000_000 // XRP drops
  return Number(delivered.value ?? 0)
}

/**
 * Difference #1 from confirm-pod-creation-fee.js: a tx hash already used for
 * EITHER the creation fee OR this fee (on any pod) can't be reused here —
 * without cross-checking creation_fee_tx too, the organizer's own creation-fee
 * payment could be replayed to satisfy this fee for free.
 */
async function isTxHashAlreadyUsed(supabase, txHash) {
  const { count } = await supabase
    .from('pods')
    .select('id', { count: 'exact', head: true })
    .or(`creation_fee_tx.eq.${txHash},first_slot_fee_tx.eq.${txHash}`)
  return (count ?? 0) > 0
}

/**
 * Difference #2: the delivered amount IS checked against the known fixed fee
 * (>= 3 XRP, small epsilon for float noise) — the creation fee skips this
 * deliberately since its amount varies with live XRP price; this fee doesn't.
 */
async function findQualifyingFeePayment(supabase, fromAddress, toAddress, env) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  try {
    const { result } = await client.request({ command: 'account_tx', account: fromAddress, limit: 50 })

    for (const entry of result.transactions ?? []) {
      const tx = entry.tx_json ?? entry.tx
      if (
        tx?.TransactionType !== 'Payment' ||
        tx?.Destination !== toAddress ||
        !entry.validated ||
        entry.meta?.TransactionResult !== 'tesSUCCESS'
      ) continue

      const delivered = entry.meta?.delivered_amount ?? entry.meta?.DeliveredAmount
      if (deliveredAmountToNumber(delivered) < FIRST_SLOT_FEE_XRP - 1e-6) continue

      const candidateHash = entry.hash ?? tx.hash
      if (!candidateHash) continue
      if (await isTxHashAlreadyUsed(supabase, candidateHash)) continue

      return candidateHash
    }
    return null
  } catch {
    return null
  } finally {
    await client.disconnect()
  }
}

async function findQualifyingFeePaymentWithRetries(supabase, fromAddress, toAddress, env) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const found = await findQualifyingFeePayment(supabase, fromAddress, toAddress, env)
    if (found) return found
    if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS)
  }
  return null
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const { podId } = JSON.parse(event.body ?? '{}')
    if (!podId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId is required' }) }
    }

    const { data: pod } = await supabase
      .from('pods')
      .select('id, chain, env, organizer_first_slot, organizer:users!organizer_id(wallet_address)')
      .eq('id', podId)
      .single()

    if (!pod)                          return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL')          return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (pod.env !== 'live')            return { statusCode: 400, body: JSON.stringify({ error: 'First-slot fee only applies to live pods' }) }
    if (!pod.organizer_first_slot)     return { statusCode: 400, body: JSON.stringify({ error: 'This pod did not opt into the first-slot fee' }) }

    const organizerAddr = pod.organizer?.wallet_address
    if (!organizerAddr) return { statusCode: 400, body: JSON.stringify({ error: 'Pod has no organizer wallet on file' }) }

    const { data: treasury } = await supabase
      .from('treasury_wallets')
      .select('address')
      .eq('chain', 'XRPL')
      .eq('active', true)
      .maybeSingle()

    if (!treasury?.address) return { statusCode: 400, body: JSON.stringify({ error: 'No active XRPL treasury wallet configured' }) }

    const foundTxHash = await findQualifyingFeePaymentWithRetries(supabase, organizerAddr, treasury.address, pod.env)
    if (!foundTxHash) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not verify the 3 XRP first-slot fee payment on-chain. If you already paid, it may still be confirming — wait a moment and try again rather than paying twice.' }) }
    }

    const { error: updateErr } = await supabase
      .from('pods')
      .update({ first_slot_fee_paid: true, first_slot_fee_tx: foundTxHash })
      .eq('id', podId)

    if (updateErr) {
      return { statusCode: 500, body: JSON.stringify({ error: `Fee verified but pod update failed: ${updateErr.message}` }) }
    }

    console.log(`[confirm-first-slot-fee] pod ${podId} first-slot fee confirmed | tx: ${foundTxHash}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }

  } catch (e) {
    console.error('[confirm-first-slot-fee]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
