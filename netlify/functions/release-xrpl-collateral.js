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
 * Required env vars (set in Netlify dashboard, NOT prefixed with VITE_):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet, xrpToDrops } from 'xrpl'

const NODES = {
  dev:  'wss://s.altnet.rippletest.net:51233',
  live: 'wss://xrplcluster.com',
}

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
        pod_members ( id, user:users ( wallet_address ) )
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

    // ── 3. Release collateral to each member ───────────────────
    const env   = pod.env ?? 'dev'
    const node  = NODES[env] ?? NODES.dev

    const client = new Client(node)
    await client.connect()

    const escrowWallet      = Wallet.fromSeed(escrowRow.escrow_seed)
    const collateralPerMember = pod.contribution_amount * 2
    const results           = []

    for (const member of pod.pod_members) {
      const recipientAddress = member.user?.wallet_address
      if (!recipientAddress) {
        results.push({ status: 'skipped', reason: 'No wallet address' })
        continue
      }

      try {
        const payment = {
          TransactionType: 'Payment',
          Account:         escrowWallet.address,
          Destination:     recipientAddress,
          Amount:          xrpToDrops(String(collateralPerMember)),
        }

        const prepared = await client.autofill(payment)
        const signed   = escrowWallet.sign(prepared)
        const result   = await client.submitAndWait(signed.tx_blob)

        results.push({
          member:  recipientAddress,
          txHash:  result.result.hash,
          amount:  collateralPerMember,
          status:  'ok',
        })
      } catch (e) {
        results.push({ member: recipientAddress, error: e.message, status: 'failed' })
      }
    }

    await client.disconnect()

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
