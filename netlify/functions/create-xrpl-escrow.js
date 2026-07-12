/**
 * Netlify Function: create-xrpl-escrow
 *
 * POST /.netlify/functions/create-xrpl-escrow
 * Body: { podId: string, env: 'dev' | 'live', token?: string,
 *         tanda_type?: 'standard' | 'yield', yield_strategy?: 'vault' | 'amm' }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Creates a dedicated XRPL escrow wallet for a pod and saves the seed
 * server-side using the service role key (client can never read it).
 * Returns only the escrow address to the caller.
 *
 * For yield/vault pods: also issues a VaultCreate transaction from the
 * escrow wallet so the vault is pre-registered before collateral arrives.
 * If VaultCreate is not supported on this network (devnet), stores
 * vault_id = 'SIMULATED' and continues normally.
 *
 * Required env vars (Netlify dashboard — NO VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet } from 'xrpl'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

const RLUSD_ISSUER = {
  dev:  'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
  live: '',
}

const RLUSD_HEX = '524C555344000000000000000000000000000000'

// Error patterns that indicate XLS-66d VaultCreate is not enabled on this network.
const NOT_ENABLED_PATTERNS = [
  'temUNKNOWN',
  'temDISABLED',
  'tecNO_PERMISSION',
  'not enabled',
  'Unknown transaction type',
]

function isNotEnabledError(err) {
  const msg = String(err?.message ?? err?.data?.error ?? '')
  return NOT_ENABLED_PATTERNS.some(p => msg.includes(p))
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
    const {
      podId,
      env            = 'dev',
      token          = 'XRP',
      tanda_type     = 'standard',
      yield_strategy = null,
    } = JSON.parse(event.body ?? '{}')
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
          currency: RLUSD_HEX,
          issuer,
          value:    '1000000000',
        },
      }
      const prepared = await client.autofill(trustSet)
      const signed   = wallet.sign(prepared)
      const result   = await client.submitAndWait(signed.tx_blob)
      console.log(`[create-xrpl-escrow] RLUSD trust line set on ${wallet.address}: ${result.result.meta.TransactionResult}`)
    }

    // ── 4c. VaultCreate for yield/vault pods ──────────────────
    // Pre-register the vault immediately after wallet creation so the VaultID
    // is stored before any collateral arrives. The escrow wallet is both the
    // vault owner and the sole depositor.
    let vaultId   = null
    let simulated = false

    if (tanda_type === 'yield' && yield_strategy === 'vault') {
      const issuer = RLUSD_ISSUER[env]
      if (!issuer) {
        await client.disconnect()
        return { statusCode: 400, body: JSON.stringify({ error: 'RLUSD issuer not configured for VaultCreate' }) }
      }

      const vaultCreateTx = {
        TransactionType: 'VaultCreate',
        Account:         wallet.address,
        Asset: {
          currency: RLUSD_HEX,
          issuer,
        },
        Flags: 0,
      }

      try {
        const prepared  = await client.autofill(vaultCreateTx)
        const signed    = wallet.sign(prepared)
        const result    = await client.submitAndWait(signed.tx_blob)
        const txResult  = result.result.meta?.TransactionResult ?? ''

        if (txResult !== 'tesSUCCESS') {
          throw new Error(`VaultCreate failed: ${txResult}`)
        }

        const createdVault = result.result.meta?.AffectedNodes?.find(
          n => n.CreatedNode?.LedgerEntryType === 'Vault',
        )
        vaultId = createdVault
          ? (createdVault.CreatedNode.NewFields?.VaultID ?? createdVault.CreatedNode.LedgerIndex)
          : null

        if (!vaultId) throw new Error('VaultCreate: VaultID not found in metadata')

        console.log(`[create-xrpl-escrow] VaultCreate OK — VaultID: ${vaultId} for pod ${podId}`)

      } catch (vaultErr) {
        if (isNotEnabledError(vaultErr)) {
          console.warn(`[create-xrpl-escrow] VaultCreate not enabled on ${env} — using simulation`)
          vaultId   = 'SIMULATED'
          simulated = true
        } else {
          // Non-recoverable vault error — still disconnect before returning
          await client.disconnect()
          throw vaultErr
        }
      }
    }

    await client.disconnect()

    // ── 5. Save seed + vault_id server-side (service_role bypasses RLS) ───
    const insertPayload = {
      pod_id:      podId,
      escrow_seed: wallet.seed,
    }
    if (vaultId) {
      insertPayload.vault_id = vaultId
    }

    const { error: dbErr } = await supabase
      .from('pod_escrows')
      .insert(insertPayload)

    if (dbErr) {
      console.error('[create-xrpl-escrow] DB save failed', dbErr)
      return { statusCode: 500, body: JSON.stringify({ error: `Seed save failed: ${dbErr.message}` }) }
    }

    console.log(`[create-xrpl-escrow] Pod ${podId} escrow: ${wallet.address} (${env})${vaultId ? ` | vault: ${vaultId}` : ''}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        escrowAddress: wallet.address,
        ...(vaultId ? { vaultId, vaultSimulated: simulated } : {}),
      }),
    }

  } catch (e) {
    console.error('[create-xrpl-escrow]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
