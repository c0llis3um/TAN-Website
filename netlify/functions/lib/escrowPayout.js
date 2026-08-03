/**
 * Sends a collateral payout from a pod's escrow wallet.
 *
 * XRPL never lets a Payment drain an account below its own reserve (~1 XRP).
 * A pod's escrow wallet is activated by the first member's own collateral
 * deposit, so that reserve is effectively borrowed from collateral funds for
 * as long as any is still sitting in escrow. Once every other member has
 * already claimed, the last claimant's plain Payment fails with
 * tecUNFUNDED_PAYMENT — the balance is down to exactly the reserve floor and
 * there's no transaction that can send from below it.
 *
 * AccountDelete is the only transaction type that can move a reserve: it
 * sends an account's *entire* remaining balance (minus its own fee) to a
 * single Destination and removes the account. So the last claimant gets
 * their full entitled collateral plus the small freed reserve, never less.
 * Requires the account to hold no other owned objects (trust lines, etc) and
 * to be at least ~256 ledgers old — both always true for a plain-XRP escrow
 * by the time every member has finished a multi-cycle pod, so callers only
 * pass `isFinalClaim` for non-RLUSD pods.
 */

import { xrpToDrops } from 'xrpl'

const RLUSD_HEX = '524C555344000000000000000000000000000000'

export async function sendEscrowPayout({ client, escrowWallet, destination, amount, isRlusd, issuer, isFinalClaim }) {
  if (isFinalClaim && !isRlusd) {
    const { result: accountInfo } = await client.request({
      command: 'account_info',
      account: escrowWallet.address,
      ledger_index: 'validated',
    })
    const balanceBefore = Number(accountInfo.account_data.Balance)

    const deleteTx = {
      TransactionType: 'AccountDelete',
      Account:         escrowWallet.address,
      Destination:     destination,
    }
    const prepared = await client.autofill(deleteTx)
    const signed   = escrowWallet.sign(prepared)
    const result   = await client.submitAndWait(signed.tx_blob)
    const txResult = result.result.meta?.TransactionResult ?? ''

    if (txResult !== 'tesSUCCESS') {
      throw new Error(`Payment failed: ${txResult}`)
    }

    const deliveredDrops = balanceBefore - Number(prepared.Fee)
    return { txHash: result.result.hash, deliveredAmount: deliveredDrops / 1_000_000 }
  }

  const payment = {
    TransactionType: 'Payment',
    Account:         escrowWallet.address,
    Destination:     destination,
    Amount: isRlusd
      ? { currency: RLUSD_HEX, issuer, value: String(amount) }
      : xrpToDrops(String(amount)),
  }
  const prepared = await client.autofill(payment)
  const signed   = escrowWallet.sign(prepared)
  const result   = await client.submitAndWait(signed.tx_blob)
  const txResult = result.result.meta?.TransactionResult ?? ''

  if (txResult !== 'tesSUCCESS') {
    throw new Error(`Payment failed: ${txResult}`)
  }

  return { txHash: result.result.hash, deliveredAmount: amount }
}
