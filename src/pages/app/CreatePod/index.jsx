import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import useAppStore from '@/store/useAppStore'
import { createPod, upsertUser, updatePodContract, getUserKycStatus, getPlatformSetting, getTreasuryWallet } from '@/lib/db'
import { deployPodEVM, sendContribution } from '@/lib/contracts'
import { safeJson } from '@/lib/http'

// ── Config ───────────────────────────────────────────────────

// Flat USD creation fee, charged in XRP at current market price. Only
// charged for live XRPL pods — dev/testnet pods stay free.
const CREATION_FEE_USD = 2

async function fetchXrpUsdPrice() {
  const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd')
  const json = await res.json()
  const price = json.ripple?.usd
  if (!price) throw new Error('Could not fetch XRP price — try again in a moment.')
  return price
}

// Ethereum hidden for now — no TandaFactory/TandaPod contracts deployed to mainnet yet.
// Re-add { id: 'Ethereum', label: 'Ethereum', icon: '🔷', note: 'Secure · Widely supported' }
// once contracts are audited and deployed (see src/contracts/live.json).
const CHAINS = [
  { id: 'XRPL',    label: 'XRP Ledger', icon: '🔵', note: 'Very low fees · Fast · RLUSD'   },
]

const CHAIN_TOKENS = {
  Ethereum: [
    { id: 'ETH',  label: 'ETH',   icon: '🔷', note: 'Native — no approval needed. Price moves together.' },
    { id: 'USDC', label: 'USDC',  icon: '💵', note: 'Stablecoin — $1 always. No price risk.' },
    { id: 'USDT', label: 'USDT',  icon: '💚', note: 'Stablecoin — widely accepted.' },
  ],
  XRPL: [
    { id: 'RLUSD', label: 'RLUSD', icon: '🔵', note: 'Ripple stablecoin — pegged to USD.' },
    { id: 'XRP',   label: 'XRP',   icon: '💧', note: 'Native XRP — low fees.' },
  ],
}

const YIELD_STRATEGIES = [
  {
    id:      'vault',
    icon:    '🏦',
    label:   'Vault (XLS-66d)',
    apy:     '~4–8% APY',
    risk:    'low',
    badge:   'Capital Protected',
    badgeVariant: 'green',
    note:    'Collateral deposited into an XRPL Vault. Low risk, stable returns.',
  },
  {
    id:      'amm',
    icon:    '🔁',
    label:   'AMM Pool (XLS-30)',
    apy:     '~5–15% APY',
    risk:    'medium',
    badge:   'Capital at Risk',
    badgeVariant: 'amber',
    note:    'Collateral provides liquidity to an AMM pool. Higher potential, impermanent loss risk.',
  },
]

function getSteps(form) {
  const steps = ['rules', 'chain', 'token']
  if (form.chain === 'XRPL') steps.push('type')
  if (form.chain === 'XRPL' && form.tandaType === 'yield') steps.push('strategy')
  steps.push('settings', 'payout', 'review')
  return steps
}

export default function CreatePod() {
  const navigate = useNavigate()
  const { t }    = useTranslation()
  const { env, wallet } = useAppStore()

  const STEP_LABEL_MAP = {
    rules:    t('create.steps.rules'),
    chain:    t('create.steps.chain'),
    token:    t('create.steps.token'),
    type:     t('create.steps.type'),
    strategy: t('create.steps.strategy'),
    settings: t('create.steps.settings'),
    payout:   t('create.steps.payout'),
    review:   t('create.steps.review'),
  }

  // Ethereum pod creation is hidden for now (see CHAINS above) — always default to XRPL.
  const defaultChain = 'XRPL'

  // RLUSD has no live issuer configured yet (RLUSD_ISSUER.live is empty) — default
  // to XRP instead of RLUSD whenever we're on live, so a fresh form never lands on
  // a broken token choice.
  function defaultTokenFor(chain, envVal) {
    if (chain === 'XRPL' && envVal === 'live') return 'XRP'
    return CHAIN_TOKENS[chain]?.[0]?.id ?? 'ETH'
  }

  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    chain:             defaultChain,
    token:             defaultTokenFor(defaultChain, env),
    tandaType:         'standard',
    yieldStrategy:     null,
    contribution:      defaultChain === 'Ethereum' ? 0.01 : 10,
    size:              6,
    payoutOrder:       'random',
    name:              '',
    email:             '',
    frequencyDays:     7,
    riskAck:           false,
    ilAck:             false,
    rulesAck1:         false,
    rulesAck2:         false,
    rulesAck3:         false,
    rulesAck4:         false,
  })

  const DEPLOY_STEPS = [
    { key: 'save',    label: t('create.deploy.saving')     },
    { key: 'approve', label: t('create.deploy.escrow')     },
    ...(form.chain === 'XRPL' && env === 'live' ? [{ key: 'fee', label: t('create.deploy.fee') }] : []),
    { key: 'confirm', label: t('create.deploy.confirming') },
    { key: 'done',    label: t('create.deploy.done')       },
  ]

  const [kycStatus,   setKycStatus]   = useState(null)
  const [kycEnforced, setKycEnforced] = useState(false)

  useEffect(() => {
    getPlatformSetting('kyc_required').then(v => setKycEnforced(v === 'true'))
  }, [])

  // RLUSD and yield tandas aren't safe on live yet (empty live RLUSD issuer) — if env
  // flips to live mid-form, fall back to a plain XRP standard tanda.
  useEffect(() => {
    if (env !== 'live') return
    setForm(f => (f.token === 'RLUSD' || f.tandaType === 'yield')
      ? { ...f, token: 'XRP', tandaType: 'standard', yieldStrategy: null }
      : f)
  }, [env])

  useEffect(() => {
    if (!wallet?.address) { setKycStatus('none'); return }
    getUserKycStatus(wallet.address).then(setKycStatus)
  }, [wallet?.address])

  const [deploying,  setDeploying]  = useState(false)
  const [deployStep, setDeployStep] = useState(null)
  const [error,      setError]      = useState(null)
  const [result,     setResult]     = useState(null)

  const steps     = getSteps(form)
  const stepId    = steps[step]
  const stepCount = steps.length

  const upd      = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const tokens   = CHAIN_TOKENS[form.chain] ?? []
  const totalPot = +(form.contribution * form.size).toFixed(6)

  const isYield    = form.chain === 'XRPL' && form.tandaType === 'yield'
  const strategy   = YIELD_STRATEGIES.find(s => s.id === form.yieldStrategy)

  const TOKEN_CONFIG = {
    ETH:   { min: 0.001, max: 10,   step: 0.001, decimals: 3 },
    XRP:   { min: 1,     max: 5000, step: 1,     decimals: 0 },
    RLUSD: { min: 1,     max: 5000, step: 1,     decimals: 0 },
    USDC:  { min: 1,     max: 5000, step: 1,     decimals: 0 },
    USDT:  { min: 1,     max: 5000, step: 1,     decimals: 0 },
  }
  const tokCfg = TOKEN_CONFIG[form.token] ?? TOKEN_CONFIG.USDC

  function resetDeploy() {
    setDeploying(false)
    setDeployStep(null)
    setError(null)
  }

  function handleChainChange(chain) {
    const firstToken = defaultTokenFor(chain, env)
    const cfg = TOKEN_CONFIG[firstToken] ?? TOKEN_CONFIG.USDC
    setForm(f => ({
      ...f,
      chain,
      token:         firstToken,
      contribution:  cfg.min * 10,
      tandaType:     'standard',
      yieldStrategy: null,
    }))
  }

  function handleTokenChange(token) {
    const cfg = TOKEN_CONFIG[token] ?? TOKEN_CONFIG.USDC
    setForm(f => ({ ...f, token, contribution: cfg.min * 10 }))
  }

  function handleTypeChange(tandaType) {
    setForm(f => ({
      ...f,
      tandaType,
      yieldStrategy: null,
      frequencyDays: tandaType === 'yield' ? 30 : f.frequencyDays,
      size:          tandaType === 'yield' ? Math.max(f.size, 12) : f.size,
      riskAck:       false,
      ilAck:         false,
    }))
  }

  function goNext() { setStep(s => Math.min(s + 1, stepCount - 1)) }
  function goBack() { setStep(s => Math.max(s - 1, 0)) }

  const canDeployYield = !isYield || (
    form.riskAck &&
    (form.yieldStrategy !== 'amm' || form.ilAck)
  )

  const handleDeploy = async () => {
    setDeploying(true)
    setError(null)

    let podId = null

    try {
      if (!wallet?.address) throw new Error('Connect your wallet first.')

      setDeployStep('save')

      const { data: user, error: uErr } = await upsertUser({
        wallet_address: wallet.address,
        chain:          wallet.chain ?? 'Ethereum',
        lang:           'es',
        email:          form.email.trim() || undefined,
      })
      if (uErr) throw new Error(`Could not save profile: ${uErr.message}`)
      if (!user?.id) throw new Error('User profile error — run migrations 004–010.')

      const { data: pod, error: pErr } = await createPod({
        chain:                form.chain,
        token:                form.token,
        name:                 form.name,
        organizer_id:         user.id,
        contribution_amount:  form.contribution,
        size:                 form.size,
        payout_method:        form.payoutOrder,
        cycle_frequency_days: form.frequencyDays,
        env,
        tanda_type:           form.tandaType,
        yield_strategy:       form.yieldStrategy,
      })
      if (pErr) throw new Error(`Could not save pod: ${pErr.message}`)
      if (!pod?.id) throw new Error('Pod not returned — check Supabase grants (migration 010).')

      podId = pod.id

      setDeployStep('approve')
      let contractResult = { simulated: true, txHash: null, contractAddress: null }

      // pods.status/contract_address writes are now service-role only (migration
      // 028). For XRPL, create-xrpl-escrow.js and confirm-pod-creation-fee.js do
      // that finalization server-side themselves; markFailed()/updatePodContract
      // below are the "give up on this pod" rollback paths.
      const markFailed = async () => {
        if (form.chain === 'XRPL') {
          await fetch('/.netlify/functions/pod-mark-failed', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ podId }),
          }).catch(() => {})
        } else {
          // TODO: Ethereum/Solana pod finalization never got a service-role
          // equivalent in this pass (XRPL/RLUSD is the only chain going live
          // right now, and Ethereum isn't selectable in the UI yet — see the
          // CHAINS comment above). This will fail with a DB permission error.
          await updatePodContract(podId, { status: 'FAILED' }).catch(() => {})
        }
      }

      try {
        if (form.chain === 'Ethereum') {
          contractResult = await deployPodEVM({
            name:         form.name,
            size:         form.size,
            token:        form.token,
            payoutMethod: form.payoutOrder,
            env,
          })
        } else if (form.chain === 'XRPL') {
          const escrowRes = await fetch('/.netlify/functions/create-xrpl-escrow', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ podId, env, token: form.token, tanda_type: form.tandaType, yield_strategy: form.yieldStrategy }),
          })
          const escrowJson = await safeJson(escrowRes)
          if (!escrowRes.ok) throw new Error(escrowJson.error ?? `Escrow creation failed (${escrowRes.status})`)
          contractResult = { simulated: false, txHash: null, contractAddress: escrowJson.escrowAddress }
        }
      } catch (chainErr) {
        await markFailed()
        throw chainErr
      }

      // ── Creation fee — $2 USD in XRP, live XRPL pods only ─────────
      let feeResult = { txHash: null, paid: false }

      if (form.chain === 'XRPL' && env === 'live') {
        setDeployStep('fee')
        try {
          const treasuryAddress = await getTreasuryWallet('XRPL')
          if (!treasuryAddress) throw new Error('Treasury wallet not configured — contact support.')
          const xrpPrice = await fetchXrpUsdPrice()
          const feeXrp   = +(CREATION_FEE_USD / xrpPrice).toFixed(2)
          // skipVerify: true — don't block here waiting up to 20s for mainnet
          // confirmation. confirm-pod-creation-fee.js (below) independently
          // re-verifies the payment itself, with its own retries, so a slow
          // (but successful) confirmation no longer looks like a failure and
          // triggers markFailed() on a pod whose fee was actually paid.
          const { txHash } = await sendContribution(treasuryAddress, feeXrp, 'XRP', 'XRPL', env, null, { skipVerify: true })
          feeResult = { txHash, paid: true }
        } catch (feeErr) {
          await markFailed()
          throw new Error(`Creation fee payment failed: ${feeErr?.message ?? feeErr}`)
        }
      }

      setDeployStep('confirm')

      let dbErr = null
      if (form.chain === 'XRPL') {
        // dev: create-xrpl-escrow.js already finalized the pod (contract_address +
        // deployed_at) server-side. live: still needs the fee verified.
        if (env === 'live') {
          // confirm-pod-creation-fee.js does its own scan-based verification with
          // its own retries — this outer loop is just a safety net for a failed
          // HTTP round-trip (network blip), not for confirmation timing.
          for (let i = 1; i <= 3; i++) {
            const res = await fetch('/.netlify/functions/confirm-pod-creation-fee', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ podId }),
            })
            const json = await safeJson(res)
            if (res.ok) { dbErr = null; break }
            dbErr = json.error ?? `HTTP ${res.status}`
            await new Promise(r => setTimeout(r, i * 800))
          }
        }
      } else {
        // TODO: see markFailed() above — same Ethereum/Solana follow-up gap.
        for (let i = 1; i <= 3; i++) {
          const { error } = await updatePodContract(podId, {
            contract_address:  contractResult.contractAddress,
            creation_fee_tx:   feeResult.txHash,
            creation_fee_paid: feeResult.paid,
            status:            'OPEN',
            deployed_at:       contractResult.simulated ? null : new Date().toISOString(),
          })
          if (!error) { dbErr = null; break }
          dbErr = error
          await new Promise(r => setTimeout(r, i * 800))
        }
      }

      if (dbErr) {
        console.error('[deploy] DB update failed', { podId, txHash: contractResult.txHash, dbErr })
      }

      setDeployStep('done')
      setResult({ podId, txHash: feeResult.txHash ?? contractResult.txHash, simulated: contractResult.simulated })

      fetch('/.netlify/functions/notify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ event: 'pod_created', podId, userId: user.id }),
      }).catch(() => {}) // best-effort — never block pod creation on the notification

      setTimeout(() => navigate(`/app/pod/${podId}`), 1800)

    } catch (err) {
      console.error('[deploy]', err)
      setError(err?.message ?? 'Deployment failed.')
    }
  }

  // ── Deploy overlay ────────────────────────────────────────────
  if (deploying) {
    const activeIdx = DEPLOY_STEPS.findIndex(s => s.key === deployStep)

    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <AnimatePresence mode="wait">

          {deployStep === 'done' && result ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
              <motion.div className="w-20 h-20 rounded-full bg-gradient-brand mx-auto flex items-center justify-center mb-6 shadow-glow"
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                <span className="text-4xl text-white">✓</span>
              </motion.div>
              <h2 className="text-2xl font-extrabold dark:text-white text-slate-900 mb-2">{t('create.created')}</h2>
              {result.simulated && <p className="text-xs text-amber-400 mb-2">{t('create.simulated')}</p>}
              {result.txHash && <p className="font-mono text-xs dark:text-brand-muted text-slate-400 break-all">{result.txHash.slice(0, 20)}…</p>}
              <p className="text-sm dark:text-brand-muted text-slate-500 mt-3">{t('create.redirecting')}</p>
            </motion.div>

          ) : error ? (
            <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 mx-auto flex items-center justify-center mb-5">
                <span className="text-3xl">⚠</span>
              </div>
              <h2 className="text-xl font-extrabold dark:text-white text-slate-900 mb-3">{t('create.error')}</h2>
              <div className="p-4 rounded-2xl dark:bg-red-500/10 bg-red-50 border border-red-500/20 text-sm text-red-400 text-left mb-5">
                {error}
              </div>
              <button onClick={resetDeploy}
                className="w-full py-3 rounded-2xl dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 font-semibold text-sm hover:opacity-80 transition-opacity">
                {t('create.tryAgain')}
              </button>
            </motion.div>

          ) : (
            <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div className="w-20 h-20 rounded-full bg-gradient-brand mx-auto flex items-center justify-center mb-8 shadow-glow"
                animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
                <span className="text-3xl">⚡</span>
              </motion.div>
              <div className="space-y-3 text-left max-w-xs mx-auto">
                {DEPLOY_STEPS.filter(s => s.key !== 'done').map((s, i) => {
                  const thisIdx = DEPLOY_STEPS.findIndex(x => x.key === s.key)
                  const done    = thisIdx < activeIdx
                  const active  = s.key === deployStep
                  return (
                    <div key={s.key} className={`flex items-center gap-3 text-sm transition-all ${
                      active ? 'dark:text-white text-slate-900 font-semibold'
                      : done  ? 'text-emerald-400'
                      : 'dark:text-brand-muted text-slate-400'}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 border-2 transition-all ${
                        done   ? 'bg-emerald-400 border-emerald-400 text-white'
                        : active ? 'border-brand-blue animate-pulse'
                        : 'dark:border-brand-border border-slate-300'}`}>
                        {done ? '✓' : i + 1}
                      </span>
                      {s.label}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    )
  }

  // ── Wizard ────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <motion.button onClick={() => navigate('/app')} whileHover={{ x: -3 }}
        className="text-sm dark:text-brand-muted text-slate-400 hover:text-brand-cyan mb-6 flex items-center gap-1">
        {t('create.back')}
      </motion.button>

      <div className="mb-8">
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900 mb-1">{t('create.title')}</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500">
          {form.chain === 'Ethereum' && `${t('create.smallFeeNote')} · `}
          {env === 'dev' ? t('common.testnet') : 'Mainnet'}
          {!wallet && <span className="ml-2 text-amber-400">· {t('create.connectWallet')}</span>}
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
        {steps.map((id, i) => (
          <div key={id} className="flex items-center flex-shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              i === step ? 'bg-gradient-brand text-white'
              : i < step ? 'dark:text-emerald-400 text-emerald-600'
              : 'dark:text-brand-muted text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                i === step ? 'bg-white/20' : i < step ? 'bg-emerald-400 text-white' : 'dark:bg-brand-border bg-slate-200'}`}>
                {i < step ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{STEP_LABEL_MAP[id]}</span>
            </div>
            {i < steps.length - 1 && <div className="w-4 h-px dark:bg-brand-border bg-slate-300 mx-1 flex-shrink-0" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* Rules */}
        {stepId === 'rules' && (
          <motion.div key="rules" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-1">{t('create.rules.title')}</h3>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-5">{t('create.rules.sub')}</p>

              <div className="space-y-4 mb-6">
                {[
                  { title: t('create.rules.rule1Title'), body: t('create.rules.rule1Body'), icon: '⏰' },
                  { title: t('create.rules.rule2Title'), body: t('create.rules.rule2Body'), icon: '🔒' },
                  { title: t('create.rules.rule3Title'), body: t('create.rules.rule3Body'), icon: '⚡' },
                  { title: t('create.rules.rule4Title'), body: t('create.rules.rule4Body'), icon: '🚫' },
                ].map(r => (
                  <div key={r.title} className="flex gap-3 p-3 rounded-xl dark:bg-brand-dark bg-slate-50 border dark:border-brand-border border-slate-200">
                    <span className="text-xl flex-shrink-0 mt-0.5">{r.icon}</span>
                    <div>
                      <p className="text-sm font-bold dark:text-white text-slate-900 mb-0.5">{r.title}</p>
                      <p className="text-xs dark:text-brand-muted text-slate-500">{r.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl dark:bg-brand-blue/5 bg-blue-50 border dark:border-brand-blue/20 border-blue-200 p-4 space-y-3">
                <p className="text-xs font-bold dark:text-brand-muted text-slate-500 uppercase tracking-widest mb-2">Confirm to continue</p>
                {[
                  ['rulesAck1', t('create.rules.ack1')],
                  ['rulesAck2', t('create.rules.ack2')],
                  ['rulesAck3', t('create.rules.ack3')],
                  ['rulesAck4', t('create.rules.ack4')],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={form[key]} onChange={e => upd(key, e.target.checked)}
                      className="mt-0.5 accent-brand-blue flex-shrink-0 w-4 h-4" />
                    <span className="text-xs dark:text-brand-text text-slate-700">{label}</span>
                  </label>
                ))}
              </div>

              {/* KYC gate */}
              {kycEnforced && wallet && kycStatus !== 'approved' && (
                <div className={`mt-4 p-4 rounded-2xl border text-sm ${
                  kycStatus === 'pending'
                    ? 'dark:bg-amber-500/10 bg-amber-50 border-amber-500/20 text-amber-500'
                    : kycStatus === 'rejected'
                    ? 'dark:bg-red-500/10 bg-red-50 border-red-500/20 text-red-400'
                    : 'dark:bg-brand-blue/5 bg-blue-50 border-brand-blue/20 dark:text-brand-text text-slate-700'
                }`}>
                  <p className="font-bold mb-1">{t('create.rules.kycRequired')}</p>
                  <p className="text-xs mb-3">
                    {kycStatus === 'pending'  ? t('create.rules.kycPending')
                    : kycStatus === 'rejected' ? t('create.rules.kycRejected')
                    : t('create.rules.kycBody')}
                  </p>
                  {kycStatus !== 'pending' && (
                    <button
                      onClick={() => navigate('/app/kyc')}
                      className="text-xs font-bold underline underline-offset-2 hover:opacity-70 transition-opacity">
                      {t('create.rules.kycBtn')}
                    </button>
                  )}
                </div>
              )}
            </Card>

            <Button
              className="w-full"
              disabled={!form.rulesAck1 || !form.rulesAck2 || !form.rulesAck3 || !form.rulesAck4}
              onClick={goNext}>
              {t('create.rules.continueBtn')}
            </Button>
          </motion.div>
        )}

        {/* Chain */}
        {stepId === 'chain' && (
          <motion.div key="chain" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-4">{t('create.chooseChain')}</h3>
              <div className="space-y-3">
                {CHAINS.map(c => (
                  <motion.button key={c.id} onClick={() => handleChainChange(c.id)}
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      form.chain === c.id ? 'border-brand-blue/60 dark:bg-brand-blue/10 bg-blue-50'
                      : 'dark:bg-brand-darker dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
                    <span className="text-2xl">{c.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold dark:text-white text-slate-900">{c.label}</span>
                        {c.id === 'XRPL'     && <Badge variant="blue">Low fees</Badge>}
                        {c.id === 'XRPL'     && <Badge variant="green">Yield available</Badge>}
                        {c.id === 'Ethereum' && wallet?.chain === 'Ethereum' && <Badge variant="blue">Connected</Badge>}
                      </div>
                      <span className="text-xs dark:text-brand-muted text-slate-400">{c.note}</span>
                    </div>
                    {form.chain === c.id && <span className="text-brand-cyan text-xl flex-shrink-0">●</span>}
                  </motion.button>
                ))}
              </div>
            </Card>
            <Button className="w-full" onClick={goNext}>{t('create.continue')}</Button>
          </motion.div>
        )}

        {/* Token */}
        {stepId === 'token' && (
          <motion.div key="token" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-2">{t('create.tokenLabel')}</h3>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">{t('create.tokenSub')}</p>
              <div className="space-y-3">
                {tokens.map(tok => {
                  const disabled = tok.id === 'RLUSD' && env === 'live'
                  return (
                    <motion.button key={tok.id} onClick={() => !disabled && handleTokenChange(tok.id)}
                      disabled={disabled}
                      whileHover={disabled ? {} : { scale: 1.01 }} whileTap={disabled ? {} : { scale: 0.99 }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                        disabled ? 'dark:bg-brand-darker/50 bg-slate-50 dark:border-brand-border/50 border-slate-200 opacity-50 cursor-not-allowed'
                        : form.token === tok.id ? 'border-brand-blue/60 dark:bg-brand-blue/10 bg-blue-50'
                        : 'dark:bg-brand-darker dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
                      <span className="text-2xl">{tok.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold dark:text-white text-slate-900">{tok.label}</span>
                          {disabled && <Badge variant="muted">{t('common.soon')}</Badge>}
                          {!disabled && (tok.id === 'USDC' || tok.id === 'RLUSD') && <Badge variant="green">Stable</Badge>}
                          {!disabled && (tok.id === 'ETH'  || tok.id === 'XRP')   && <Badge variant="muted">Native</Badge>}
                        </div>
                        <span className="text-xs dark:text-brand-muted text-slate-400">
                          {disabled ? t('create.rlusdLiveSoon') : tok.note}
                        </span>
                      </div>
                      {!disabled && form.token === tok.id && <span className="text-brand-cyan text-xl flex-shrink-0">●</span>}
                    </motion.button>
                  )
                })}
              </div>

              {(form.token === 'ETH' || form.token === 'XRP') && (
                <div className="mt-4 p-3 rounded-xl dark:bg-amber-500/10 bg-amber-50 border border-amber-500/20 text-xs text-amber-500">
                  Native tokens fluctuate in price. All members share the same price exposure.
                </div>
              )}
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>{t('create.back')}</Button>
              <Button className="flex-1" onClick={goNext}>{t('create.continue')}</Button>
            </div>
          </motion.div>
        )}

        {/* Tanda Type (XRPL only) */}
        {stepId === 'type' && (
          <motion.div key="type" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-1">{t('create.chooseTandaType')}</h3>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-5">{t('create.tandaTypeSub')}</p>
              <div className="space-y-3">
                {[
                  {
                    id:    'standard',
                    icon:  '🤝',
                    label: t('create.typeStandard'),
                    note:  t('create.typeStandardNote'),
                  },
                  {
                    id:    'yield',
                    icon:  '📈',
                    label: t('create.typeYield'),
                    note:  t('create.typeYieldNote'),
                    badges: [{ label: 'Min 12 months', variant: 'blue' }, { label: 'XRPL only', variant: 'muted' }],
                  },
                ].map(opt => {
                  const disabled = opt.id === 'yield' && env === 'live'
                  return (
                    <motion.button key={opt.id} onClick={() => !disabled && handleTypeChange(opt.id)}
                      disabled={disabled}
                      whileHover={disabled ? {} : { scale: 1.01 }} whileTap={disabled ? {} : { scale: 0.99 }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                        disabled ? 'dark:bg-brand-darker/50 bg-slate-50 dark:border-brand-border/50 border-slate-200 opacity-50 cursor-not-allowed'
                        : form.tandaType === opt.id ? 'border-brand-blue/60 dark:bg-brand-blue/10 bg-blue-50'
                        : 'dark:bg-brand-darker dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
                      <span className="text-2xl">{opt.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold dark:text-white text-slate-900">{opt.label}</span>
                          {disabled ? <Badge variant="muted">{t('common.soon')}</Badge> : opt.badges?.map(b => <Badge key={b.label} variant={b.variant}>{b.label}</Badge>)}
                        </div>
                        <span className="text-xs dark:text-brand-muted text-slate-400">
                          {disabled ? t('create.yieldLiveSoon') : opt.note}
                        </span>
                      </div>
                      {!disabled && form.tandaType === opt.id && <span className="text-brand-cyan text-xl flex-shrink-0">●</span>}
                    </motion.button>
                  )
                })}
              </div>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>{t('create.back')}</Button>
              <Button className="flex-1" onClick={goNext}>{t('create.continue')}</Button>
            </div>
          </motion.div>
        )}

        {/* Yield Strategy */}
        {stepId === 'strategy' && (
          <motion.div key="strategy" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-1">{t('create.chooseStrategy')}</h3>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-5">{t('create.strategySub')}</p>
              <div className="space-y-3">
                {YIELD_STRATEGIES.map(s => (
                  <motion.button key={s.id} onClick={() => upd('yieldStrategy', s.id)}
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      form.yieldStrategy === s.id ? 'border-brand-blue/60 dark:bg-brand-blue/10 bg-blue-50'
                      : 'dark:bg-brand-darker dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
                    <span className="text-2xl">{s.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold dark:text-white text-slate-900">{s.label}</span>
                        <Badge variant={s.badgeVariant}>{s.badge}</Badge>
                        <span className="text-xs font-bold text-emerald-400">{s.apy}</span>
                      </div>
                      <span className="text-xs dark:text-brand-muted text-slate-400">{s.note}</span>
                    </div>
                    {form.yieldStrategy === s.id && <span className="text-brand-cyan text-xl flex-shrink-0">●</span>}
                  </motion.button>
                ))}
              </div>
              <p className="text-xs dark:text-brand-muted text-slate-400 mt-4 italic">{t('create.apyDisclaimer')}</p>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>{t('create.back')}</Button>
              <Button className="flex-1" onClick={goNext} disabled={!form.yieldStrategy}>{t('create.continue')}</Button>
            </div>
          </motion.div>
        )}

        {/* Settings */}
        {stepId === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6 space-y-6">
              <h3 className="font-bold dark:text-white text-slate-900">{t('create.steps.settings')}</h3>
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-2">{t('create.podName')}</label>
                <input value={form.name} onChange={e => upd('name', e.target.value)}
                  placeholder="e.g. Pilsen Crew, Rodriguez Family…"
                  className="w-full px-4 py-2.5 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60" />
              </div>
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-2">{t('create.email')}</label>
                <input type="email" value={form.email} onChange={e => upd('email', e.target.value)}
                  placeholder={t('create.emailPlaceholder')}
                  className="w-full px-4 py-2.5 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60" />
                <p className="text-xs dark:text-brand-muted text-slate-400 mt-1.5">{t('create.emailHint')}</p>
              </div>
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-2">{t('create.contribution')}</label>
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="number"
                    min={tokCfg.min} max={tokCfg.max} step={tokCfg.step}
                    value={form.contribution}
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v >= tokCfg.min && v <= tokCfg.max) upd('contribution', v)
                    }}
                    className="w-32 px-3 py-2 rounded-xl text-sm font-bold dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-brand-cyan text-brand-blue outline-none focus:border-brand-blue/60 text-center"
                  />
                  <span className="text-sm font-bold dark:text-white text-slate-700">{form.token}</span>
                </div>
                <input type="range" min={tokCfg.min} max={tokCfg.max} step={tokCfg.step} value={form.contribution}
                  onChange={e => upd('contribution', parseFloat(e.target.value))} className="w-full accent-brand-blue" />
                <div className="flex justify-between text-xs dark:text-brand-muted text-slate-400 mt-1">
                  <span>{tokCfg.min} {form.token}</span>
                  <span>{tokCfg.max} {form.token}</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-2">
                  {t('create.groupSize', { n: form.size })}
                  {isYield && <span className="ml-2 text-brand-cyan normal-case font-normal">(min 12)</span>}
                </label>
                <input type="range" min={isYield ? 12 : 3} max="20" step="1" value={form.size}
                  onChange={e => upd('size', Number(e.target.value))} className="w-full accent-brand-blue" />
                <div className="flex justify-between text-xs dark:text-brand-muted text-slate-400 mt-1">
                  <span>{isYield ? 12 : 3}</span><span>20</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-2">
                  {t('create.frequency')}
                  {env === 'dev' && <span className="ml-2 text-amber-400 normal-case font-normal">(dev: stored as hours)</span>}
                </label>
                {isYield ? (
                  <div className="p-3 rounded-xl dark:bg-brand-blue/5 bg-blue-50 border dark:border-brand-blue/20 border-blue-200 text-xs dark:text-brand-text text-slate-700">
                    {t('create.yieldMonthlyOnly')}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {(env === 'dev' ? [
                      { days: 1,  label: '1 Hour',   sub: 'Test: 1 hr'  },
                      { days: 2,  label: '2 Hours',  sub: 'Test: 2 hrs' },
                      { days: 6,  label: '6 Hours',  sub: 'Test: 6 hrs' },
                    ] : [
                      { days: 7,  label: 'Weekly',   sub: 'Every 7 days'  },
                      { days: 14, label: 'Biweekly', sub: 'Every 14 days' },
                      { days: 30, label: 'Monthly',  sub: 'Every 30 days' },
                    ]).map(f => (
                      <button key={f.days} onClick={() => upd('frequencyDays', f.days)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${form.frequencyDays === f.days
                          ? 'border-brand-blue/60 dark:bg-brand-blue/10 bg-blue-50'
                          : 'dark:bg-brand-darker dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
                        <p className="font-semibold dark:text-white text-slate-900 text-xs">{f.label}</p>
                        <p className="text-[10px] dark:text-brand-muted text-slate-400 mt-0.5">{f.sub}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="dark:bg-brand-dark bg-slate-50 rounded-2xl p-4 grid grid-cols-2 gap-3">
                {[
                  [t('create.weeklyPot'), `${totalPot} ${form.token}`],
                  [t('create.duration'),  `${form.size} cycles`],
                  [t('create.toJoin'),    `${+(form.contribution * 2).toFixed(6)} ${form.token}`],
                  [t('create.network'),   form.chain],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-xs dark:text-brand-muted text-slate-400">{l}</p>
                    <p className="font-bold dark:text-white text-slate-900 text-sm">{v}</p>
                  </div>
                ))}
              </div>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>{t('create.back')}</Button>
              <Button className="flex-1" onClick={goNext} disabled={!form.name.trim()}>{t('create.continue')}</Button>
            </div>
          </motion.div>
        )}

        {/* Payout order */}
        {stepId === 'payout' && (
          <motion.div key="payout" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-4">{t('create.payoutOrder')}</h3>
              <div className="space-y-3">
                {[
                  { id: 'random',    label: t('create.random'),    desc: 'Slots assigned randomly at creation. Fairest option.' },
                  { id: 'fixed',     label: t('create.fixed'),     desc: 'You assign each member their payout week manually.' },
                  { id: 'volunteer', label: t('create.firstCome'), desc: 'Members claim their preferred slot first-come.' },
                ].map(o => (
                  <motion.button key={o.id} onClick={() => upd('payoutOrder', o.id)}
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                      form.payoutOrder === o.id ? 'border-brand-blue/60 dark:bg-brand-blue/10 bg-blue-50'
                      : 'dark:bg-brand-darker dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.payoutOrder === o.id ? 'bg-brand-blue border-brand-blue' : 'dark:border-brand-border border-slate-300'}`} />
                      <div>
                        <p className="font-semibold dark:text-white text-slate-900 text-sm">{o.label}</p>
                        <p className="text-xs dark:text-brand-muted text-slate-400 mt-0.5">{o.desc}</p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
              <p className="text-xs dark:text-brand-muted text-slate-400 mt-4 italic">{t('create.pilotNote')}</p>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>{t('create.back')}</Button>
              <Button className="flex-1" onClick={goNext}>{t('create.continue')}</Button>
            </div>
          </motion.div>
        )}

        {/* Review */}
        {stepId === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-4">
              <h3 className="font-bold dark:text-white text-slate-900 mb-5">{t('create.reviewDeploy')}</h3>
              <div className="space-y-0 mb-5">
                {[
                  ['Pod name',               form.name],
                  [t('create.network'),      form.chain],
                  ['Token',                  form.token],
                  [t('create.contribution'), `${form.contribution} ${form.token} / cycle`],
                  [t('how.members'),         `${form.size} people`],
                  [t('create.weeklyPot'),    `${totalPot} ${form.token}`],
                  [t('create.payoutOrder'),  form.payoutOrder],
                  ...(isYield ? [
                    [t('create.tandaType'),    t('create.typeYield')],
                    [t('create.yieldStrategy'), strategy?.label ?? '—'],
                    [t('create.estimatedApy'), strategy?.apy ?? '—'],
                  ] : []),
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-2.5 border-b dark:border-brand-border/40 border-slate-100 last:border-0">
                    <span className="text-sm dark:text-brand-muted text-slate-500">{l}</span>
                    <span className="font-semibold dark:text-white text-slate-900 text-sm">{v}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl dark:bg-brand-dark bg-slate-50 border dark:border-brand-border border-slate-200 p-4 mb-4">
                <p className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-3">{t('create.whatYouNeed')}</p>
                <div className="space-y-2">
                  {form.chain === 'Ethereum' && (
                    <div className="flex justify-between text-sm">
                      <span className="dark:text-brand-muted text-slate-500">{t('create.gas')}</span>
                      <span className="font-bold dark:text-white text-slate-900">~0.005 ETH</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="dark:text-brand-muted text-slate-500">{t('create.collateral')} (2×)</span>
                    <span className="font-bold dark:text-white text-slate-900">{form.contribution * 2} {form.token}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="dark:text-brand-muted text-slate-500">{t('create.firstContrib')}</span>
                    <span className="font-bold dark:text-white text-slate-900">{form.contribution} {form.token}</span>
                  </div>
                  {form.chain === 'XRPL' && env === 'live' && (
                    <div className="flex justify-between text-sm">
                      <span className="dark:text-brand-muted text-slate-500">{t('create.creationFee')}</span>
                      <span className="font-bold dark:text-white text-slate-900">${CREATION_FEE_USD} ({t('create.inXrp')}) · {t('create.nonRefundable')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm border-t dark:border-brand-border border-slate-200 pt-2 mt-2">
                    <span className="font-bold dark:text-white text-slate-900">{t('create.totalUpfront')}</span>
                    <span className="font-extrabold text-brand-cyan">{form.contribution * 3} {form.token}{form.chain === 'Ethereum' ? ' + gas' : ''}</span>
                  </div>
                </div>
                {form.chain === 'XRPL' && env === 'live' && (
                  <p className="text-xs dark:text-brand-muted text-slate-500 mt-3 pt-3 border-t dark:border-brand-border border-slate-200">
                    {t('create.creationFeeDisclosure', { fee: CREATION_FEE_USD })}
                  </p>
                )}
              </div>

              {/* Yield risk acknowledgments */}
              {isYield && (
                <div className="rounded-2xl dark:bg-amber-500/10 bg-amber-50 border border-amber-500/20 p-4 mb-4 space-y-3">
                  <p className="text-xs font-bold text-amber-400 mb-1">{t('create.yieldRiskTitle')}</p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.riskAck} onChange={e => upd('riskAck', e.target.checked)}
                      className="mt-0.5 accent-amber-400 flex-shrink-0" />
                    <span className="text-xs dark:text-brand-muted text-slate-600">{t('create.yieldRiskAck')}</span>
                  </label>
                  {form.yieldStrategy === 'amm' && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={form.ilAck} onChange={e => upd('ilAck', e.target.checked)}
                        className="mt-0.5 accent-amber-400 flex-shrink-0" />
                      <span className="text-xs dark:text-brand-muted text-slate-600">{t('create.yieldIlAck')}</span>
                    </label>
                  )}
                </div>
              )}

              {!isYield && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 mb-4">
                  <p className="text-xs font-bold text-amber-400 mb-2">{t('create.cancelPolicy')}</p>
                  <ul className="text-xs dark:text-brand-muted text-slate-500 space-y-1">
                    <li>• {t('create.cancelPolicy1')}</li>
                    <li>• {t('create.cancelPolicy2')}</li>
                    <li>• {t('create.cancelPolicy3')}</li>
                    <li>• {t('create.cancelPolicy4')}</li>
                  </ul>
                </div>
              )}

              <div className="p-3 rounded-xl dark:bg-brand-blue/5 bg-blue-50 border dark:border-brand-blue/20 border-blue-200 text-xs dark:text-brand-text text-slate-700">
                {form.chain === 'Ethereum' ? t('create.metaMaskNote') : t('create.xamanNote')}
              </div>
            </Card>

            {!wallet && <p className="text-sm text-amber-400 text-center mb-4">{t('create.connectPrompt')}</p>}
            {kycEnforced && wallet && kycStatus !== 'approved' && (
              <p className="text-sm text-amber-400 text-center mb-4">{t('create.rules.kycRequired')} — <button onClick={() => navigate('/app/kyc')} className="underline">{t('create.rules.kycBtn')}</button></p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>{t('create.back')}</Button>
              <Button className="flex-1" disabled={!wallet || !canDeployYield || (kycEnforced && kycStatus !== 'approved')} onClick={handleDeploy}>
                {t('create.deployBtn')}
              </Button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
