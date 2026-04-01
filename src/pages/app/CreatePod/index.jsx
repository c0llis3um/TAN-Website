import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import useAppStore from '@/store/useAppStore'
import { createPod, upsertUser, updatePodContract } from '@/lib/db'
import { deployPodEVM } from '@/lib/contracts'

// ── Config ───────────────────────────────────────────────────

const CHAINS = [
  { id: 'Ethereum', label: 'Ethereum',   icon: '🔷', note: 'Secure · Widely supported'      },
  { id: 'XRPL',    label: 'XRP Ledger', icon: '🔵', note: 'Very low fees · Fast · RLUSD'   },
]

// Tokens available per chain
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

const STEP_LABELS  = ['Chain', 'Token', 'Settings', 'Payout', 'Review']

const DEPLOY_STEPS = [
  { key: 'save',    label: 'Saving pod to database…'   },
  { key: 'approve', label: 'Confirm in wallet…'         },
  { key: 'confirm', label: 'Waiting for confirmation…' },
  { key: 'done',    label: 'Pod created!'              },
]

export default function CreatePod() {
  const navigate = useNavigate()
  const { env, wallet } = useAppStore()

  const defaultChain = wallet?.chain === 'Ethereum' ? 'Ethereum' : 'XRPL'

  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    chain:             defaultChain,
    token:             CHAIN_TOKENS[defaultChain]?.[0]?.id ?? 'ETH',
    contribution:      defaultChain === 'Ethereum' ? 0.01 : 10,
    size:              6,
    payoutOrder:       'random',
    name:              '',
    frequencyDays:     7,   // 7=weekly, 14=biweekly, 30=monthly
  })

  const [deploying,  setDeploying]  = useState(false)
  const [deployStep, setDeployStep] = useState(null)
  const [error,      setError]      = useState(null)
  const [result,     setResult]     = useState(null)

  const upd      = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const tokens   = CHAIN_TOKENS[form.chain] ?? []
  const totalPot = +(form.contribution * form.size).toFixed(6)
  const upfront  = +(form.contribution * 3).toFixed(6)

  // Per-token contribution config
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

  // When chain changes, reset token + contribution default
  function handleChainChange(chain) {
    const firstToken = CHAIN_TOKENS[chain]?.[0]?.id ?? 'ETH'
    const cfg = TOKEN_CONFIG[firstToken] ?? TOKEN_CONFIG.USDC
    setForm(f => ({ ...f, chain, token: firstToken, contribution: cfg.min * 10 }))
  }

  function handleTokenChange(token) {
    const cfg = TOKEN_CONFIG[token] ?? TOKEN_CONFIG.USDC
    setForm(f => ({ ...f, token, contribution: cfg.min * 10 }))
  }

  // ── Deploy ───────────────────────────────────────────────────
  const handleDeploy = async () => {
    setDeploying(true)
    setError(null)

    let podId = null

    try {
      if (!wallet?.address) throw new Error('Connect your wallet first.')

      // ── 1. Save to DB ────────────────────────────────────────
      setDeployStep('save')

      const { data: user, error: uErr } = await upsertUser({
        wallet_address: wallet.address,
        chain:          wallet.chain ?? 'Ethereum',
        lang:           'es',
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
      })
      if (pErr) throw new Error(`Could not save pod: ${pErr.message}`)
      if (!pod?.id) throw new Error('Pod not returned — check Supabase grants (migration 010).')

      podId = pod.id

      // ── 2. Deploy on-chain ───────────────────────────────────
      setDeployStep('approve')
      let contractResult = { simulated: true, txHash: null, contractAddress: null }

      try {
        if (form.chain === 'Ethereum') {
          contractResult = await deployPodEVM({
            name:         form.name,
            size:         form.size,
            token:        form.token,
            payoutMethod: form.payoutOrder,
            env,
          })
        }
        // XRPL: handled via xrpl.js escrow at join time
      } catch (chainErr) {
        await updatePodContract(podId, { status: 'FAILED' }).catch(() => {})
        throw chainErr
      }

      // ── 3. Update pod record ─────────────────────────────────
      setDeployStep('confirm')

      let dbErr = null
      for (let i = 1; i <= 3; i++) {
        const { error } = await updatePodContract(podId, {
          contract_address:  contractResult.contractAddress,
          creation_fee_tx:   contractResult.txHash,
          creation_fee_paid: !contractResult.simulated,
          status:            'OPEN',
          deployed_at:       contractResult.simulated ? null : new Date().toISOString(),
        })
        if (!error) { dbErr = null; break }
        dbErr = error
        await new Promise(r => setTimeout(r, i * 800))
      }

      if (dbErr) {
        console.error('[deploy] DB update failed', { podId, txHash: contractResult.txHash, dbErr })
      }

      setDeployStep('done')
      setResult({ podId, txHash: contractResult.txHash, simulated: contractResult.simulated })
      setTimeout(() => navigate(`/app/pod/${podId}`), 1800)

    } catch (err) {
      console.error('[deploy]', err)
      setError(err?.message ?? 'Deployment failed.')
      // Stay in overlay — user reads the error, then clicks Try again
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
              <h2 className="text-2xl font-extrabold dark:text-white text-slate-900 mb-2">Tanda Created!</h2>
              {result.simulated && <p className="text-xs text-amber-400 mb-2">Simulated — no factory deployed yet</p>}
              {result.txHash && <p className="font-mono text-xs dark:text-brand-muted text-slate-400 break-all">{result.txHash.slice(0, 20)}…</p>}
              <p className="text-sm dark:text-brand-muted text-slate-500 mt-3">Redirecting to your pod…</p>
            </motion.div>

          ) : error ? (
            <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 mx-auto flex items-center justify-center mb-5">
                <span className="text-3xl">⚠</span>
              </div>
              <h2 className="text-xl font-extrabold dark:text-white text-slate-900 mb-3">Something went wrong</h2>
              <div className="p-4 rounded-2xl dark:bg-red-500/10 bg-red-50 border border-red-500/20 text-sm text-red-400 text-left mb-5">
                {error}
              </div>
              <button onClick={resetDeploy}
                className="w-full py-3 rounded-2xl dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 font-semibold text-sm hover:opacity-80 transition-opacity">
                ← Try again
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
        ← Back
      </motion.button>

      <div className="mb-8">
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900 mb-1">Create a Tanda</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500">
          Small ETH fee to deploy · {env === 'dev' ? 'Testnet' : 'Mainnet'}
          {!wallet && <span className="ml-2 text-amber-400">· Connect wallet to deploy</span>}
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center flex-shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              i === step ? 'bg-gradient-brand text-white'
              : i < step ? 'dark:text-emerald-400 text-emerald-600'
              : 'dark:text-brand-muted text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                i === step ? 'bg-white/20' : i < step ? 'bg-emerald-400 text-white' : 'dark:bg-brand-border bg-slate-200'}`}>
                {i < step ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && <div className="w-4 h-px dark:bg-brand-border bg-slate-300 mx-1 flex-shrink-0" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* Step 0 — Chain */}
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-4">Choose Blockchain</h3>
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
                        {c.id === 'Ethereum' && wallet?.chain === 'Ethereum' && <Badge variant="blue">Connected</Badge>}
                      </div>
                      <span className="text-xs dark:text-brand-muted text-slate-400">{c.note}</span>
                    </div>
                    {form.chain === c.id && <span className="text-brand-cyan text-xl flex-shrink-0">●</span>}
                  </motion.button>
                ))}
              </div>
            </Card>
            <Button className="w-full" onClick={() => setStep(1)}>Continue →</Button>
          </motion.div>
        )}

        {/* Step 1 — Token */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-2">What will your tanda use?</h3>
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">
                All members contribute and receive payouts in this token.
              </p>
              <div className="space-y-3">
                {tokens.map(t => (
                  <motion.button key={t.id} onClick={() => handleTokenChange(t.id)}
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      form.token === t.id ? 'border-brand-blue/60 dark:bg-brand-blue/8 bg-blue-50'
                      : 'dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
                    <span className="text-2xl">{t.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold dark:text-white text-slate-900">{t.label}</span>
                        {(t.id === 'USDC' || t.id === 'RLUSD') && <Badge variant="green">Stable</Badge>}
                        {(t.id === 'ETH' || t.id === 'XRP')    && <Badge variant="muted">Native</Badge>}
                      </div>
                      <span className="text-xs dark:text-brand-muted text-slate-400">{t.note}</span>
                    </div>
                    {form.token === t.id && <span className="text-brand-cyan text-xl flex-shrink-0">●</span>}
                  </motion.button>
                ))}
              </div>

              {(form.token === 'ETH' || form.token === 'XRP') && (
                <div className="mt-4 p-3 rounded-xl dark:bg-amber-500/8 bg-amber-50 border border-amber-500/20 text-xs text-amber-500">
                  Native tokens fluctuate in price. All members share the same price exposure — when ETH goes up, everyone wins together.
                </div>
              )}
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(0)}>← Back</Button>
              <Button className="flex-1" onClick={() => setStep(2)}>Continue →</Button>
            </div>
          </motion.div>
        )}

        {/* Step 2 — Settings */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6 space-y-6">
              <h3 className="font-bold dark:text-white text-slate-900">Pod Settings</h3>
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-2">Pod Name</label>
                <input value={form.name} onChange={e => upd('name', e.target.value)}
                  placeholder="e.g. Pilsen Crew, Rodriguez Family…"
                  className="w-full px-4 py-2.5 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60" />
              </div>
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-2">Contribution per cycle</label>
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
                  Members: <span className="text-brand-cyan font-extrabold">{form.size} people</span>
                </label>
                <input type="range" min="3" max="20" step="1" value={form.size}
                  onChange={e => upd('size', Number(e.target.value))} className="w-full accent-brand-blue" />
                <div className="flex justify-between text-xs dark:text-brand-muted text-slate-400 mt-1"><span>3</span><span>20</span></div>
              </div>
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-2">
                  Payment Frequency
                  {env === 'dev' && <span className="ml-2 text-amber-400 normal-case font-normal">(dev: stored as hours)</span>}
                </label>
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
                        ? 'border-brand-blue/60 dark:bg-brand-blue/8 bg-blue-50'
                        : 'dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
                      <p className="font-semibold dark:text-white text-slate-900 text-xs">{f.label}</p>
                      <p className="text-[10px] dark:text-brand-muted text-slate-400 mt-0.5">{f.sub}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="dark:bg-brand-dark bg-slate-50 rounded-2xl p-4 grid grid-cols-2 gap-3">
                {[
                  ['Total pot',   `${totalPot} ${form.token}`],
                  ['Duration',    `${form.size} cycles`],
                  ['To join',     `${upfront} ${form.token}`],
                  ['Network',     form.chain],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-xs dark:text-brand-muted text-slate-400">{l}</p>
                    <p className="font-bold dark:text-white text-slate-900 text-sm">{v}</p>
                  </div>
                ))}
              </div>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
              <Button className="flex-1" onClick={() => setStep(3)} disabled={!form.name.trim()}>Continue →</Button>
            </div>
          </motion.div>
        )}

        {/* Step 3 — Payout order */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-6">
              <h3 className="font-bold dark:text-white text-slate-900 mb-4">Payout Order</h3>
              <div className="space-y-3">
                {[
                  { id: 'random',    label: 'Random Draw',    desc: 'Slots assigned randomly at creation. Fairest option.' },
                  { id: 'fixed',     label: 'Organizer Sets', desc: 'You assign each member their payout week manually.' },
                  { id: 'volunteer', label: 'First Come',     desc: 'Members claim their preferred slot first-come.' },
                ].map(o => (
                  <motion.button key={o.id} onClick={() => upd('payoutOrder', o.id)}
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                      form.payoutOrder === o.id ? 'border-brand-blue/60 dark:bg-brand-blue/8 bg-blue-50'
                      : 'dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/30 hover:border-brand-blue/30'}`}>
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
              <p className="text-xs dark:text-brand-muted text-slate-400 mt-4 italic">Bid-order (auction) disabled during pilot.</p>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
              <Button className="flex-1" onClick={() => setStep(4)}>Continue →</Button>
            </div>
          </motion.div>
        )}

        {/* Step 4 — Review */}
        {step === 4 && (
          <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card hover={false} className="p-6 mb-4">
              <h3 className="font-bold dark:text-white text-slate-900 mb-5">Review & Deploy</h3>
              <div className="space-y-0 mb-5">
                {[
                  ['Pod name',     form.name],
                  ['Network',      form.chain],
                  ['Token',        form.token],
                  ['Contribution', `${form.contribution} ${form.token} / cycle`],
                  ['Members',      `${form.size} people`],
                  ['Total pot',    `${totalPot} ${form.token}`],
                  ['Payout order', form.payoutOrder],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-2.5 border-b dark:border-brand-border/40 border-slate-100 last:border-0">
                    <span className="text-sm dark:text-brand-muted text-slate-500">{l}</span>
                    <span className="font-semibold dark:text-white text-slate-900 text-sm">{v}</span>
                  </div>
                ))}
              </div>

              {/* Cost breakdown */}
              <div className="rounded-2xl dark:bg-brand-dark bg-slate-50 border dark:border-brand-border border-slate-200 p-4 mb-4">
                <p className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-3">What you'll need</p>
                <div className="space-y-2">
                  {form.chain === 'Ethereum' && (
                    <div className="flex justify-between text-sm">
                      <span className="dark:text-brand-muted text-slate-500">Gas to deploy contract</span>
                      <span className="font-bold dark:text-white text-slate-900">~0.005 ETH</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="dark:text-brand-muted text-slate-500">Collateral to join (2×)</span>
                    <span className="font-bold dark:text-white text-slate-900">{form.contribution * 2} {form.token}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="dark:text-brand-muted text-slate-500">First contribution</span>
                    <span className="font-bold dark:text-white text-slate-900">{form.contribution} {form.token}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t dark:border-brand-border border-slate-200 pt-2 mt-2">
                    <span className="font-bold dark:text-white text-slate-900">Total upfront to join</span>
                    <span className="font-extrabold text-brand-cyan">{form.contribution * 3} {form.token}{form.chain === 'Ethereum' ? ' + gas' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Refund policy */}
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 mb-4">
                <p className="text-xs font-bold text-amber-400 mb-2">⚠ What if the pod doesn't fill?</p>
                <ul className="text-xs dark:text-brand-muted text-slate-500 space-y-1">
                  <li>• You (the organizer) can cancel the pod anytime before it fills</li>
                  <li>• All members who joined get their full collateral back automatically</li>
                  <li>• The gas fee to deploy is not refundable</li>
                  <li>• No one loses their contribution — the pot never forms until the pod is full</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl dark:bg-brand-blue/5 bg-blue-50 border dark:border-brand-blue/20 border-blue-200 text-xs dark:text-brand-text text-slate-700">
                {form.chain === 'Ethereum'
                  ? '🔒 MetaMask will ask you to confirm one transaction. No token approvals needed.'
                  : '🔒 Xaman will confirm the transaction on the XRP Ledger.'}
              </div>
            </Card>

            {!wallet && <p className="text-sm text-amber-400 text-center mb-4">Connect your wallet to deploy.</p>}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)}>← Back</Button>
              <Button className="flex-1" disabled={!wallet} onClick={handleDeploy}>
                Deploy Tanda →
              </Button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
