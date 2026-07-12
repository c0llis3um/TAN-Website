/**
 * Netlify Function: vault-deposit
 *
 * POST /.netlify/functions/vault-deposit
 * Body: { podId: string, env: 'dev' | 'live' }
 * Headers: Authorization: Bearer <supabase_access_token>  (admin only)
 *
 * Moves the full RLUSD balance of the pod's escrow wallet into an XLS-66d Vault.
 * Called once when the pod transitions to LOCKED (all members have deposited collateral).
 *
 * Flow:
 *   1. Validate admin session
 *   2. Fetch pod (must be yield/vault) + escrow row
 *   3. Read RLUSD balance of escrow wallet on-ledger
 *   4. If vault_id is null: submit VaultCreate (escrow wallet as owner)
 *   5. Submit VaultDeposit of full RLUSD balance
 *   6. Persist vault_id, vault_shares, vault_deposited_at, vault_status
 *
 * Dev-mode fallback:
 *   If VaultCreate or VaultDeposit returns tecNO_PERMISSION / temUNKNOWN /
 *   any "not enabled" error, the function simulates the deposit:
 *     vault_id     = 'SIMULATED'
 *     vault_shares = <rlusd balance as string>
 *   This lets the full UI/backend flow work on devnet before XLS-66d ships.
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

// 40-char hex currency code for RLUSD
const RLUSD_HEX = '524C555344000000000000000000000000000000'

// Minimum XRP drops to keep in the escrow wallet to cover future transaction fees.
// 12 drops × 10 transactions is a comfortable reserve; the wallet was funded with 10 XRP.
const XRP_FEE_RESERVE_DROPS = BigInt(120)

// Error codes/strings that indicate XLS-66d is not enabled on this network.
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

/**
 * Read the RLUSD IOU balance of `address` from the ledger.
 * Returns a decimal string ("0" if no trust line or zero balance).
 */
async function getRlusdBalance(client, address, issuer) {
  try {
    const resp = await client.request({
      command:       'account_lines',
      account:       address,
      peer:          issuer,
      ledger_index:  'validated',
    })
    const line = resp.result.lines.find(
      l => l.currency === RLUSD_HEX && l.account === issuer,
    )
    return line?.balance ?? '0'
  } catch {
    return '0'
  }
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
    // ── 2. Parse body ─────────────────────────────────────────────────────
    const { podId, env = 'dev' } = JSON.parse(event.body ?? '{}')
    if (!podId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId required' }) }
    }

    const node = NODES[env] ?? NODES.dev

    // ── 3. Fetch pod ──────────────────────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select('id, tanda_type, yield_strategy, token, contribution_amount, size, status, chain')
      .eq('id', podId)
      .maybeSingle()

    if (!pod) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    }
    if (pod.tanda_type !== 'yield' || pod.yield_strategy !== 'vault') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Pod is not a yield/vault pod' }) }
    }
    if (pod.chain !== 'XRPL') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    }

    // ── 4. Fetch escrow row ───────────────────────────────────────────────
    const { data: escrowRow } = await supabase
      .from('pod_escrows')
      .select('escrow_seed, vault_id, vault_status')
      .eq('pod_id', podId)
      .maybeSingle()

    if (!escrowRow?.escrow_seed) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No escrow configured for this pod' }) }
    }
    if (escrowRow.vault_status === 'deposited') {
      return { statusCode: 409, body: JSON.stringify({ error: 'Vault deposit already completed for this pod' }) }
    }

    const escrowWallet = Wallet.fromSeed(escrowRow.escrow_seed)
    const issuer       = RLUSD_ISSUER[env]
    if (!issuer) {
      return { statusCode: 400, body: JSON.stringify({ error: 'RLUSD issuer not configured for this environment' }) }
    }

    // ── 4b. Claim: atomically move to an in-flight status so a concurrent or
    // duplicate/retried call can't also pass the vault_status checks above and
    // submit its own on-chain transactions. Only proceeds from 'none'.
    const { data: claimRows, error: claimErr } = await supabase
      .from('pod_escrows')
      .update({ vault_status: 'depositing' })
      .eq('pod_id', podId)
      .eq('vault_status', 'none')
      .select('pod_id')

    if (claimErr) {
      return { statusCode: 500, body: JSON.stringify({ error: `Failed to claim vault deposit: ${claimErr.message}` }) }
    }
    if (!claimRows || claimRows.length === 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: `Vault deposit cannot proceed — status is '${escrowRow.vault_status}', expected 'none'. If a previous attempt crashed mid-flight this pod needs manual reconciliation before retrying.`,
        }),
      }
    }

    const releaseDepositClaim = async () => {
      const { error } = await supabase
        .from('pod_escrows')
        .update({ vault_status: 'none' })
        .eq('pod_id', podId)
        .eq('vault_status', 'depositing')
      if (error) {
        console.error(`[vault-deposit] Failed to release 'depositing' claim for pod ${podId} — status may be stuck and require manual reconciliation.`, error)
      }
    }

    // ── 5. Connect + read RLUSD balance ───────────────────────────────────
    const xrplClient = new Client(node)

    let simulated = false
    let vaultId   = escrowRow.vault_id  // may already exist if VaultCreate ran earlier
    let sharesDeposited
    let depositTxHash = null
    // True only when VaultCreate succeeded on-chain but we failed to persist the
    // resulting vault_id — in that state a blind retry would create a duplicate vault,
    // so we must NOT release the claim and must surface the real vaultId to the caller.
    let vaultCreatedButUnpersisted = false

    try {
      await xrplClient.connect()

      const rlusdBalance = await getRlusdBalance(xrplClient, escrowWallet.address, issuer)
      const balanceNum   = parseFloat(rlusdBalance)

      if (balanceNum <= 0) {
        await releaseDepositClaim()
        return { statusCode: 400, body: JSON.stringify({ error: 'Escrow wallet has no RLUSD balance to deposit' }) }
      }

      // ── 6. VaultCreate (if vault not yet registered) ─────────────────
      if (!vaultId) {
        const vaultCreateTx = {
          TransactionType: 'VaultCreate',
          Account:         escrowWallet.address,
          // Asset is the RLUSD IOU this vault will hold
          Asset: {
            currency: RLUSD_HEX,
            issuer,
          },
          // Data field is optional; omit to keep the vault minimal
          Flags: 0,
        }

        try {
          const prepared  = await xrplClient.autofill(vaultCreateTx)
          const signed    = escrowWallet.sign(prepared)
          const result    = await xrplClient.submitAndWait(signed.tx_blob)
          const txResult  = result.result.meta?.TransactionResult ?? ''

          if (txResult !== 'tesSUCCESS') {
            throw new Error(`VaultCreate failed: ${txResult}`)
          }

          // The VaultID is emitted in the CreatedNode of type Vault
          const createdVault = result.result.meta?.AffectedNodes?.find(
            n => n.CreatedNode?.LedgerEntryType === 'Vault',
          )
          if (!createdVault) {
            throw new Error('VaultCreate succeeded but VaultID not found in metadata')
          }
          vaultId = createdVault.CreatedNode.NewFields?.VaultID
            ?? createdVault.CreatedNode.LedgerIndex  // fallback: ledger index is the vault ID

          console.log(`[vault-deposit] VaultCreate OK — VaultID: ${vaultId}`)

          // Persist vault_id immediately so we don't recreate on retry
          const { error: vaultIdPersistErr } = await supabase
            .from('pod_escrows')
            .update({ vault_id: vaultId })
            .eq('pod_id', podId)

          if (vaultIdPersistErr) {
            vaultCreatedButUnpersisted = true
            throw new Error(
              `VaultCreate succeeded on-chain (VaultID: ${vaultId}) but persisting vault_id to the ` +
              `database failed: ${vaultIdPersistErr.message}. Do not retry automatically — a retry would ` +
              `attempt to create a duplicate vault. Manual reconciliation required for pod ${podId}.`
            )
          }

        } catch (vaultCreateErr) {
          if (!vaultCreatedButUnpersisted && isNotEnabledError(vaultCreateErr)) {
            console.warn('[vault-deposit] VaultCreate not enabled — falling back to simulation')
            simulated = true
            vaultId   = 'SIMULATED'
          } else {
            throw vaultCreateErr
          }
        }
      }

      // ── 7. VaultDeposit ───────────────────────────────────────────────
      if (!simulated) {
        const vaultDepositTx = {
          TransactionType: 'VaultDeposit',
          Account:         escrowWallet.address,
          VaultID:         vaultId,
          Amount: {
            currency: RLUSD_HEX,
            issuer,
            value:    rlusdBalance,           // full balance
          },
        }

        try {
          const prepared = await xrplClient.autofill(vaultDepositTx)
          const signed   = escrowWallet.sign(prepared)
          const result   = await xrplClient.submitAndWait(signed.tx_blob)
          const txResult = result.result.meta?.TransactionResult ?? ''

          if (txResult !== 'tesSUCCESS') {
            throw new Error(`VaultDeposit failed: ${txResult}`)
          }

          depositTxHash = result.result.hash

          // LP shares minted are recorded in the MPTIssuance delta or in the
          // account's MPToken balance change. Extract from AffectedNodes.
          // The vault implementation mints LP tokens into the depositor's MPToken entry.
          const lpNode = result.result.meta?.AffectedNodes?.find(n =>
            (n.CreatedNode ?? n.ModifiedNode)?.LedgerEntryType === 'MPToken' &&
            (n.CreatedNode?.NewFields?.MPTAmount ?? n.ModifiedNode?.FinalFields?.MPTAmount),
          )
          sharesDeposited = lpNode
            ? String((lpNode.CreatedNode ?? lpNode.ModifiedNode)?.NewFields?.MPTAmount
                ?? (lpNode.CreatedNode ?? lpNode.ModifiedNode)?.FinalFields?.MPTAmount)
            : rlusdBalance  // graceful fallback: use deposited amount as proxy

          console.log(`[vault-deposit] VaultDeposit OK — shares: ${sharesDeposited} | vaultId: ${vaultId}`)

        } catch (vaultDepositErr) {
          if (isNotEnabledError(vaultDepositErr)) {
            console.warn('[vault-deposit] VaultDeposit not enabled — falling back to simulation')
            simulated       = true
            vaultId         = 'SIMULATED'  // don't leave a real VaultID paired with a deposit that never happened
            sharesDeposited = rlusdBalance
            depositTxHash   = null
          } else {
            throw vaultDepositErr
          }
        }
      } else {
        // Simulation: shares equal the nominal RLUSD deposited
        sharesDeposited = rlusdBalance
      }

      // ── 8. Persist vault state ────────────────────────────────────────
      const { error: updateErr } = await supabase
        .from('pod_escrows')
        .update({
          vault_id:           vaultId,
          vault_shares:       sharesDeposited,
          vault_deposited_at: new Date().toISOString(),
          vault_status:       'deposited',
        })
        .eq('pod_id', podId)

      if (updateErr) {
        // The deposit itself already happened (on-chain, or was decided in simulation) —
        // vault_status is deliberately left at 'depositing' so no automatic retry can run
        // again against it. Requires manual reconciliation.
        console.error(
          `[vault-deposit] RECONCILIATION NEEDED — deposit succeeded (vaultId: ${vaultId}, ` +
          `shares: ${sharesDeposited}, simulated: ${simulated}${depositTxHash ? `, txHash: ${depositTxHash}` : ''}) ` +
          `but the DB update failed for pod ${podId}: ${updateErr.message}`,
        )
        return {
          statusCode: 200,
          headers:    { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vaultId,
            sharesDeposited,
            simulated,
            txHash:               depositTxHash,
            reconciliationNeeded: true,
            warning: `Deposit succeeded but the database update failed (${updateErr.message}). ` +
              `pod_escrows.vault_status is stuck at 'depositing' for pod ${podId} — manual reconciliation required.`,
          }),
        }
      }

      console.log(`[vault-deposit] Pod ${podId} — vault_id: ${vaultId} | shares: ${sharesDeposited} | simulated: ${simulated}`)

      return {
        statusCode: 200,
        headers:    { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId,
          sharesDeposited,
          simulated,
          txHash: depositTxHash,
        }),
      }

    } catch (err) {
      if (vaultCreatedButUnpersisted) {
        console.error(`[vault-deposit] Leaving pod ${podId} at vault_status 'depositing' — manual reconciliation required (see error above).`)
      } else {
        await releaseDepositClaim()
      }
      throw err
    } finally {
      if (xrplClient.isConnected()) {
        await xrplClient.disconnect()
      }
    }

  } catch (e) {
    console.error('[vault-deposit]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
