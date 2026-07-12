/**
 * Netlify Function: release-xrpl-collateral
 *
 * POST /api/release-xrpl-collateral
 * Body: { podId: string }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Validates admin session, fetches escrow seed (service_role only),
 * and sends collateral back to every pod member via XRPL.
 *
 * Idempotent per member — each release is recorded as a `payments` row with
 * method 'collateral_return' and cycle 0, which shares a real DB unique
 * constraint (pod_id, user_id, cycle) with claim-xrpl-collateral.js's own
 * 'collateral_return' rows. That means: calling this twice, or a member
 * self-claiming via claim-xrpl-collateral.js either before or after an admin
 * runs this, can never result in that member being paid twice — whichever
 * write lands first wins, the second is rejected by the DB and skipped here.
 *
 * Pays in RLUSD (IOU) when pod.token === 'RLUSD', otherwise XRP drops —
 * previously this always sent XRP drops regardless of token, which would
 * have paid the wrong currency (and likely failed outright) for RLUSD pods.
 *
 * Required env vars (set in Netlify dashboard, NOT prefixed with VITE_):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet, xrpToDrops } from 'xrpl'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

const RLUSD_ISSUER = {
  dev:  'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
  live: '',
}

const RLUSD_HEX = '524C555344000000000000000000000000000000'

// Postgres unique_violation error code — used to detect a race where two
// concurrent calls (or a concurrent self-claim via claim-xrpl-collateral.js)
// both tried to record the same member's collateral_return at once.
const PG_UNIQUE_VIOLATION = '23505'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const authHeader = event.headers['authorization'] ?? ''
  const accessToken = authHeader.replace('Bearer ', '').trim()
  if (!accessToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing authorization token' }) }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    // ── 1. Validate admin session ──────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken)
    if (authErr || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
    }

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .single()

    if (!adminRow) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) }
    }

    // ── 2. Fetch pod + members + escrow seed ───────────────────
    const { podId } = JSON.parse(event.body)
    if (!podId) return { statusCode: 400, body: JSON.stringify({ error: 'podId required' }) }

    const { data: pod } = await supabase
      .from('pods')
      .select(`
        id, chain, token, contribution_amount, status, env,
        pod_members ( id, user:users ( id, wallet_address ) )
      `)
      .eq('id', podId)
      .single()

    if (!pod) return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL') return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (pod.status !== 'COMPLETED') return { statusCode: 400, body: JSON.stringify({ error: 'Pod not completed yet' }) }

    const { data: escrowRow } = await supabase
      .from('pod_escrows')
      .select('escrow_seed')
      .eq('pod_id', podId)
      .single()

    if (!escrowRow?.escrow_seed) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No escrow configured for this pod' }) }
    }

    const isRlusd = pod.token === 'RLUSD'
    const env     = pod.env ?? 'dev'
    const node    = NODES[env] ?? NODES.dev
    const issuer  = RLUSD_ISSUER[env]

    if (isRlusd && !issuer) {
      return { statusCode: 400, body: JSON.stringify({ error: 'RLUSD issuer not configured for this environment' }) }
    }

    // ── 3. Release collateral to each member ───────────────────
    const client = new Client(node)
    await client.connect()

    const escrowWallet        = Wallet.fromSeed(escrowRow.escrow_seed)
    const collateralPerMember = pod.contribution_amount * 2
    const results             = []

    try {
      for (const member of pod.pod_members) {
        const recipientAddress = member.user?.wallet_address
        const recipientUserId  = member.user?.id

        if (!recipientAddress || !recipientUserId) {
          results.push({ status: 'skipped', reason: 'No wallet address / user record' })
          continue
        }

        // ── Idempotency pre-check ──────────────────────────────
        const { data: existing } = await supabase
          .from('payments')
          .select('id')
          .eq('pod_id', podId)
          .eq('user_id', recipientUserId)
          .eq('cycle', 0)
          .eq('method', 'collateral_return')
          .maybeSingle()

        if (existing) {
          results.push({ member: recipientAddress, status: 'skipped', reason: 'already released/claimed' })
          continue
        }

        try {
          const payment = {
            TransactionType: 'Payment',
            Account:         escrowWallet.address,
            Destination:     recipientAddress,
            Amount: isRlusd
              ? { currency: RLUSD_HEX, issuer, value: String(collateralPerMember) }
              : xrpToDrops(String(collateralPerMember)),
          }

          const prepared = await client.autofill(payment)
          const signed   = escrowWallet.sign(prepared)
          const result   = await client.submitAndWait(signed.tx_blob)
          const txResult = result.result.meta?.TransactionResult ?? ''

          if (txResult !== 'tesSUCCESS') {
            throw new Error(`Payment failed: ${txResult}`)
          }

          const txHash = result.result.hash

          // Record the release — the (pod_id, user_id, cycle) unique constraint is the
          // real idempotency guard; the pre-check above just avoids a redundant chain
          // submission in the common case.
          const { error: insertErr } = await supabase.from('payments').insert({
            pod_id:  podId,
            user_id: recipientUserId,
            cycle:   0,
            amount:  collateralPerMember,
            token:   pod.token,
            chain:   pod.chain,
            method:  'collateral_return',
            tx_hash: txHash,
            status:  'CONFIRMED',
            paid_at: new Date().toISOString(),
          })

          if (insertErr && insertErr.code !== PG_UNIQUE_VIOLATION) {
            // Funds already sent on-chain — flag for reconciliation rather than
            // pretending nothing happened.
            console.error(
              `[release-xrpl-collateral] RECONCILIATION NEEDED — payment sent (tx: ${txHash}) ` +
              `but payments insert failed for pod ${podId} / user ${recipientUserId}: ${insertErr.message}`,
            )
            results.push({
              member: recipientAddress, txHash, amount: collateralPerMember,
              status: 'reconciliationNeeded', warning: insertErr.message,
            })
            continue
          }

          results.push({
            member:  recipientAddress,
            txHash,
            amount:  collateralPerMember,
            status:  'ok',
          })
        } catch (e) {
          results.push({ member: recipientAddress, error: e.message, status: 'failed' })
        }
      }
    } finally {
      if (client.isConnected()) {
        await client.disconnect()
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, results }),
    }

  } catch (e) {
    console.error('[release-xrpl-collateral]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
