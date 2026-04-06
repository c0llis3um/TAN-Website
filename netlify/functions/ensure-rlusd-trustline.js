/**
 * Netlify Function: ensure-rlusd-trustline
 *
 * POST /.netlify/functions/ensure-rlusd-trustline
 * Body: { podId: string, env: 'dev' | 'live' }
 *
 * Checks whether the pod's escrow wallet already has an RLUSD trust line.
 * If not, submits a TrustSet transaction from the escrow wallet.
 * Safe to call multiple times — no-ops if trust line already exists.
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet } from 'xrpl'

const NODES = {
  dev:  'wss://s.devnet.rippletest.net:51233',
  live: 'wss://xrplcluster.com',
}

const RLUSD_ISSUER = {
  dev:  'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
  live: '',
}

const RLUSD_HEX = '524C555344000000000000000000000000000000'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const { podId, env = 'dev' } = JSON.parse(event.body ?? '{}')
    if (!podId) return { statusCode: 400, body: JSON.stringify({ error: 'podId required' }) }

    const issuer = RLUSD_ISSUER[env]
    if (!issuer) return { statusCode: 400, body: JSON.stringify({ error: 'RLUSD issuer not configured for this environment.' }) }

    // Fetch escrow seed
    const { data: escrow, error: escrowErr } = await supabase
      .from('pod_escrows')
      .select('escrow_seed')
      .eq('pod_id', podId)
      .single()

    if (escrowErr || !escrow) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Escrow not found for this pod.' }) }
    }

    const wallet = Wallet.fromSeed(escrow.escrow_seed)
    const client = new Client(NODES[env] ?? NODES.dev)
    await client.connect()

    // Check if trust line already exists
    let alreadySet = false
    try {
      const lines = await client.request({
        command: 'account_lines',
        account: wallet.address,
        peer:    issuer,
      })
      alreadySet = lines.result.lines?.some(l => l.currency === RLUSD_HEX || l.currency === 'RLUSD')
    } catch {
      // account_lines failed — proceed to set trust line
    }

    if (alreadySet) {
      await client.disconnect()
      console.log(`[ensure-rlusd-trustline] Trust line already exists on ${wallet.address}`)
      return { statusCode: 200, body: JSON.stringify({ ok: true, alreadySet: true }) }
    }

    // Set trust line
    const trustSet = {
      TransactionType: 'TrustSet',
      Account: wallet.address,
      LimitAmount: {
        currency: RLUSD_HEX,
        issuer,
        value:    '1000000000',
      },
    }

    const prepared = await client.autofill(trustSet)
    const signed   = wallet.sign(prepared)
    const result   = await client.submitAndWait(signed.tx_blob)
    await client.disconnect()

    const txResult = result.result.meta.TransactionResult
    console.log(`[ensure-rlusd-trustline] TrustSet on ${wallet.address}: ${txResult}`)

    if (txResult !== 'tesSUCCESS') {
      return { statusCode: 500, body: JSON.stringify({ error: `TrustSet failed: ${txResult}` }) }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, alreadySet: false }) }

  } catch (e) {
    console.error('[ensure-rlusd-trustline]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
