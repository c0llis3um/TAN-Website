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
 *   ESCROW_SEED_ENCRYPTION_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet } from 'xrpl'
import { decryptSeed } from './lib/crypto.js'
import { sendEscrowPayout } from './lib/escrowPayout.js'

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
        id, chain, token, contribution_amount, collateral_multiplier, status, env, tanda_type, yield_strategy,
        pod_members ( id, user:users ( id, wallet_address ) )
      `)
      .eq('id', podId)
      .single()

    if (!pod) return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL') return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (pod.status !== 'COMPLETED') return { statusCode: 400, body: JSON.stringify({ error: 'Pod not completed yet' }) }

    const { data: escrowRow } = await supabase
      .from('pod_escrows')
      .select('escrow_seed, vault_status')
      .eq('pod_id', podId)
      .single()

    if (!escrowRow?.escrow_seed) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No escrow configured for this pod' }) }
    }

    // Yield/vault pods keep collateral inside an XLS-66d Vault, not liquid in the
    // escrow wallet — releasing before vault-withdraw would fail on-chain
    // (insufficient balance) for every member. Block with a clear message so the
    // admin knows to withdraw from the vault first.
    const isVaultPod = pod.tanda_type === 'yield' && pod.yield_strategy === 'vault'
    if (isVaultPod && escrowRow.vault_status !== 'withdrawn') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Vault must be withdrawn before releasing collateral (current vault status: ${escrowRow.vault_status}).` }),
      }
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

    const escrowWallet        = Wallet.fromSeed(decryptSeed(escrowRow.escrow_seed))
    const fullCollateral      = pod.contribution_amount * pod.collateral_multiplier
    const results             = []

    // Precompute who's still owed collateral, so we know — as we pay each
    // member in the loop below — which one is the last payout in this run.
    // That one needs AccountDelete instead of a plain Payment to reclaim the
    // escrow's own account reserve; see lib/escrowPayout.js for why.
    const { data: allCollateralPayments } = await supabase
      .from('payments')
      .select('user_id, method, amount')
      .eq('pod_id', podId)
      .in('method', ['collateral_return', 'collateral_slash'])

    const stillOwedUserIds = new Set()
    for (const m of pod.pod_members) {
      const uid = m.user?.id
      if (!uid) continue
      const theirPayments = (allCollateralPayments ?? []).filter(p => p.user_id === uid)
      if (theirPayments.some(p => p.method === 'collateral_return')) continue
      const theirSlashed = theirPayments
        .filter(p => p.method === 'collateral_slash')
        .reduce((sum, p) => sum + Number(p.amount), 0)
      if (fullCollateral - theirSlashed > 0) stillOwedUserIds.add(uid)
    }

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

        // Deduct any prior collateral slashes for this member — a defaulted
        // member's collateral was already partially used to cover a missed
        // payment (see claim-xrpl-collateral.js for the same calculation).
        const { data: slashes } = await supabase
          .from('payments')
          .select('amount')
          .eq('pod_id', podId)
          .eq('user_id', recipientUserId)
          .eq('method', 'collateral_slash')

        const alreadySlashed     = (slashes ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
        let collateralPerMember  = Math.max(0, fullCollateral - alreadySlashed)

        if (collateralPerMember <= 0) {
          results.push({ member: recipientAddress, status: 'skipped', reason: 'no collateral remaining — fully used to cover a missed payment' })
          continue
        }

        try {
          stillOwedUserIds.delete(recipientUserId)
          const isFinalClaim = stillOwedUserIds.size === 0

          const sent = await sendEscrowPayout({
            client, escrowWallet, destination: recipientAddress, amount: collateralPerMember, isRlusd, issuer,
            isFinalClaim: isFinalClaim && !isRlusd,
          })
          const txHash = sent.txHash
          collateralPerMember = sent.deliveredAmount

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
