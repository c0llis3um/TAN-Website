/**
 * lib/vaultWithdraw.js
 *
 * Automatically empties a yield/vault pod's vault back into its escrow
 * wallet the moment the pod completes, so members can self-claim their
 * collateral right away via claim-xrpl-collateral.js instead of waiting on
 * an admin to notice and click the manual "Withdraw from Vault" button.
 *
 * Safe to call unconditionally after any pod is marked COMPLETED, for any
 * chain/tanda_type — no-ops (returns { skipped: true }) for standard pods,
 * non-XRPL pods, and pods whose vault isn't in 'deposited' state (already
 * withdrawn, never deposited, or a concurrent operation in flight).
 *
 * Deliberately never throws — this runs as a side effect of cycle-advance
 * logic that has already committed the pod's COMPLETED status; a vault
 * failure here must not undo or block that. On failure it leaves
 * vault_status at 'withdrawing' and logs loudly for manual reconciliation,
 * same convention as vault-withdraw.js's own HTTP-triggered path.
 */

import { Client, Wallet } from 'xrpl'
import { decryptSeed } from './crypto.js'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

const RLUSD_ISSUER = {
  dev:  'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
  live: '',
}

const RLUSD_HEX = '524C555344000000000000000000000000000000'

// Simulated annual yield rate used in dev mode (6% APR) — matches vault-withdraw.js.
const SIM_ANNUAL_APR = 0.06

function simulateYield(principalStr, depositedAt) {
  const principal = parseFloat(principalStr)
  const elapsed    = Date.now() - new Date(depositedAt).getTime()
  const years      = elapsed / (365.25 * 24 * 60 * 60 * 1000)
  const gained     = principal * SIM_ANNUAL_APR * years
  return (principal + gained).toFixed(6)
}

export async function autoWithdrawVaultIfNeeded({ supabase, podId }) {
  const { data: pod } = await supabase
    .from('pods')
    .select('id, tanda_type, yield_strategy, chain, env')
    .eq('id', podId)
    .maybeSingle()

  if (!pod || pod.tanda_type !== 'yield' || pod.yield_strategy !== 'vault' || pod.chain !== 'XRPL') {
    return { skipped: true, reason: 'not an XRPL yield/vault pod' }
  }

  const { data: escrowRow } = await supabase
    .from('pod_escrows')
    .select('escrow_seed, vault_id, vault_shares, vault_deposited_at, vault_status')
    .eq('pod_id', podId)
    .maybeSingle()

  if (!escrowRow?.escrow_seed || escrowRow.vault_status !== 'deposited') {
    return { skipped: true, reason: `vault_status is '${escrowRow?.vault_status}', not 'deposited'` }
  }

  // Claim: atomically move to an in-flight status so this can never run twice
  // concurrently for the same pod (e.g. pod-record-payment.js and
  // check-overdue.js both observing completion around the same time).
  const { data: claimRows } = await supabase
    .from('pod_escrows')
    .update({ vault_status: 'withdrawing' })
    .eq('pod_id', podId)
    .eq('vault_status', 'deposited')
    .select('pod_id')

  if (!claimRows || claimRows.length === 0) {
    return { skipped: true, reason: 'concurrent withdrawal already in progress' }
  }

  const vaultId     = escrowRow.vault_id
  const totalShares = escrowRow.vault_shares
  const env         = pod.env ?? 'dev'

  try {
    if (vaultId === 'SIMULATED') {
      const withdrawn = simulateYield(totalShares, escrowRow.vault_deposited_at)
      await supabase.from('pod_escrows').update({ vault_shares: '0', vault_status: 'withdrawn' }).eq('pod_id', podId)
      console.log(`[auto-vault-withdraw] SIMULATED | pod ${podId} | withdrawn: ${withdrawn} RLUSD`)
      return { withdrawn, simulated: true, txHash: null }
    }

    const issuer = RLUSD_ISSUER[env]
    if (!issuer) throw new Error('RLUSD issuer not configured for this environment')

    const escrowWallet = Wallet.fromSeed(decryptSeed(escrowRow.escrow_seed))
    const client        = new Client(NODES[env] ?? NODES.dev)
    await client.connect()

    try {
      const vaultWithdrawTx = {
        TransactionType: 'VaultWithdraw',
        Account:         escrowWallet.address,
        VaultID:         vaultId,
        Amount: {
          mpt_issuance_id: vaultId,
          value:           totalShares,
        },
      }

      const prepared = await client.autofill(vaultWithdrawTx)
      const signed   = escrowWallet.sign(prepared)
      const result   = await client.submitAndWait(signed.tx_blob)
      const txResult = result.result.meta?.TransactionResult ?? ''

      if (txResult !== 'tesSUCCESS') {
        throw new Error(`VaultWithdraw failed: ${txResult}`)
      }

      const txHash = result.result.hash
      await supabase.from('pod_escrows').update({ vault_shares: '0', vault_status: 'withdrawn' }).eq('pod_id', podId)
      console.log(`[auto-vault-withdraw] pod ${podId} | tx: ${txHash} | withdrawn: ${totalShares} RLUSD`)
      return { withdrawn: totalShares, simulated: false, txHash }
    } finally {
      if (client.isConnected()) await client.disconnect()
    }
  } catch (err) {
    console.error(`[auto-vault-withdraw] FAILED for pod ${podId} — leaving vault_status 'withdrawing' for manual reconciliation via the admin panel:`, err.message)
    return { error: err.message, reconciliationNeeded: true }
  }
}
