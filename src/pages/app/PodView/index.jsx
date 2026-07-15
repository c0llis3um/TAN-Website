import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import ContactSupportModal from '@/components/ContactSupportModal'
import useAppStore from '@/store/useAppStore'
import { getPod, joinPod, getUser, upsertUser, maybeActivatePod, cycleMs, updatePodStatus, getPodPayments, getVaultInfo, getPodMembership } from '@/lib/db'
import { tandaPodJoin, cancelTandaPod, claimCollateral } from '@/lib/contracts'
import { safeJson } from '@/lib/http'

function shareWa(text) { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') }
function shareTg(url, text) { window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank') }

const STATUS_VARIANT = { OPEN: 'blue', LOCKED: 'yellow', ACTIVE: 'green', COMPLETED: 'muted', DEFAULTED: 'red', CANCELLED: 'red', EXPIRED: 'red' }

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
  const [vaultInfo,   setVaultInfo]   = useState(null)
  const [joinEmail,   setJoinEmail]   = useState('')
  const [copied,      setCopied]      = useState(false)
  const [showContact, setShowContact] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([getPod(id), getPodPayments(id)]).then(([{ data, error: err }, { data: pays }]) => {
      if (err || !data) setError(err?.message ?? 'Pod not found.')
      else {
        setPod(data)
        if (data?.tanda_type === 'yield') {
          getVaultInfo(id).then(setVaultInfo)
        }
      }
      setPayments(pays ?? [])
      setLoading(false)
    })
  }, [id])

  // While waiting for a pod to fill, poll for new members instead of making
  // people manually refresh to see if it's full yet.
  useEffect(() => {
    if (pod?.status !== 'OPEN') return
    const iv = setInterval(() => {
      getPod(id).then(({ data: fresh }) => { if (fresh) setPod(fresh) })
    }, 15000)
    return () => clearInterval(iv)
  }, [id, pod?.status])

  async function handleJoin() {
    if (!wallet?.address) return
    setJoining(true)
    setJoinError(null)

    // Open the Xaman sign window synchronously, still inside the click's
    // user-gesture — Brave/iOS silently blocks window.open once any `await`
    // has run, which made taps look like they'd failed and led people to
    // retry (paying collateral more than once for a join that never recorded).
    const xummPopup = pod.chain === 'XRPL'
      ? window.open('', '_blank', 'width=480,height=720,noopener')
      : null

    if (pod.status !== 'OPEN') {
      xummPopup?.close()
      setJoinError(t('pod.noLongerOpen'))
      setJoining(false)
      return
    }
    if (pod.expires_at && new Date(pod.expires_at) < new Date()) {
      xummPopup?.close()
      setJoinError(t('pod.podExpired'))
      setJoining(false)
      return
    }

    const { data: user, error: userErr } = await upsertUser({
      wallet_address: wallet.address,
      chain: wallet.chain ?? 'Ethereum',
      lang: 'es',
      email: joinEmail.trim() || undefined,
    })
    if (userErr || !user) {
      xummPopup?.close()
      setJoinError(userErr?.message ?? 'Could not create user profile.')
      setJoining(false)
      return
    }

    // Re-check membership right before moving funds — protects against a
    // stale page, double click, or a second tab sending collateral twice.
    const { data: existingMember } = await getPodMembership(id, user.id)
    if (existingMember) {
      xummPopup?.close()
      setJoinError(t('pod.alreadyJoined'))
      setJoinDone(true)
      setJoining(false)
      const { data: fresh } = await getPod(id)
      if (fresh) setPod(fresh)
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
        xummPopup?.close()
        setJoinError('This pod has no escrow wallet — contact the organizer.')
        setJoining(false)
        return
      }
      // Ensure escrow has RLUSD trust line before sending collateral
      if (pod.token === 'RLUSD') {
        try {
          const res = await fetch('/.netlify/functions/ensure-rlusd-trustline', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ podId: id, env }),
          })
          const json = await safeJson(res)
          if (!res.ok) throw new Error(json.error ?? 'Could not set up RLUSD trust line on escrow.')
        } catch (err) {
          xummPopup?.close()
          setJoinError(err?.message ?? 'RLUSD escrow setup failed.')
          setJoining(false)
          return
        }
      }
      const collateralAmount = pod.contribution_amount * 2
      let txHash = null
      try {
        const { hasAlreadyPaid } = await import('@/lib/xrpl')
        const alreadyPaid = await hasAlreadyPaid(wallet.address, pod.contract_address, collateralAmount, pod.token, env)
        if (alreadyPaid) {
          // A previous attempt's collateral payment already succeeded on-chain
          // but the join was never recorded (closed tab, blocked popup, etc.)
          // — pod-join.js below will find that same payment on-chain itself and
          // complete the membership record instead of charging again.
          xummPopup?.close()
        } else {
          const { sendContribution } = await import('@/lib/contracts')
          const result = await sendContribution(
            pod.contract_address,
            collateralAmount,
            pod.token,
            pod.chain,
            env,
            xummPopup,
          )
          txHash = result.txHash
        }
      } catch (err) {
        setJoinError(err?.message ?? 'Collateral deposit failed.')
        setJoining(false)
        return
      }

      // ── Record in DB — server-verified against the ledger. pod_members/pods
      // writes are locked to service-role only (migration 028); the client can no
      // longer write these directly, and pod-join.js re-checks the payment itself
      // rather than trusting whatever this page claims happened.
      try {
        const res = await fetch('/.netlify/functions/pod-join', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ podId: id, walletAddress: wallet.address, txHash }),
        })
        const json = await safeJson(res)
        if (!res.ok) throw new Error(json.error ?? 'Could not record your membership.')
      } catch (err) {
        setJoinError(err?.message ?? 'Could not record your membership — contact support, do not pay again.')
        setJoining(false)
        return
      }

      const { data: fresh } = await getPod(id)
      if (fresh) setPod(fresh)

      fetch('/.netlify/functions/notify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ event: 'pod_joined', podId: id, userId: user.id }),
      }).catch(() => {}) // best-effort — never block joining on the notification

      setJoinDone(true)
      setJoining(false)
      return
    }

    // ── Ethereum: DB mirror of on-chain membership ──────────────────
    // TODO: pod_members/pods writes are now locked to service-role only
    // (migration 028) for every chain. Ethereum/Solana never got an equivalent
    // server-verified endpoint in this pass (XRPL/RLUSD is the only chain going
    // live right now) — this call will fail with a DB permission error until one
    // is built. Real membership still lives safely on-chain in the contract
    // either way; this only affects the Supabase mirror used for the UI.
    const { error: joinErr } = await joinPod(id, user.id)
    if (joinErr) {
      setJoinError(joinErr.message)
      setJoining(false)
      return
    }
    await maybeActivatePod(id)
    const { data: fresh } = await getPod(id)
    if (fresh) setPod(fresh)

    fetch('/.netlify/functions/notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event: 'pod_joined', podId: id, userId: user.id }),
    }).catch(() => {})

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
        await updatePodStatus(pod.id, 'CANCELLED')
      } else if (pod.chain === 'XRPL') {
        // pods.status writes are now service-role only (migration 028). A pod with
        // members already has real collateral in escrow — self-service cancel only
        // works while it's still OPEN and empty; anything past that needs an admin
        // (see admin-set-pod-status.js).
        const res  = await fetch('/.netlify/functions/pod-cancel-open', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ podId: pod.id }),
        })
        const json = await safeJson(res)
        if (!res.ok) throw new Error(json.error ?? 'Cancel failed')
      }
      const { data: fresh } = await getPod(pod.id)
      if (fresh) setPod(fresh)
    } catch (err) {
      setCancelErr(err?.message ?? 'Cancel failed.')
    }
    setCancelling(false)
  }

  function copyLink(url) {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
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
        const json = await safeJson(res)
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
        <p className="text-sm dark:text-brand-muted text-slate-400">{t('pod.loading')}</p>
      </div>
    )
  }

  if (error || !pod) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">⚠</p>
        <h2 className="text-xl font-bold dark:text-white text-slate-900 mb-2">{t('pod.notFound')}</h2>
        <p className="text-sm text-red-400 mb-6">{error}</p>
        <Button onClick={() => navigate('/app')}>{t('pod.back')}</Button>
      </div>
    )
  }

  // Ethereum hidden for now (no contracts deployed to mainnet yet) — BrowsePods no
  // longer lists Ethereum pods, but this page is still reachable by direct URL for
  // any pod that was created before the hide. Block interaction here too.
  if (pod.chain === 'Ethereum') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">🚧</p>
        <h2 className="text-xl font-bold dark:text-white text-slate-900 mb-2">Ethereum pods are temporarily unavailable</h2>
        <p className="text-sm dark:text-brand-muted text-slate-500 mb-6">This pod runs on Ethereum, which is paused for now. Check back soon.</p>
        <Button onClick={() => navigate('/app')}>{t('pod.back')}</Button>
      </div>
    )
  }

  const members      = pod.pod_members ?? []
  const totalCycles  = pod.total_cycles ?? pod.size
  const currentCycle = pod.current_cycle ?? 0
  const myMember     = members.find(m => m.user?.wallet_address === wallet?.address)
  const mySlot       = myMember?.payout_slot ?? null

  // Has the current user already paid (or been recorded as self-recipient) this cycle?
  const hasPaidThisCycle = payments.some(p =>
    p.user?.wallet_address === wallet?.address &&
    p.cycle === currentCycle &&
    ['CONFIRMED', 'PENDING'].includes(p.status)
  )

  const ms = cycleMs(pod, env)
  const cycleForDate = hasPaidThisCycle ? currentCycle + 1 : currentCycle
  const dueDate = pod.cycle_started_at && cycleForDate <= totalCycles
    ? new Date(new Date(pod.cycle_started_at).getTime() + cycleForDate * ms)
    : null
  const daysLeft = dueDate ? Math.ceil((dueDate - Date.now()) / 864e5) : null
  const isOverdue = daysLeft !== null && daysLeft < 0

  const spotsLeft = Math.max(0, pod.size - members.length)
  const expiryDate = pod.expires_at ? new Date(pod.expires_at) : null
  const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate - Date.now()) / 864e5) : null

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
            {t('common.back')}
          </button>
          <h1 className="text-3xl font-extrabold dark:text-white text-slate-900">{pod.name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge variant={STATUS_VARIANT[pod.status] ?? 'muted'}>● {pod.status}</Badge>
            <span className="text-sm dark:text-brand-muted text-slate-500">{pod.chain} · {pod.token}</span>
            <span className="text-sm dark:text-brand-muted text-slate-500">{pod.contribution_amount} {pod.token}/cycle</span>
            {env === 'dev' && <Badge variant="yellow">{t('common.testnet')}</Badge>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {pod.status === 'ACTIVE' && myMember && myMember.status === 'DEFAULTED' && (
            <span className="text-sm font-semibold text-red-400 px-4 py-2 rounded-xl bg-red-500/10">{t('pod.defaultedBadge')}</span>
          )}
          {pod.status === 'ACTIVE' && myMember && myMember.status !== 'DEFAULTED' && (
            hasPaidThisCycle
              ? <span className="text-sm font-semibold text-emerald-400 px-4 py-2 rounded-xl bg-emerald-500/10">{t('pod.paidBadge', { n: currentCycle })}</span>
              : <Button onClick={() => navigate(`/app/pod/${id}/pay`)}>{t('pod.payNow', { amount: pod.contribution_amount })} {pod.token} →</Button>
          )}
          {pod.status === 'OPEN' && myMember && (
            <span className="text-sm font-semibold text-brand-cyan px-4 py-2 rounded-xl dark:bg-brand-blue/10 bg-blue-50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-cyan animate-pulse" />
              {t('pod.waitingBadge')}
            </span>
          )}
          {(pod.status === 'OPEN' || (pod.status === 'ACTIVE' && !pod.current_cycle)) && !myMember && wallet?.address && (
            <>
              {pod.organizer?.wallet_address === wallet.address && (
                <p className="text-xs text-amber-400 font-semibold text-right max-w-[200px]">
                  {t('pod.creatorNote')}
                </p>
              )}
              {!joining && !joinDone && (
                <input type="email" value={joinEmail} onChange={e => setJoinEmail(e.target.value)}
                  placeholder={t('pod.emailPlaceholder')}
                  className="w-[200px] px-3 py-2 rounded-xl text-xs text-right dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60" />
              )}
              <Button onClick={handleJoin} disabled={joining || joinDone}>
                {joining ? t('pod.joining') : joinDone ? t('pod.joinedDone') : t('pod.joinBtn')}
              </Button>
              {joining && pod.chain === 'XRPL' && (
                <p className="text-xs text-amber-400 max-w-[200px] text-right">
                  {t('pod.xamanHint')}
                </p>
              )}
              {joinError && (
                <div className="max-w-[200px] text-right space-y-1">
                  <p className="text-xs text-red-400">{joinError}</p>
                  <button
                    onClick={() => setShowContact(true)}
                    className="text-xs text-brand-cyan hover:underline"
                  >
                    {t('pay.contactPrompt')}
                  </button>
                </div>
              )}
            </>
          )}
          {pod.status === 'OPEN' && !wallet?.address && (
            <p className="text-xs dark:text-brand-muted text-slate-400">{t('pod.connectToJoin')}</p>
          )}
          {pod.status === 'OPEN' && wallet?.address && pod.organizer?.wallet_address === wallet.address && (
            <div className="flex flex-col items-end gap-1">
              <button onClick={handleCancel} disabled={cancelling}
                className="text-xs px-3 py-1.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                {cancelling ? t('pod.cancelling') : t('pod.cancelBtn')}
              </button>
              {cancelErr && <p className="text-xs text-red-400 text-right max-w-[180px]">{cancelErr}</p>}
            </div>
          )}
        </div>
      </motion.div>

      {/* Waiting for others banner — shown once you've paid collateral but the pod isn't full yet */}
      {pod.status === 'OPEN' && myMember && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 px-5 py-4 rounded-2xl border dark:bg-brand-blue/5 bg-blue-50 dark:border-brand-blue/20 border-blue-200">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-lg">⏳</span>
            <div>
              <p className="font-bold dark:text-white text-slate-900">{t('pod.waitingTitle')}</p>
              <p className="text-sm dark:text-brand-text text-slate-600 mt-0.5">{t('pod.waitingBody', { n: spotsLeft })}</p>
              {daysUntilExpiry !== null && (
                <p className="text-xs text-amber-500 font-semibold mt-1">
                  {daysUntilExpiry <= 0 ? t('pod.expiresToday') : t('pod.expiresIn', { n: daysUntilExpiry })}
                </p>
              )}
            </div>
          </div>
          <div className="mb-3">
            <div className="flex justify-between text-xs dark:text-brand-muted text-slate-400 mb-1">
              <span>{t('pod.filled', { n: members.length, total: pod.size })}</span>
            </div>
            <div className="h-1.5 dark:bg-brand-border/50 bg-slate-200 rounded-full overflow-hidden">
              <motion.div className="h-full bg-gradient-brand rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pod.size > 0 ? Math.round((members.length / pod.size) * 100) : 0}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="gap-2" disabled={env === 'dev'} onClick={() => shareWa(shareMsg)}>
              <WaIcon /> {t('pod.shareWa')}
            </Button>
            <Button size="sm" variant="outline" className="gap-2" disabled={env === 'dev'} onClick={() => shareTg(podUrl, shareMsg)}>
              <TgIcon /> {t('pod.shareTg')}
            </Button>
            <button onClick={() => copyLink(podUrl)}
              className="text-xs px-3 py-2 rounded-xl bg-brand-blue/10 text-brand-cyan font-semibold hover:bg-brand-blue/20 transition-colors">
              {copied ? t('pod.linkCopied') : t('pod.copyLink')}
            </button>
          </div>
        </motion.div>
      )}

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
            <span className="font-bold">{t('pod.cycleDue', { n: cycleForDate })} </span>
            {dueDate.toLocaleDateString(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' })}
            {isOverdue
              ? <span className="ml-2 font-bold">· {t('pod.overdueBy', { n: Math.abs(daysLeft) })}</span>
              : <span className="ml-2 dark:text-brand-muted text-slate-500">· {t('pod.daysLeft', { n: daysLeft })}</span>
            }
          </div>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Cycle timeline */}
          <Card hover={false} className="p-6">
            <h3 className="font-bold dark:text-white text-slate-900 mb-5 text-sm uppercase tracking-wider">
              {t('pod.cycleProgress')}
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
                    {t('pod.yourPayoutSlot', { slot: mySlot, amount: pod.contribution_amount * totalCycles, token: pod.token })}
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
                {t('pod.filled', { n: members.length, total: pod.size })}
              </span>
            </div>

            {members.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm dark:text-brand-muted text-slate-400">{t('pod.noMembersShare')}</p>
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
                        {isMe && <Badge variant="blue">{t('pod.you')}</Badge>}
                      </div>
                      <span className="text-xs font-mono dark:text-brand-muted text-slate-400">{shortAddr}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs dark:text-brand-muted text-slate-400 mb-1">
                        {t('pod.score')}: {m.user?.reputation_score ?? '—'}
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
                <h3 className="font-bold dark:text-white text-slate-900 text-sm uppercase tracking-wider">{t('pod.paymentHistory')}</h3>
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
                    : `https://${env === 'dev' ? 'testnet.' : ''}xrpl.org/transactions/`

                  return (
                    <div key={cycle} className="px-6 py-5">

                      {/* Cycle header */}
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0
                          ${isComplete ? 'bg-emerald-500/20 text-emerald-400' : 'dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-400'}`}>
                          {isComplete ? '✓' : cycle}
                        </span>
                        <span className="font-bold dark:text-white text-slate-900">{t('pod.cycle')} {cycle}</span>
                        {isComplete
                          ? <span className="text-xs text-emerald-400 font-semibold">{t('pod.cycleCompleted')}</span>
                          : <span className="text-xs dark:text-brand-muted text-slate-400">{t('pod.inProgress')}</span>}
                      </div>

                      {/* Payout box */}
                      <div className={`rounded-2xl p-4 mb-3 border ${isComplete
                        ? 'dark:bg-emerald-500/5 bg-emerald-50 dark:border-emerald-500/20 border-emerald-200'
                        : 'dark:bg-brand-dark bg-slate-50 dark:border-brand-border border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs dark:text-brand-muted text-slate-500 font-semibold uppercase tracking-wider">{t('pod.potRecipient')}</p>
                          {isComplete && <span className="text-xs text-emerald-400">💰 {t('pod.paidOut')}</span>}
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
                      <p className="text-xs font-bold dark:text-brand-muted text-slate-400 uppercase tracking-wider mb-2">{t('pod.contributions')}</p>
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
                          <p className="text-xs dark:text-brand-muted text-slate-400 italic px-1">{t('pod.noPayments')}</p>
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
            <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-4">{t('pod.podInfo')}</h3>
            {[
              [t('pod.totalPot'),    `${pod.contribution_amount * totalCycles} ${pod.token}`],
              [t('pod.contribution'), `${pod.contribution_amount} ${pod.token}${t('pod.perWeek')}`],
              [t('pod.members'),      `${pod.size} ${t('pod.people')}`],
              [t('pod.duration'),     `${totalCycles} ${t('pod.weeks')}`],
              [t('pod.payoutOrder'), pod.payout_method],
              [t('pod.organizer'),    pod.organizer?.alias ?? (pod.organizer?.wallet_address?.slice(0,8) ?? '—')],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between py-2 border-b dark:border-brand-border/40 border-slate-100 last:border-0">
                <span className="text-xs dark:text-brand-muted text-slate-500">{label}</span>
                <span className="text-sm font-bold dark:text-white text-slate-900 text-right">{val}</span>
              </div>
            ))}
            {pod.contract_address && (
              <div className="mt-3 pt-3 border-t dark:border-brand-border/40 border-slate-100">
                <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">{t('pod.contract')}</p>
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

          {/* Yield Vault Growth Card */}
          {pod.tanda_type === 'yield' && myMember && (
            <YieldVaultCard pod={pod} vaultInfo={vaultInfo} t={t} />
          )}

          {/* My Payout */}
          {mySlot && pod.status === 'ACTIVE' && pod.cycle_started_at && (
            <Card hover={false} className="p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-4">{t('pod.yourPayout')}</h3>
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
                      <p className="text-xs dark:text-brand-muted text-slate-400 mt-1">{t('pod.totalPotCycle', { slot: mySlot, total: totalCycles })}</p>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="dark:text-brand-muted text-slate-400">{t('pod.payoutDate')}</span>
                      <span className="font-bold dark:text-white text-slate-900">
                        {payoutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="dark:text-brand-muted text-slate-400">{t('pod.statusLabel')}</span>
                      <span className={`font-bold ${alreadyPaid ? 'text-emerald-400' : thisCycle ? 'text-brand-cyan' : 'dark:text-white text-slate-900'}`}>
                        {alreadyPaid ? `✓ ${t('pod.paidOut')}` : thisCycle ? `⚡ ${t('pod.thisCycle')}` : t('pod.daysAway', { n: daysUntil })}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </Card>
          )}

          {/* Claim Collateral — after the pod completes, or if it was cancelled/expired before filling */}
          {['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(pod.status) && myMember && pod.contract_address && (
            <Card hover={false} className="p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-1">{t('pod.collateralReturn')}</h3>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">
                {t(pod.status === 'COMPLETED' ? 'pod.claimBody' : 'pod.claimBodyRefund')} <span className="font-bold dark:text-white text-slate-900">{pod.contribution_amount * 2} {pod.token}</span>
              </p>

              {claimTx ? (
                <div className="p-3 rounded-xl dark:bg-emerald-500/10 bg-emerald-50 border dark:border-emerald-500/30 border-emerald-200">
                  <p className="text-xs font-bold dark:text-emerald-300 text-emerald-700 mb-1">✓ {t('pod.claimed')}</p>
                  <a href={pod.chain === 'Ethereum'
                      ? `https://${env === 'dev' ? 'sepolia.' : ''}etherscan.io/tx/${claimTx}`
                      : `https://${env === 'dev' ? 'testnet.' : ''}xrpl.org/transactions/${claimTx}`}
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
                    {claiming ? t('pod.claiming') : t('pod.claimBtn', { amount: pod.contribution_amount * 2, token: pod.token })}
                  </button>
                </>
              )}
            </Card>
          )}


          {/* How it works */}
          <HowItWorksCard pod={pod} t={t} />

          {/* Share */}
          <Card hover={false} className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-1">{t('pod.inviteTitle')}</h3>
            <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">
              {t('pod.spotsLeft', { n: spotsLeft })}
              {pod.status === 'OPEN' && daysUntilExpiry !== null && (
                <> · {daysUntilExpiry <= 0 ? t('pod.expiresToday') : t('pod.expiresIn', { n: daysUntilExpiry })}</>
              )}
            </p>
            <div className="space-y-2">
              <Button size="sm" className="w-full justify-center gap-2"
                disabled={env === 'dev'} onClick={() => shareWa(shareMsg)}>
                <WaIcon /> {t('pod.shareWa')}
              </Button>
              <Button size="sm" variant="outline" className="w-full justify-center gap-2"
                disabled={env === 'dev'} onClick={() => shareTg(podUrl, shareMsg)}>
                <TgIcon /> {t('pod.shareTg')}
              </Button>
              {env === 'dev' && (
                <p className="text-xs text-amber-500 text-center mt-1">{t('pay.sharingDisabled')}</p>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input readOnly value={podUrl}
                className="flex-1 text-xs px-3 py-2 rounded-xl dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-brand-muted text-slate-500 truncate" />
              <button onClick={() => copyLink(podUrl)}
                className="text-xs px-3 py-2 rounded-xl bg-brand-blue/10 text-brand-cyan font-semibold hover:bg-brand-blue/20 transition-colors">
                {copied ? t('pod.linkCopied') : t('common.copy', 'Copy')}
              </button>
            </div>
          </Card>
        </div>
      </div>

      {showContact && (
        <ContactSupportModal
          podId={pod.id}
          podName={pod.name}
          onClose={() => setShowContact(false)}
        />
      )}
    </div>
  )
}

function HowItWorksCard({ pod, t }) {
  const [open, setOpen] = useState(false)

  const status = pod.status
  const isYield = pod.tanda_type === 'yield'

  const stepsKey = status === 'COMPLETED' ? 'howCompleted'
    : status === 'ACTIVE' ? 'howActive'
    : 'howOpen'

  const rawSteps = t(stepsKey, { returnObjects: true, size: pod.size })
  const steps = Array.isArray(rawSteps) ? rawSteps : []

  const icons = status === 'COMPLETED'
    ? ['🎉', '💰', '🏅', '🔄']
    : status === 'ACTIVE'
    ? ['⏰', '🔒', '💸', '✅']
    : ['🔑', '👥', '⏳', '🔄', '🏁']

  return (
    <Card hover={false} className="overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left group">
        <div className="flex items-center gap-2">
          <span className="text-base">❓</span>
          <span className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 group-hover:text-brand-cyan transition-colors">
            {t('pod.howToggle')}
          </span>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs dark:text-brand-muted text-slate-400">
          ▾
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="how-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}>
            <div className="px-5 pb-5 border-t dark:border-brand-border/40 border-slate-100 pt-4 space-y-3">

              {steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-7 h-7 rounded-xl dark:bg-brand-dark bg-slate-100 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                    {icons[i] ?? '•'}
                  </div>
                  <p className="text-xs dark:text-brand-text text-slate-600 leading-relaxed pt-1">{step}</p>
                </div>
              ))}

              {/* Slash warning — always shown for active/open pods */}
              {status !== 'COMPLETED' && (
                <div className="mt-2 p-3 rounded-xl dark:bg-red-500/10 bg-red-50 border dark:border-red-500/20 border-red-100 flex gap-2">
                  <span className="text-sm flex-shrink-0">⚡</span>
                  <p className="text-xs text-red-400 leading-relaxed">{t('pod.howSlashWarning')}</p>
                </div>
              )}

              {/* Yield extra note */}
              {isYield && (
                <div className="p-3 rounded-xl dark:bg-emerald-500/10 bg-emerald-50 border dark:border-emerald-500/20 border-emerald-100 flex gap-2">
                  <span className="text-sm flex-shrink-0">🌱</span>
                  <p className="text-xs text-emerald-500 leading-relaxed">{t('pod.howYieldExtra')}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

const APY = { vault: 0.06, amm: 0.10 }

function YieldVaultCard({ pod, vaultInfo, t }) {
  const principal  = pod.contribution_amount * 2
  const apy        = APY[pod.yield_strategy] ?? 0.06
  const isDeposited = vaultInfo?.vault_status === 'deposited'
  const isSimulated = vaultInfo?.vault_id === 'SIMULATED'

  let currentValue = principal
  let earned       = 0
  let daysLocked   = 0

  if (isDeposited && vaultInfo?.vault_deposited_at) {
    const elapsed  = Date.now() - new Date(vaultInfo.vault_deposited_at).getTime()
    const years    = elapsed / (365.25 * 24 * 60 * 60 * 1000)
    earned         = principal * apy * years
    currentValue   = principal + earned
    daysLocked     = Math.max(1, Math.floor(elapsed / 864e5))
  }

  const growthPct     = earned > 0 ? ((earned / principal) * 100) : 0
  const barWidth      = Math.min(growthPct * 50, 100)   // scale so even tiny growth is visible
  const formattedVal  = currentValue.toFixed(currentValue < 100 ? 4 : 2)
  const formattedEarn = earned > 0 ? `+${earned.toFixed(4)}` : '+0.0000'

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <div className="relative rounded-3xl overflow-hidden border dark:border-emerald-500/20 border-emerald-200 shadow-lg">

        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-br dark:from-emerald-950/60 dark:to-brand-darker from-emerald-50 to-white pointer-events-none" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/10 rounded-full -translate-y-8 translate-x-8 blur-2xl pointer-events-none" />

        <div className="relative p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌱</span>
              <h3 className="text-xs font-bold uppercase tracking-widest dark:text-emerald-400 text-emerald-600">
                {t('pod.vaultCardTitle')}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              {isSimulated && <span className="text-[10px] px-2 py-0.5 rounded-full dark:bg-brand-border bg-slate-200 dark:text-brand-muted text-slate-500">Sim</span>}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-bold">
                ~{(apy * 100).toFixed(0)}% APY
              </span>
            </div>
          </div>

          {isDeposited ? (
            <>
              {/* Main value */}
              <div className="text-center py-3 mb-4">
                <motion.p
                  className="text-3xl font-extrabold"
                  style={{ background: 'linear-gradient(135deg, #34d399, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
                  {formattedVal}
                  <span className="text-lg ml-1.5">{pod.token}</span>
                </motion.p>
                <p className="text-xs dark:text-brand-muted text-slate-400 mt-1">{t('pod.vaultCurrentValue')}</p>
              </div>

              {/* Principal / Earned */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="dark:bg-black/20 bg-white/60 rounded-2xl p-3 text-center border dark:border-brand-border/30 border-slate-100">
                  <p className="text-[10px] dark:text-brand-muted text-slate-400 uppercase tracking-wide">{t('pod.vaultPrincipal')}</p>
                  <p className="font-bold dark:text-white text-slate-900 text-sm mt-0.5">{principal} <span className="text-xs font-normal dark:text-brand-muted text-slate-400">{pod.token}</span></p>
                </div>
                <div className="dark:bg-emerald-500/10 bg-emerald-50 rounded-2xl p-3 text-center border dark:border-emerald-500/20 border-emerald-100">
                  <p className="text-[10px] text-emerald-500 uppercase tracking-wide">{t('pod.vaultEarned')}</p>
                  <p className="font-bold text-emerald-400 text-sm mt-0.5">{formattedEarn} <span className="text-xs font-normal">{pod.token}</span></p>
                </div>
              </div>

              {/* Growth bar */}
              <div className="mb-4">
                <div className="flex justify-between text-[10px] mb-1.5">
                  <span className="dark:text-brand-muted text-slate-400 uppercase tracking-wide">{t('pod.vaultGrowth')}</span>
                  <span className="font-bold text-emerald-400">+{growthPct.toFixed(4)}%</span>
                </div>
                <div className="h-2 dark:bg-black/30 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #34d399, #22d3ee)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(barWidth, 1)}%` }}
                    transition={{ duration: 1.8, ease: 'easeOut', delay: 0.4 }}
                  />
                </div>
              </div>

              {/* Footer stats */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="dark:text-brand-muted text-slate-400">{t('pod.vaultStrategy')}</span>
                  <span className="font-semibold dark:text-white text-slate-700">
                    {pod.yield_strategy === 'vault' ? 'Vault (XLS-66d)' : 'AMM Pool (XLS-30)'}
                  </span>
                </div>
                {daysLocked > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="dark:text-brand-muted text-slate-400">{t('pod.vaultDaysLocked')}</span>
                    <span className="font-semibold text-emerald-400">{daysLocked} days</span>
                  </div>
                )}
              </div>

              {isSimulated && (
                <p className="text-[10px] dark:text-brand-muted text-slate-400 text-center mt-3 italic">{t('pod.vaultSimulated')}</p>
              )}
            </>
          ) : (
            /* Not yet deposited */
            <div className="text-center py-4">
              <div className="text-4xl mb-3">🏦</div>
              <p className="text-sm font-bold dark:text-white text-slate-900 mb-1">{principal} {pod.token}</p>
              <p className="text-xs dark:text-brand-muted text-slate-400">{t('pod.vaultPending')}</p>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-semibold">~{(apy * 100).toFixed(0)}% APY waiting</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
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
