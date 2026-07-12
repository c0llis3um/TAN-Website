/**
 * Netlify Function: vault-withdraw
 *
 * POST /.netlify/functions/vault-withdraw
 * Body: { podId: string, env: 'dev' | 'live', amount?: string, full?: boolean }
 * Headers: Authorization: Bearer <admin-supabase-jwt>
 *
 * Two modes:
 *   full: true   — Withdraw 100 % of remaining LP shares (pod completion).
 *                  Sets vault_status = 'withdrawn'.
 *   amount: "N"  — Withdraw exactly N RLUSD worth of shares (slash coverage).
 *                  Subtracts proportional shares from vault_shares.
 *
 * After withdrawal the RLUSD lands back in the escrow wallet where existing
 * release-xrpl-collateral / slash-xrpl-collateral functions handle disbursement.
 *
 * Simulation fallback:
 *   If vault_id === 'SIMULATED' the function skips XRPL entirely and only
 *   updates the DB (simulating a ~6 % APY gain on full withdrawals).
 *
 * Required env vars (Netlify dashboard — no VITE_ prefix):
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

// Simulated annual yield rate used in dev mode (6 % APR).
const SIM_ANNUAL_APR = 0.06

/**
 * Calculate simulated yield for a given principal and elapsed time.
 * Returns a decimal string rounded to 6 places.
 */
function simulateYield(principalStr, depositedAt) {
  const principal  = parseFloat(principalStr)
  const elapsed    = Date.now() - new Date(depositedAt).getTime()
  const years      = elapsed / (365.25 * 24 * 60 * 60 * 1000)
  const gained     = principal * SIM_ANNUAL_APR * years
  return (principal + gained).toFixed(6)
}

/**
 * Compute the share amount to redeem for a target RLUSD `amount` withdrawal,
 * given the current `totalShares` and a `totalValue` estimate.
 * All values are strings; returns a string.
 *
 * proportionalShares = totalShares * (amount / totalValue)
 *
 * When totalValue is unknown (no on-chain oracle available in dev), we assume
 * 1 share = 1 RLUSD (conservative — LP never loses principal in a vault).
 */
function sharesForAmount(totalSharesStr, totalValueStr, amountStr) {
  const totalShares = parseFloat(totalSharesStr)
  const totalValue  = parseFloat(totalValueStr) || parseFloat(totalSharesStr) // fallback 1:1
  const amount      = parseFloat(amountStr)
  if (amount >= totalValue) return totalSharesStr // redeem everything
  const ratio = amount / totalValue
  return (totalShares * ratio).toFixed(6)
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const token = (event.headers.authorization ?? '').replace('Bearer ', '').trim()
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  // ── 1. Validate admin session ─────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  // admin_users has no user_id column (only email) — match on email, same as
  // release-xrpl-collateral.js / slash-xrpl-collateral.js. (Matching on user.id here
  // was a bug: that column doesn't exist, so this check always failed closed.)
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (!admin) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) }
  }

  try {
    // ── 2. Parse + validate body ──────────────────────────────────────────
    const { podId, env = 'dev', amount, full = false } = JSON.parse(event.body ?? '{}')

    if (!podId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId required' }) }
    }
    if (!full && !amount) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Provide amount (partial) or full: true' }) }
    }
    if (amount !== undefined && (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'amount must be a positive numeric string' }) }
    }

    // ── 3. Fetch pod + escrow ──────────────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select('id, tanda_type, yield_strategy, token, chain')
      .eq('id', podId)
      .maybeSingle()

    if (!pod) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    }
    if (pod.tanda_type !== 'yield' || pod.yield_strategy !== 'vault') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Pod is not a yield/vault pod' }) }
    }

    const { data: escrowRow } = await supabase
      .from('pod_escrows')
      .select('escrow_seed, vault_id, vault_shares, vault_deposited_at, vault_status')
      .eq('pod_id', podId)
      .maybeSingle()

    if (!escrowRow?.escrow_seed) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No escrow configured for this pod' }) }
    }
    if (escrowRow.vault_status !== 'deposited') {
      return { statusCode: 400, body: JSON.stringify({ error: `Vault is not in deposited state (current: ${escrowRow.vault_status})` }) }
    }
    if (!escrowRow.vault_id || !escrowRow.vault_shares) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Vault ID or shares missing — was vault-deposit called?' }) }
    }

    const vaultId      = escrowRow.vault_id
    const totalShares  = escrowRow.vault_shares
    const depositedAt  = escrowRow.vault_deposited_at

    // ── Claim: atomically move to an in-flight status so a concurrent or
    // duplicate/retried call can't also pass the vault_status === 'deposited' check
    // above and submit its own on-chain transaction (or its own simulated mutation).
    const { data: claimRows, error: claimErr } = await supabase
      .from('pod_escrows')
      .update({ vault_status: 'withdrawing' })
      .eq('pod_id', podId)
      .eq('vault_status', 'deposited')
      .select('pod_id')

    if (claimErr) {
      return { statusCode: 500, body: JSON.stringify({ error: `Failed to claim vault withdrawal: ${claimErr.message}` }) }
    }
    if (!claimRows || claimRows.length === 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'Vault withdrawal cannot proceed — status is not \'deposited\' (a concurrent operation may be in progress, or a previous attempt needs manual reconciliation).',
        }),
      }
    }

    const releaseWithdrawClaim = async () => {
      const { error } = await supabase
        .from('pod_escrows')
        .update({ vault_status: 'deposited' })
        .eq('pod_id', podId)
        .eq('vault_status', 'withdrawing')
      if (error) {
        console.error(`[vault-withdraw] Failed to release 'withdrawing' claim for pod ${podId} — status may be stuck and require manual reconciliation.`, error)
      }
    }

    // ── 4. Simulation path ────────────────────────────────────────────────
    if (vaultId === 'SIMULATED') {
      const simulatedTotal = simulateYield(totalShares, depositedAt)

      let withdrawn
      let newShares
      let newStatus

      if (full) {
        withdrawn  = simulatedTotal
        newShares  = '0'
        newStatus  = 'withdrawn'
      } else {
        // Partial: just subtract the requested amount from shares (1:1 in sim)
        const withdrawAmt = parseFloat(amount)
        const current     = parseFloat(totalShares)
        if (withdrawAmt > current) {
          await releaseWithdrawClaim()
          return { statusCode: 400, body: JSON.stringify({ error: `Requested ${amount} exceeds vault balance ${totalShares}` }) }
        }
        withdrawn  = amount
        newShares  = (current - withdrawAmt).toFixed(6)
        newStatus  = 'deposited'
      }

      const { error: simUpdateErr } = await supabase
        .from('pod_escrows')
        .update({
          vault_shares: newShares,
          vault_status: newStatus,
        })
        .eq('pod_id', podId)

      if (simUpdateErr) {
        // Simulated withdrawal was computed but never persisted — leave vault_status
        // stuck at 'withdrawing' rather than silently returning success. No blind retry.
        console.error(
          `[vault-withdraw] RECONCILIATION NEEDED — simulated withdrawal computed (withdrawn: ${withdrawn}, ` +
          `newShares: ${newShares}) but DB update failed for pod ${podId}: ${simUpdateErr.message}`,
        )
        return {
          statusCode: 200,
          headers:    { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            withdrawn,
            txHash:               null,
            simulated:            true,
            reconciliationNeeded: true,
            warning: `Simulated withdrawal did not persist (${simUpdateErr.message}). ` +
              `pod_escrows.vault_status is stuck at 'withdrawing' for pod ${podId} — manual reconciliation required.`,
          }),
        }
      }

      console.log(`[vault-withdraw] SIMULATED | pod ${podId} | withdrawn: ${withdrawn} RLUSD | full: ${full}`)

      return {
        statusCode: 200,
        headers:    { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawn, txHash: null, simulated: true }),
      }
    }

    // ── 5. Live XRPL path ─────────────────────────────────────────────────
    const issuer       = RLUSD_ISSUER[env]
    if (!issuer) {
      await releaseWithdrawClaim()
      return { statusCode: 400, body: JSON.stringify({ error: 'RLUSD issuer not configured for this environment' }) }
    }

    const escrowWallet = Wallet.fromSeed(escrowRow.escrow_seed)
    const node         = NODES[env] ?? NODES.dev
    const xrplClient   = new Client(node)

    let withdrawSucceededOnChain = false

    try {
      await xrplClient.connect()

      // Determine how many LP shares to redeem
      let sharesToRedeem
      if (full) {
        sharesToRedeem = totalShares
      } else {
        // For a partial withdrawal we redeem proportionally.
        // We use totalShares as a proxy for totalValue (conservative 1:1 assumption).
        sharesToRedeem = sharesForAmount(totalShares, totalShares, amount)
      }

      const vaultWithdrawTx = {
        TransactionType: 'VaultWithdraw',
        Account:         escrowWallet.address,
        VaultID:         vaultId,
        // Amount is in LP shares (MPT amount), not RLUSD
        Amount: {
          mpt_issuance_id: vaultId,   // VaultID doubles as the MPTIssuanceID for LP tokens
          value:           sharesToRedeem,
        },
      }

      const prepared  = await xrplClient.autofill(vaultWithdrawTx)
      const signed    = escrowWallet.sign(prepared)
      const result    = await xrplClient.submitAndWait(signed.tx_blob)
      const txResult  = result.result.meta?.TransactionResult ?? ''

      if (txResult !== 'tesSUCCESS') {
        throw new Error(`VaultWithdraw failed: ${txResult}`)
      }

      // From this point on, funds have moved on-chain — a failure below must not
      // silently release the claim, since a retry would attempt a duplicate withdrawal.
      withdrawSucceededOnChain = true

      const txHash = result.result.hash

      // Determine actual RLUSD received by reading the escrow wallet's balance delta
      // from AffectedNodes (IOU balance change on the escrow account).
      let withdrawn = amount ?? totalShares // conservative fallback
      const rlusdNode = result.result.meta?.AffectedNodes?.find(n => {
        const node = n.ModifiedNode ?? n.CreatedNode
        return (
          node?.LedgerEntryType === 'RippleState' &&
          (node.FinalFields ?? node.NewFields)?.HighLimit?.currency === RLUSD_HEX
        )
      })
      if (rlusdNode) {
        const fields      = rlusdNode.ModifiedNode ?? rlusdNode.CreatedNode
        const finalBal    = parseFloat(fields.FinalFields?.Balance?.value ?? '0')
        const prevBal     = parseFloat(fields.PreviousFields?.Balance?.value ?? '0')
        const delta       = Math.abs(finalBal - prevBal)
        if (delta > 0) withdrawn = delta.toFixed(6)
      }

      // ── 6. Update DB ────────────────────────────────────────────────────
      const remainingShares = full
        ? '0'
        : (parseFloat(totalShares) - parseFloat(sharesToRedeem)).toFixed(6)

      const { error: updateErr } = await supabase
        .from('pod_escrows')
        .update({
          vault_shares: remainingShares,
          vault_status: full ? 'withdrawn' : 'deposited',
        })
        .eq('pod_id', podId)

      if (updateErr) {
        // Transaction is already on-chain and cannot be undone — leave vault_status stuck
        // at 'withdrawing' and tell the caller reconciliation is required rather than
        // silently returning a plain 200 that implies DB state is consistent.
        console.error(
          `[vault-withdraw] RECONCILIATION NEEDED — VaultWithdraw succeeded on-chain (tx: ${txHash}, ` +
          `withdrawn: ${withdrawn}) but DB update failed for pod ${podId}: ${updateErr.message}`,
        )
        return {
          statusCode: 200,
          headers:    { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            withdrawn,
            txHash,
            simulated:            false,
            reconciliationNeeded: true,
            warning: `Withdrawal succeeded on-chain but the database update failed (${updateErr.message}). ` +
              `pod_escrows.vault_status is stuck at 'withdrawing' for pod ${podId} — manual reconciliation required.`,
          }),
        }
      }

      console.log(`[vault-withdraw] Pod ${podId} | tx: ${txHash} | withdrawn: ${withdrawn} RLUSD | full: ${full} | remaining shares: ${remainingShares}`)

      return {
        statusCode: 200,
        headers:    { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawn, txHash, simulated: false }),
      }

    } catch (err) {
      if (!withdrawSucceededOnChain) {
        await releaseWithdrawClaim()
      } else {
        console.error(`[vault-withdraw] Leaving pod ${podId} at vault_status 'withdrawing' — manual reconciliation required (see error above).`)
      }
      throw err
    } finally {
      if (xrplClient.isConnected()) {
        await xrplClient.disconnect()
      }
    }

  } catch (e) {
    console.error('[vault-withdraw]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
