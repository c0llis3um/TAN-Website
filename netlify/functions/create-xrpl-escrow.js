/**
 * Netlify Function: create-xrpl-escrow
 *
 * POST /.netlify/functions/create-xrpl-escrow
 * Body: { podId: string, env: 'dev' | 'live' }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Creates a dedicated XRPL escrow wallet for a pod and saves the seed
 * server-side using the service role key (client can never read it).
 * Returns only the escrow address to the caller.
 *
 * Required env vars (Netlify dashboard — NO VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    // ── 1. Parse body ──────────────────────────────────────────
    const { podId, env = 'dev', token = 'XRP' } = JSON.parse(event.body ?? '{}')
    if (!podId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId required' }) }
    }

    // ── 2. Verify the pod exists (prevents random escrow creation) ─
    const { data: pod } = await supabase
      .from('pods')
      .select('id')
      .eq('id', podId)
      .maybeSingle()

    if (!pod) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    }

    // ── 3. Make sure this pod doesn't already have an escrow ───
    const { data: existing } = await supabase
      .from('pod_escrows')
      .select('pod_id')
      .eq('pod_id', podId)
      .maybeSingle()

    if (existing) {
      // Escrow already exists — fetch and return address from pod record
      const { data: pod } = await supabase
        .from('pods')
        .select('contract_address')
        .eq('id', podId)
        .single()
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escrowAddress: pod?.contract_address }),
      }
    }

    // ── 4. Create XRPL wallet ──────────────────────────────────
    const node   = NODES[env] ?? NODES.dev
    const client = new Client(node)
    await client.connect()

    let wallet
    if (env === 'dev') {
      // Fund via testnet faucet
      const result = await client.fundWallet()
      wallet = result.wallet
    } else {
      // Mainnet: generate only — organizer funds externally
      wallet = Wallet.generate()
    }

    // ── 4b. Set RLUSD trust line on escrow wallet if needed ────
    if (token === 'RLUSD') {
      const issuer = RLUSD_ISSUER[env]
      if (!issuer) throw new Error('RLUSD issuer not configured for this environment.')

      const trustSet = {
        TransactionType: 'TrustSet',
        Account: wallet.address,
        LimitAmount: {
          currency: 'RLUSD',
          issuer,
          value:    '1000000000',
        },
      }
      const prepared = await client.autofill(trustSet)
      const signed   = wallet.sign(prepared)
      const result   = await client.submitAndWait(signed.tx_blob)
      console.log(`[create-xrpl-escrow] RLUSD trust line set on ${wallet.address}: ${result.result.meta.TransactionResult}`)
    }

    await client.disconnect()

    // ── 5. Save seed server-side (service_role bypasses RLS) ───
    const { error: dbErr } = await supabase
      .from('pod_escrows')
      .insert({ pod_id: podId, escrow_seed: wallet.seed })

    if (dbErr) {
      console.error('[create-xrpl-escrow] DB save failed', dbErr)
      return { statusCode: 500, body: JSON.stringify({ error: `Seed save failed: ${dbErr.message}` }) }
    }

    console.log(`[create-xrpl-escrow] Pod ${podId} escrow: ${wallet.address} (${env})`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escrowAddress: wallet.address }),
    }

  } catch (e) {
    console.error('[create-xrpl-escrow]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
