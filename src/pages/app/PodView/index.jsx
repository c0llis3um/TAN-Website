import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import MoonPayButton from '@/components/MoonPayButton'
import useAppStore from '@/store/useAppStore'
import { getPod, joinPod, getUser, upsertUser, maybeActivatePod, cycleMs, updatePodStatus, getPodPayments } from '@/lib/db'
import { tandaPodJoin, cancelTandaPod, claimCollateral } from '@/lib/contracts'

function shareWa(text) { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') }
function shareTg(url, text) { window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank') }

const STATUS_VARIANT = { OPEN: 'blue', LOCKED: 'yellow', ACTIVE: 'green', COMPLETED: 'muted', DEFAULTED: 'red', CANCELLED: 'red' }

export default function PodView() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const { t, i18n }  = useTranslation()
  const { env, wallet } = useAppStore()

  const [pod,       setPod]       = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [joining,    setJoining]    = useState(false)
  const [joinError,  setJoinError]  = useState(null)
  const [joinDone,   setJoinDone]   = useState(false)
  const [cancelling,  setCancelling]  = useState(false)
  const [cancelErr,   setCancelErr]   = useState(null)
  const [payments,    setPayments]    = useState([])
  const [claiming,    setClaiming]    = useState(false)
  const [claimTx,     setClaimTx]     = useState(null)
  const [claimErr,    setClaimErr]    = useState(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([getPod(id), getPodPayments(id)]).then(([{ data, error: err }, { data: pays }]) => {
      if (err || !data) setError(err?.message ?? 'Pod not found.')
      else setPod(data)
      setPayments(pays ?? [])
      setLoading(false)
    })
  }, [id])

  async function handleJoin() {
    if (!wallet?.address) return
    setJoining(true)
    setJoinError(null)
    const { data: user, error: userErr } = await upsertUser({
      wallet_address: wallet.address,
      chain: wallet.chain ?? 'Ethereum',
      lang: 'es',
    })
    if (userErr || !user) {
      setJoinError(userErr?.message ?? 'Could not create user profile.')
      setJoining(false)
      return
    }
    // ── On-chain join: lock collateral ──────────────────────────
    if (pod.chain === 'Ethereum') {
      if (!pod.contract_address) {
        setJoinError('Contract not deployed yet — contact the organizer.')
        setJoining(false)
        return
      }
      try {
        await tandaPodJoin(env, pod.contribution_amount, pod.contract_address)
      } catch (err) {
        setJoinError(err?.message ?? 'Collateral deposit failed.')
        setJoining(false)
        return
      }
    } else if (pod.chain === 'XRPL') {
      if (!pod.contract_address) {
        setJoinError('This pod has no escrow wallet — contact the organizer.')
        setJoining(false)
        return
      }
      try {
        const { sendContribution } = await import('@/lib/contracts')
        await sendContribution(
          pod.contract_address,
          pod.contribution_amount * 2,
          pod.token,
          pod.chain,
          env,
        )
      } catch (err) {
        setJoinError(err?.message ?? 'Collateral deposit failed.')
        setJoining(false)
        return
      }
    }

    // ── Record in DB ─────────────────────────────────────────────
    const { error: joinErr } = await joinPod(id, user.id)
    if (joinErr) {
      setJoinError(joinErr.message)
      setJoining(false)
      return
    }
    // Check if pod is now full — assign slots and activate if so
    await maybeActivatePod(id)
    // Refresh pod data to show new member + updated status
    const { data: fresh } = await getPod(id)
    if (fresh) setPod(fresh)
    setJoinDone(true)
    setJoining(false)
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this pod? Members will be able to claim their collateral back.')) return
    setCancelling(true)
    setCancelErr(null)
    try {
      if (pod.chain === 'Ethereum' && pod.contract_address) {
        await cancelTandaPod(env, pod.contract_address)
      }
      await updatePodStatus(pod.id, 'CANCELLED')
      const { data: fresh } = await getPod(pod.id)
      if (fresh) setPod(fresh)
    } catch (err) {
      setCancelErr(err?.message ?? 'Cancel failed.')
    }
    setCancelling(false)
  }

  async function handleClaim() {
    if (!wallet?.address) return
    setClaiming(true)
    setClaimErr(null)
    try {
      if (pod.chain === 'Ethereum') {
        const { txHash } = await claimCollateral(env, pod.contract_address)
        setClaimTx(txHash)
      } else if (pod.chain === 'XRPL') {
        const res  = await fetch('/.netlify/functions/claim-xrpl-collateral', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ podId: pod.id, walletAddress: wallet.address }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Claim failed')
        setClaimTx(json.txHash)
      }
    } catch (e) {
      setClaimErr(e?.reason ?? e?.message ?? String(e))
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 rounded-full border-2 border-brand-blue border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm dark:text-brand-muted text-slate-400">Loading pod…</p>
      </div>
    )
  }

  if (error || !pod) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">⚠</p>
        <h2 className="text-xl font-bold dark:text-white text-slate-900 mb-2">Pod not found</h2>
        <p className="text-sm text-red-400 mb-6">{error}</p>
        <Button onClick={() => navigate('/app')}>← Back to Dashboard</Button>
      </div>
    )
  }

  const members      = pod.pod_members ?? []
  const totalCycles  = pod.total_cycles ?? pod.size
  const currentCycle = pod.current_cycle ?? 0
  const myMember     = members.find(m => m.user?.wallet_address === wallet?.address)
  const mySlot       = myMember?.payout_slot ?? null

  const dueDate = pod.cycle_started_at
    ? new Date(new Date(pod.cycle_started_at).getTime() + cycleMs(pod, env))
    : null
  const daysLeft = dueDate ? Math.ceil((dueDate - Date.now()) / 864e5) : null
  const isOverdue = daysLeft !== null && daysLeft < 0

  const podUrl   = `${window.location.origin}/app/pod/${id}`
  const shareMsg = i18n.language === 'es'
    ? `¡Únete a mi Tanda DeFi! 💰\n${pod.contribution_amount} ${pod.token}/semana por ${totalCycles} semanas.\nSeguro, automático, sin banco.\n👉 ${podUrl}`
    : `Join my DeFi Tanda! 💰\n${pod.contribution_amount} ${pod.token}/week for ${totalCycles} weeks.\nSafe, automatic, no bank needed.\n👉 ${podUrl}`

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <button onClick={() => navigate('/app')}
            className="text-sm dark:text-brand-muted text-slate-400 hover:text-brand-cyan mb-2 flex items-center gap-1">
            ← Back
          </button>
          <h1 className="text-3xl font-extrabold dark:text-white text-slate-900">{pod.name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge variant={STATUS_VARIANT[pod.status] ?? 'muted'}>● {pod.status}</Badge>
            <span className="text-sm dark:text-brand-muted text-slate-500">{pod.chain} · {pod.token}</span>
            <span className="text-sm dark:text-brand-muted text-slate-500">{pod.contribution_amount} {pod.token}/cycle</span>
            {env === 'dev' && <Badge variant="yellow">Testnet</Badge>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {pod.status === 'ACTIVE' && myMember && (
            <Button onClick={() => navigate(`/app/pod/${id}/pay`)}>
              Pay {pod.contribution_amount} {pod.token} →
            </Button>
          )}
          {(pod.status === 'OPEN' || (pod.status === 'ACTIVE' && !pod.current_cycle)) && !myMember && wallet?.address && (
            <>
              {pod.organizer?.wallet_address === wallet.address && (
                <p className="text-xs text-amber-400 font-semibold text-right max-w-[200px]">
                  You created this pod — join it to deposit your collateral
                </p>
              )}
              <Button onClick={handleJoin} disabled={joining || joinDone}>
                {joining ? 'Joining…' : joinDone ? '✓ Joined!' : `Join Pod →`}
              </Button>
              {joining && pod.chain === 'XRPL' && (
                <p className="text-xs text-amber-400 max-w-[200px] text-right">
                  Check Xaman — approve the collateral payment
                </p>
              )}
              {joinError && <p className="text-xs text-red-400 max-w-[200px] text-right">{joinError}</p>}
            </>
          )}
          {pod.status === 'OPEN' && !wallet?.address && (
            <div className="flex flex-col items-end gap-2">
              <p className="text-xs dark:text-brand-muted text-slate-400">Connect wallet to join</p>
              {pod.chain === 'XRPL' && (
                <MoonPayButton
                  token={pod.token === 'XRP' ? 'XRP' : pod.token}
                  amount={pod.contribution_amount * 3}
                  env={env}
                  label="Buy XRP with Apple/Google Pay"
                  className="!w-auto !py-2 !px-4 !text-xs"
                />
              )}
            </div>
          )}
          {pod.status === 'OPEN' && wallet?.address && pod.organizer?.wallet_address === wallet.address && (
            <div className="flex flex-col items-end gap-1">
              <button onClick={handleCancel} disabled={cancelling}
                className="text-xs px-3 py-1.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                {cancelling ? 'Cancelling…' : 'Cancel Pod'}
              </button>
              {cancelErr && <p className="text-xs text-red-400 text-right max-w-[180px]">{cancelErr}</p>}
            </div>
          )}
        </div>
      </motion.div>

      {/* Due date banner */}
      {pod.status === 'ACTIVE' && dueDate && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className={`mb-6 px-5 py-3 rounded-2xl flex items-center gap-3 border text-sm
            ${isOverdue
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : daysLeft <= 2
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'dark:bg-brand-blue/5 bg-blue-50 dark:border-brand-blue/20 border-blue-200 dark:text-brand-text text-slate-700'}`}>
          <span className="text-lg">{isOverdue ? '🔴' : daysLeft <= 2 ? '⚠️' : '📅'}</span>
          <div>
            <span className="font-bold">Cycle {currentCycle} payment due: </span>
            {dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {isOverdue
              ? <span className="ml-2 font-bold">· OVERDUE by {Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? 's' : ''}</span>
              : <span className="ml-2 dark:text-brand-muted text-slate-500">· {daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>
            }
          </div>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Cycle timeline */}
          <Card hover={false} className="p-6">
            <h3 className="font-bold dark:text-white text-slate-900 mb-5 text-sm uppercase tracking-wider">
              Cycle Progress
            </h3>
            {totalCycles > 0 ? (
              <>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: totalCycles }, (_, i) => {
                    const cycle    = i + 1
                    const done     = cycle < currentCycle
                    const current  = cycle === currentCycle
                    const myPayout = mySlot !== null && cycle === mySlot
                    return (
                      <motion.div key={cycle}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.04 * i, type: 'spring' }}
                        className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all
                          ${done    ? 'dark:bg-emerald-500/10 bg-emerald-50 border-emerald-500/30 text-emerald-400' : ''}
                          ${current ? 'bg-gradient-brand text-white border-transparent shadow-glow-sm' : ''}
                          ${myPayout && !current ? 'dark:bg-brand-blue/10 bg-blue-50 border-brand-blue/40 text-brand-cyan' : ''}
                          ${!done && !current && !myPayout ? 'dark:bg-brand-dark bg-slate-50 dark:border-brand-border border-slate-200 dark:text-brand-muted text-slate-400' : ''}
                        `}
                      >
                        {current && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white animate-ping-slow" />}
                        <span>W{cycle}</span>
                        {done && <span>✓</span>}
                        {myPayout && !done && <span className="text-[9px] opacity-80">YOU</span>}
                      </motion.div>
                    )
                  })}
                </div>
                {mySlot && (
                  <p className="text-xs dark:text-brand-muted text-slate-400 mt-4">
                    Your payout: <span className="gradient-text font-bold">Week {mySlot}</span> —{' '}
                    {pod.contribution_amount * totalCycles} {pod.token}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm dark:text-brand-muted text-slate-400">No cycles yet.</p>
            )}
          </Card>

          {/* Members */}
          <Card hover={false} className="overflow-hidden">
            <div className="px-6 py-4 border-b dark:border-brand-border border-slate-200 flex items-center justify-between">
              <h3 className="font-bold dark:text-white text-slate-900 text-sm uppercase tracking-wider">
                {t('pod.membersTitle', 'Members')}
              </h3>
              <span className="text-xs dark:text-brand-muted text-slate-400">
                {members.length}/{pod.size} filled
              </span>
            </div>

            {members.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm dark:text-brand-muted text-slate-400">No members yet. Share the link to invite people.</p>
              </div>
            ) : (
              members.map((m, i) => {
                const isMe = m.user?.wallet_address === wallet?.address
                const addr = m.user?.wallet_address ?? ''
                const shortAddr = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—'
                return (
                  <motion.div key={m.id}
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i }}
                    className={`flex items-center gap-4 px-6 py-4 border-b dark:border-brand-border/40 border-slate-100 last:border-0
                      ${isMe ? 'dark:bg-brand-blue/5 bg-blue-50/50' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0
                      ${isMe ? 'bg-gradient-brand text-white' : 'dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-500'}`}>
                      {m.payout_slot ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold dark:text-white text-slate-900">
                          {m.user?.alias ?? shortAddr}
                        </span>
                        {isMe && <Badge variant="blue">You</Badge>}
                      </div>
                      <span className="text-xs font-mono dark:text-brand-muted text-slate-400">{shortAddr}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs dark:text-brand-muted text-slate-400 mb-1">
                        Score: {m.user?.reputation_score ?? '—'}
                      </div>
                      <Badge variant={m.status === 'ACTIVE' ? 'green' : 'yellow'}>{m.status}</Badge>
                    </div>
                  </motion.div>
                )
              })
            )}
          </Card>
          {/* Payment History */}
          {payments.length > 0 && (
            <Card hover={false} className="overflow-hidden">
              <div className="px-6 py-4 border-b dark:border-brand-border border-slate-200">
                <h3 className="font-bold dark:text-white text-slate-900 text-sm uppercase tracking-wider">Payment History</h3>
              </div>
              <div className="divide-y dark:divide-brand-border/40 divide-slate-100">
                {Array.from({ length: pod.total_cycles ?? pod.size }, (_, i) => {
                  const cycle         = i + 1
                  const cyclePays     = payments.filter(p => p.cycle === cycle)
                  const recipient     = pod.pod_members?.find(m => m.payout_slot === cycle)
                  const recipientAddr = recipient?.user?.wallet_address ?? ''
                  const recipientName = recipient?.user?.alias ?? (recipientAddr ? `${recipientAddr.slice(0,6)}…${recipientAddr.slice(-4)}` : '—')
                  const totalPot      = cyclePays.reduce((s, p) => s + Number(p.amount), 0)
                  const isComplete    = cyclePays.length > 0 && cyclePays.length >= (pod.pod_members?.filter(m => m.status === 'ACTIVE').length ?? pod.size)
                  const explorerBase  = pod.chain === 'Ethereum'
                    ? `https://${env === 'dev' ? 'sepolia.' : ''}etherscan.io/tx/`
                    : `https://${env === 'dev' ? 'devnet.' : ''}xrpl.org/transactions/`

                  return (
                    <div key={cycle} className="px-6 py-5">

                      {/* Cycle header */}
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0
                          ${isComplete ? 'bg-emerald-500/20 text-emerald-400' : 'dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-400'}`}>
                          {isComplete ? '✓' : cycle}
                        </span>
                        <span className="font-bold dark:text-white text-slate-900">Cycle {cycle}</span>
                        {isComplete
                          ? <span className="text-xs text-emerald-400 font-semibold">Completed</span>
                          : <span className="text-xs dark:text-brand-muted text-slate-400">In progress</span>}
                      </div>

                      {/* Payout box */}
                      <div className={`rounded-2xl p-4 mb-3 border ${isComplete
                        ? 'dark:bg-emerald-500/5 bg-emerald-50 dark:border-emerald-500/20 border-emerald-200'
                        : 'dark:bg-brand-dark bg-slate-50 dark:border-brand-border border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs dark:text-brand-muted text-slate-500 font-semibold uppercase tracking-wider">Pot Recipient</p>
                          {isComplete && <span className="text-xs text-emerald-400">💰 Paid out</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold dark:text-white text-slate-900">{recipientName}</p>
                            {recipientAddr && (
                              <p className="text-xs font-mono dark:text-brand-muted text-slate-400 mt-0.5">{recipientAddr.slice(0,10)}…{recipientAddr.slice(-6)}</p>
                            )}
                          </div>
                          <p className="text-xl font-extrabold text-brand-cyan">{totalPot || (pod.contribution_amount * (pod.pod_members?.length ?? pod.size))} {pod.token}</p>
                        </div>
                      </div>

                      {/* Individual payments */}
                      <p className="text-xs font-bold dark:text-brand-muted text-slate-400 uppercase tracking-wider mb-2">Contributions</p>
                      <div className="space-y-1.5">
                        {cyclePays.map(p => {
                          const addr  = p.user?.wallet_address ?? ''
                          const short = addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : '—'
                          const name  = p.user?.alias ?? short
                          return (
                            <div key={p.id} className="flex items-center justify-between text-xs dark:bg-brand-dark bg-slate-50 rounded-xl px-3 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                <span className="font-semibold dark:text-white text-slate-900 truncate">{name}</span>
                                <span className="dark:text-brand-muted text-slate-400 flex-shrink-0">{p.amount} {p.token}</span>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                                <span className="dark:text-brand-muted text-slate-400">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</span>
                                {p.tx_hash && (
                                  <a href={`${explorerBase}${p.tx_hash}`} target="_blank" rel="noopener noreferrer"
                                    className="font-mono text-brand-cyan hover:underline">
                                    {p.tx_hash.slice(0,8)}…↗
                                  </a>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {cyclePays.length === 0 && (
                          <p className="text-xs dark:text-brand-muted text-slate-400 italic px-1">No payments recorded yet</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

        </div>

        {/* Sidebar */}
        <div className="space-y-5">

          {/* Pod info */}
          <Card hover={false} className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-4">Pod Info</h3>
            {[
              ['Total pot',    `${pod.contribution_amount * totalCycles} ${pod.token}`],
              ['Contribution', `${pod.contribution_amount} ${pod.token}/week`],
              ['Members',      `${pod.size} people`],
              ['Duration',     `${totalCycles} weeks`],
              ['Payout order', pod.payout_method],
              ['Organizer',    pod.organizer?.alias ?? (pod.organizer?.wallet_address?.slice(0,8) ?? '—')],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between py-2 border-b dark:border-brand-border/40 border-slate-100 last:border-0">
                <span className="text-xs dark:text-brand-muted text-slate-500">{label}</span>
                <span className="text-sm font-bold dark:text-white text-slate-900 text-right">{val}</span>
              </div>
            ))}
            {pod.contract_address && (
              <div className="mt-3 pt-3 border-t dark:border-brand-border/40 border-slate-100">
                <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">Contract</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono dark:text-brand-cyan text-brand-blue truncate flex-1">{pod.contract_address.slice(0,10)}…{pod.contract_address.slice(-6)}</p>
                  {pod.chain === 'Ethereum' && (
                    <a
                      href={`https://${env === 'dev' ? 'sepolia.' : ''}etherscan.io/address/${pod.contract_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 rounded-lg bg-brand-blue/10 text-brand-cyan font-semibold hover:bg-brand-blue/20 transition-colors flex-shrink-0"
                    >
                      Etherscan ↗
                    </a>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* My Payout */}
          {mySlot && pod.status === 'ACTIVE' && pod.cycle_started_at && (
            <Card hover={false} className="p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-4">Your Payout</h3>
              {(() => {
                const msPerCycle = cycleMs(pod, env)
                const payoutDate = new Date(new Date(pod.cycle_started_at).getTime() + mySlot * msPerCycle)
                const daysUntil         = Math.ceil((payoutDate - Date.now()) / 864e5)
                const alreadyPaid       = mySlot < currentCycle
                const thisCycle         = mySlot === currentCycle
                return (
                  <div className="space-y-3">
                    <div className="text-center py-3 rounded-2xl dark:bg-brand-blue/5 bg-blue-50 border dark:border-brand-blue/20 border-blue-100">
                      <p className="text-2xl font-extrabold gradient-text">{pod.contribution_amount * totalCycles} {pod.token}</p>
                      <p className="text-xs dark:text-brand-muted text-slate-400 mt-1">Total pot — Cycle {mySlot} of {totalCycles}</p>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="dark:text-brand-muted text-slate-400">Payout date</span>
                      <span className="font-bold dark:text-white text-slate-900">
                        {payoutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="dark:text-brand-muted text-slate-400">Status</span>
                      <span className={`font-bold ${alreadyPaid ? 'text-emerald-400' : thisCycle ? 'text-brand-cyan' : 'dark:text-white text-slate-900'}`}>
                        {alreadyPaid ? '✓ Paid out' : thisCycle ? '⚡ This cycle!' : `${daysUntil} days away`}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </Card>
          )}

          {/* Claim Collateral */}
          {pod.status === 'COMPLETED' && myMember && pod.contract_address && (
            <Card hover={false} className="p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-1">Collateral Return</h3>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">
                The tanda is complete! Claim your <span className="font-bold dark:text-white text-slate-900">{pod.contribution_amount * 2} {pod.token}</span> collateral back.
              </p>

              {claimTx ? (
                <div className="p-3 rounded-xl dark:bg-emerald-500/10 bg-emerald-50 border dark:border-emerald-500/30 border-emerald-200">
                  <p className="text-xs font-bold dark:text-emerald-300 text-emerald-700 mb-1">✓ Collateral received!</p>
                  <a href={pod.chain === 'Ethereum'
                      ? `https://${env === 'dev' ? 'sepolia.' : ''}etherscan.io/tx/${claimTx}`
                      : `https://${env === 'dev' ? 'devnet.' : ''}xrpl.org/transactions/${claimTx}`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-xs dark:text-brand-cyan text-brand-blue underline break-all">
                    {claimTx.slice(0, 20)}…
                  </a>
                </div>
              ) : (
                <>
                  {claimErr && <p className="text-xs text-red-400 mb-2">{claimErr}</p>}
                  <button onClick={handleClaim} disabled={claiming}
                    className="w-full py-2.5 rounded-xl bg-gradient-brand text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all">
                    {claiming ? 'Sending to your wallet…' : `Claim ${pod.contribution_amount * 2} ${pod.token} →`}
                  </button>
                </>
              )}
            </Card>
          )}

          {/* Buy XRP — onramp for XRPL pods */}
          {pod.chain === 'XRPL' && !myMember && (
            <Card hover={false} className="p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-1">Don't have XRP?</h3>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">
                Buy XRP with Apple Pay, Google Pay, or a credit card — no crypto experience needed.
              </p>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-3">
                You'll need ~<span className="font-bold dark:text-white text-slate-900">{pod.contribution_amount * 3} {pod.token}</span> to join
                <span className="block opacity-70">(2× collateral + 1st payment)</span>
              </p>
              <MoonPayButton
                walletAddress={wallet?.address}
                token={pod.token === 'XRP' ? 'XRP' : pod.token}
                amount={pod.contribution_amount * 3}
                env={env}
              />
            </Card>
          )}

          {/* Share */}
          <Card hover={false} className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-1">Invite Members</h3>
            <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">
              {Math.max(0, pod.size - members.length)} spots left.
            </p>
            <div className="space-y-2">
              <Button size="sm" className="w-full justify-center gap-2"
                disabled={env === 'dev'} onClick={() => shareWa(shareMsg)}>
                <WaIcon /> {t('pod.shareWa', 'Share on WhatsApp')}
              </Button>
              <Button size="sm" variant="outline" className="w-full justify-center gap-2"
                disabled={env === 'dev'} onClick={() => shareTg(podUrl, shareMsg)}>
                <TgIcon /> {t('pod.shareTg', 'Share on Telegram')}
              </Button>
              {env === 'dev' && (
                <p className="text-xs text-amber-500 text-center mt-1">Sharing disabled on testnet</p>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input readOnly value={podUrl}
                className="flex-1 text-xs px-3 py-2 rounded-xl dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-brand-muted text-slate-500 truncate" />
              <button onClick={() => navigator.clipboard.writeText(podUrl)}
                className="text-xs px-3 py-2 rounded-xl bg-brand-blue/10 text-brand-cyan font-semibold hover:bg-brand-blue/20 transition-colors">
                {t('common.copy', 'Copy')}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function WaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.527 5.845L.057 23.876l6.155-1.463A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.804 9.804 0 01-5.003-1.37l-.357-.212-3.705.88.936-3.608-.232-.368A9.786 9.786 0 012.182 12C2.182 6.574 6.574 2.182 12 2.182S21.818 6.574 21.818 12 17.426 21.818 12 21.818z"/>
    </svg>
  )
}

function TgIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
    </svg>
  )
}
