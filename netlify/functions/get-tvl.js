/**
 * Netlify Function: get-tvl
 *
 * GET /.netlify/functions/get-tvl
 *
 * Total value locked, shown on the Dashboard sidebar. Deliberately verified
 * against real XRPL escrow balances rather than summing pods.contribution_amount
 * from the DB — the DB reflects what's *supposed* to be locked, not what
 * actually is (a slash, a bug, or a stray payment can make them diverge, as
 * happened during this project's live dry-run testing).
 *
 * Live pods only — testnet XRP has no real value and would make the number
 * meaningless. No auth: this is aggregate, non-sensitive info (same trust
 * level as browsing open pods).
 *
 * Required env vars (no VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client } from 'xrpl'
import { rateLimit } from './lib/rateLimit.js'

const LIVE_NODE = 'wss://xrplcluster.com'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const limited = await rateLimit(supabase, event, 'get-tvl', { max: 30, windowSeconds: 300 })
  if (limited) return limited

  const { data: pods, error } = await supabase
    .from('pods')
    .select('id, contract_address')
    .eq('chain', 'XRPL')
    .eq('env', 'live')
    .in('status', ['OPEN', 'LOCKED', 'ACTIVE'])
    .not('contract_address', 'is', null)

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }

  const escrows = [...new Set((pods ?? []).map(p => p.contract_address))]

  if (escrows.length === 0) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totalXrp: 0, podCount: 0 }) }
  }

  const client = new Client(LIVE_NODE)
  await client.connect()

  let totalDrops = 0
  try {
    const balances = await Promise.all(escrows.map(async (address) => {
      try {
        const { result } = await client.request({ command: 'account_info', account: address, ledger_index: 'validated' })
        return Number(result.account_data.Balance)
      } catch {
        // Unfunded/unactivated escrow account — holds nothing yet.
        return 0
      }
    }))
    totalDrops = balances.reduce((sum, b) => sum + b, 0)
  } finally {
    await client.disconnect()
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ totalXrp: totalDrops / 1_000_000, podCount: pods.length }),
  }
}
