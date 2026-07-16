import { useState } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetPodsForAnomalyScan } from '@/lib/db'
import { scanEscrowAnomalies } from '@/lib/xrpl'
import { safeJson } from '@/lib/http'
import { IconSearch } from '@/components/ui/Icons'

export default function AdminAnomalies() {
  const [scanning,   setScanning]   = useState(false)
  const [scanError,  setScanError]  = useState(null)
  const [anomalies,  setAnomalies]  = useState(null) // null = never scanned
  const [refunding,  setRefunding]  = useState(null) // key of row in flight
  const [overrides,  setOverrides]  = useState({})   // key -> destination override

  async function handleScan() {
    setScanning(true)
    setScanError(null)
    setAnomalies(null)
    try {
      const { data: pods, error } = await adminGetPodsForAnomalyScan()
      if (error) throw new Error(error.message)

      const results = []
      for (const pod of pods ?? []) {
        const expectedSenders = (pod.pod_members ?? [])
          .filter(m => m.user?.wallet_address)
          .map(m => ({ address: m.user.wallet_address, expectedAmount: pod.contribution_amount * 2 }))

        const found = await scanEscrowAnomalies(pod.contract_address, pod.token, pod.env ?? 'dev', expectedSenders)
        for (const a of found) {
          results.push({
            ...a,
            key:           `${pod.id}:${a.sender}`,
            podId:         pod.id,
            podName:       pod.name,
            escrowAddress: pod.contract_address,
            token:         pod.token,
          })
        }
      }
      setAnomalies(results)
    } catch (err) {
      setScanError(err?.message ?? 'Scan failed.')
    } finally {
      setScanning(false)
    }
  }

  async function handleRefund(a) {
    const toAddress = (overrides[a.key] ?? a.sender).trim()
    if (!toAddress) return
    if (!window.confirm(`Send ${a.excess} ${a.token} from the "${a.podName}" escrow to ${toAddress}? This cannot be undone.`)) return

    setRefunding(a.key)
    try {
      const supabaseModule = await import('@/lib/supabase')
      const { data: { session } } = await supabaseModule.default.auth.getSession()
      const res = await fetch('/.netlify/functions/admin-refund-anomaly', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body:    JSON.stringify({
          podId:         a.podId,
          senderAddress: a.sender,
          toAddress,
          amount:        a.excess,
          reason:        a.reason,
        }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json.error ?? 'Refund failed')
      setAnomalies(prev => prev.map(x => x.key === a.key ? { ...x, refunded: true, txHash: json.txHash } : x))
    } catch (err) {
      alert(err?.message ?? 'Refund failed.')
    } finally {
      setRefunding(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Payment Anomalies</h1>
          <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">
            XRPL escrow payments not accounted for by pod membership — a wallet that paid in but isn't
            a member, or a member who overpaid.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="shrink-0 px-5 py-2.5 rounded-xl bg-gradient-brand text-white text-sm font-bold shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {scanning ? 'Scanning…' : <span className="inline-flex items-center gap-1.5"><IconSearch className="w-4 h-4" /> Scan Escrows</span>}
        </button>
      </div>

      {scanError && (
        <p className="text-sm text-red-400 dark:bg-red-500/10 bg-red-50 p-3 rounded-xl">{scanError}</p>
      )}

      <Card hover={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-brand-border border-slate-200">
                {['Pod', 'Escrow', 'Sender', 'Reason', 'Sent', 'Expected', 'Excess', 'Refund To', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anomalies === null ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center dark:text-brand-muted text-slate-400">
                  {scanning ? 'Scanning escrow wallets on-chain…' : 'Run a scan to check every XRPL escrow against its pod’s member list.'}
                </td></tr>
              ) : anomalies.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center dark:text-brand-muted text-slate-400">
                  No anomalies found — every escrow balance is accounted for.
                </td></tr>
              ) : anomalies.map((a, i) => (
                <motion.tr key={a.key}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 * i }}
                  className="border-b dark:border-brand-border/40 border-slate-100 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap dark:text-white text-slate-900">{a.podName}</td>
                  <td className="px-4 py-3 font-mono text-xs max-w-[130px] truncate dark:text-brand-muted text-slate-500">{a.escrowAddress}</td>
                  <td className="px-4 py-3 font-mono text-xs max-w-[130px] truncate dark:text-brand-muted text-slate-500">{a.sender}</td>
                  <td className="px-4 py-3">
                    <Badge variant={a.reason === 'non_member_payment' ? 'red' : 'yellow'}>
                      {a.reason === 'non_member_payment' ? 'Not a member' : 'Overpaid'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap dark:text-brand-text text-slate-700">{a.totalSent} {a.token}</td>
                  <td className="px-4 py-3 whitespace-nowrap dark:text-brand-text text-slate-700">{a.expected} {a.token}</td>
                  <td className="px-4 py-3 font-bold whitespace-nowrap dark:text-white text-slate-900">{a.excess} {a.token}</td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={a.sender}
                      disabled={a.refunded}
                      onChange={e => setOverrides(prev => ({ ...prev, [a.key]: e.target.value }))}
                      className="w-36 px-2 py-1.5 rounded-lg text-xs font-mono dark:bg-brand-dark bg-slate-50 border dark:border-brand-border border-slate-200 dark:text-white text-slate-900 outline-none focus:border-brand-blue/60 disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {a.refunded ? (
                      <Badge variant="green">Refunded</Badge>
                    ) : (
                      <button
                        onClick={() => handleRefund(a)}
                        disabled={refunding === a.key}
                        className="px-3 py-1.5 rounded-lg bg-brand-blue/10 text-brand-cyan border border-brand-blue/30 text-xs font-semibold hover:bg-brand-blue/20 transition-colors disabled:opacity-40"
                      >
                        {refunding === a.key ? 'Sending…' : 'Refund'}
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
