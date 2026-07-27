import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import useAppStore from '@/store/useAppStore'
import { getPlatformSetting } from '@/lib/db'
import { IconCheck } from '@/components/ui/Icons'

const ADMINS = [
  { email: 'alice@defitanda.app', role: 'super_admin', name: 'Alice V.',  added: '2025-11-01', active: true  },
  { email: 'bob@defitanda.app',   role: 'super_admin', name: 'Bob T.',    added: '2025-11-01', active: true  },
  { email: 'carol@defitanda.app', role: 'super_admin', name: 'Carol R.',  added: '2025-12-01', active: true  },
  { email: 'dan@defitanda.app',   role: 'support',     name: 'Dan M.',    added: '2026-01-10', active: true  },
  { email: 'eve@defitanda.app',   role: 'finance',     name: 'Eve S.',    added: '2026-02-15', active: false },
]

const ROLE_COLORS = { super_admin: 'blue', support: 'yellow', ambassador_mgr: 'muted', finance: 'green' }

const stagger = { visible: { transition: { staggerChildren: 0.07 } } }
const item = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }

export default function AdminSettings() {
  const { adminUser } = useAppStore()
  const [creationFeeUsd, setCreationFeeUsd] = useState('5')
  const [minPool, setMinPool]         = useState('25000')
  const [gracePeriod, setGracePeriod] = useState('72')
  const [maxPodSize, setMaxPodSize]   = useState('20')
  const [saved, setSaved]             = useState(false)
  const [saveError, setSaveError]     = useState(null)
  const [kycRequired, setKycRequired] = useState(false)
  const [kycError, setKycError]       = useState(null)

  useEffect(() => {
    getPlatformSetting('kyc_required').then(v => setKycRequired(v === 'true'))
    getPlatformSetting('creation_fee_usd').then(v => { if (v != null) setCreationFeeUsd(v) })
  }, [])

  // Writes to platform_settings are service_role-only by RLS (migration 021)
  // — a direct client upsert (what this used to do via setPlatformSetting)
  // silently fails against that policy, so this goes through the
  // service-role-backed set-kyc-required function instead, same pattern as
  // set-platform-env.js / set-creation-fee.js. Reverts the optimistic toggle
  // if the call fails, rather than showing a state that never actually saved.
  async function handleKycToggle(val) {
    setKycRequired(val)
    setKycError(null)
    try {
      const supabaseModule = await import('@/lib/supabase')
      const { data: { session } } = await supabaseModule.default.auth.getSession()
      const res = await fetch('/.netlify/functions/set-kyc-required', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body:    JSON.stringify({ required: val }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`)
    } catch (e) {
      setKycRequired(!val)
      setKycError(e.message ?? 'Save failed.')
    }
  }

  // Only the Creation Fee is wired to a real setting today — Insurance Pool
  // Floor, Grace Period, and Max Pod Size below remain local-only display
  // values, same as before.
  //
  // Writes to platform_settings are service_role-only by RLS (migration 021)
  // — a direct client upsert would silently fail against that policy, so
  // this goes through the service-role-backed set-creation-fee function
  // instead, same pattern as set-platform-env.js.
  const handleSave = async () => {
    setSaveError(null)
    const parsed = parseFloat(creationFeeUsd)
    if (isNaN(parsed) || parsed <= 0) {
      setSaveError('Creation fee must be a positive number.')
      return
    }
    try {
      const supabaseModule = await import('@/lib/supabase')
      const { data: { session } } = await supabaseModule.default.auth.getSession()
      const res = await fetch('/.netlify/functions/set-creation-fee', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body:    JSON.stringify({ feeUsd: parsed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e.message ?? 'Save failed.')
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Settings</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">Platform configuration · super_admin only</p>
      </div>

      {/* Protocol parameters */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card hover={false} className="p-6">
          <h2 className="font-bold dark:text-white text-slate-900 mb-5">Protocol Parameters</h2>
          <div className="grid lg:grid-cols-2 gap-5">
            {[
              { label: 'Creation Fee (USD)',          val: creationFeeUsd, set: setCreationFeeUsd, hint: 'Charged per live-XRPL pod at creation, paid in XRP at market price. Free on testnet.' },
              { label: 'Insurance Pool Floor (USD)',   val: minPool,     set: setMinPool,     hint: 'Global minimum. Alert triggers below this.'  },
              { label: 'Grace Period (hours)',         val: gracePeriod, set: setGracePeriod, hint: 'First-time missed payment forgiveness window.' },
              { label: 'Max Pod Size (members)',       val: maxPodSize,  set: setMaxPodSize,  hint: 'Maximum members allowed in a single pod.'     },
            ].map(({ label, val, set, hint }) => (
              <div key={label}>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-1.5">{label}</label>
                <input
                  value={val} onChange={e => set(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 outline-none focus:border-brand-blue/60"
                />
                <p className="text-xs dark:text-brand-muted text-slate-400 mt-1">{hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-4">
            <motion.button
              onClick={handleSave}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="px-6 py-2.5 rounded-xl bg-gradient-brand text-white font-bold text-sm shadow-glow-sm hover:shadow-glow transition-all"
            >
              {saved ? <span className="inline-flex items-center gap-1.5"><IconCheck className="w-4 h-4" /> Saved</span> : 'Save Changes'}
            </motion.button>
            <p className="text-xs dark:text-brand-muted text-slate-400">
              {saveError ? <span className="text-red-400">{saveError}</span> : 'Only Creation Fee is live-saved today — the other fields above are display-only for now.'}
            </p>
          </div>
        </Card>
      </motion.div>

      {/* Feature flags */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card hover={false} className="p-6">
          <h2 className="font-bold dark:text-white text-slate-900 mb-5">Feature Flags</h2>
          <div className="space-y-4">
            {/* KYC — live, DB-backed */}
            <div className="flex items-center justify-between py-3 border-b dark:border-brand-border/40 border-slate-100">
              <div>
                <p className="text-sm font-semibold dark:text-white text-slate-900">Require KYC to create / join</p>
                <p className="text-xs dark:text-brand-muted text-slate-400">
                  {kycRequired ? 'Users must be KYC-approved before creating or joining a tanda.' : 'KYC off — anyone with a wallet can create or join.'}
                </p>
                {kycError && <p className="text-xs text-red-400 mt-1">{kycError}</p>}
              </div>
              <ToggleSwitch on={kycRequired} onChange={handleKycToggle} />
            </div>

            {[
              { label: 'Bid-Order Payout',       on: false, locked: true,  note: 'Disabled pending legal review' },
              { label: 'Stripe Onramp',           on: true,  locked: false, note: 'Apple Pay / Google Pay → USDC'  },
              { label: 'MoonPay Fallback',        on: false, locked: false, note: 'XRP / RLUSD fiat entry'         },
              { label: 'Ambassador Program',      on: true,  locked: false, note: 'Applications open'              },
              { label: 'Akademia Lessons',        on: false, locked: false, note: 'Sprint 4 — not yet built'       },
              { label: 'WhatsApp Notifications',  on: false, locked: false, note: 'Requires Twilio API key'        },
            ].map(f => (
              <div key={f.label} className="flex items-center justify-between py-3 border-b dark:border-brand-border/40 border-slate-100 last:border-0">
                <div>
                  <p className="text-sm font-semibold dark:text-white text-slate-900">{f.label}</p>
                  <p className="text-xs dark:text-brand-muted text-slate-400">{f.note}</p>
                </div>
                <div className="flex items-center gap-3">
                  {f.locked && <Badge variant="muted">Locked</Badge>}
                  <ToggleSwitch on={f.on} disabled={f.locked} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Team / admin roles */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card hover={false} className="overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-brand-border border-slate-200 flex items-center justify-between">
            <h2 className="font-bold dark:text-white text-slate-900">Admin Team</h2>
            <button className="text-xs text-brand-cyan font-semibold hover:underline">+ Invite Admin</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-brand-border border-slate-200">
                  {['Name','Email','Role','Added','Status',''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody variants={stagger} initial="hidden" animate="visible">
                {ADMINS.map(a => (
                  <motion.tr
                    key={a.email}
                    variants={item}
                    className="border-b dark:border-brand-border/40 border-slate-100 last:border-0"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold">
                          {a.name[0]}
                        </div>
                        <span className="font-semibold dark:text-white text-slate-900">{a.name}</span>
                        {a.email === (adminUser?.email ?? 'alice@defitanda.app') && (
                          <Badge variant="blue">You</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{a.email}</td>
                    <td className="px-5 py-4"><Badge variant={ROLE_COLORS[a.role] ?? 'muted'}>{a.role}</Badge></td>
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{a.added}</td>
                    <td className="px-5 py-4"><Badge variant={a.active ? 'green' : 'muted'}>{a.active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="px-5 py-4">
                      {a.role !== 'super_admin' && (
                        <button className="text-xs dark:text-brand-muted text-slate-400 hover:text-red-400 transition-colors">Remove</button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* Danger zone */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card hover={false} className="p-6 border dark:border-red-500/20 border-red-200">
          <h2 className="font-bold text-red-400 mb-4">Danger Zone</h2>
          <div className="space-y-4">
            {[
              { label: 'Emergency Pause — All Pods',     btn: 'Pause All',     danger: true  },
              { label: 'Export Full User Database',       btn: 'Export',        danger: false },
              { label: 'Reset Staging Environment',       btn: 'Reset Staging', danger: false },
            ].map(a => (
              <div key={a.label} className="flex items-center justify-between py-3 border-b dark:border-brand-border/30 border-slate-100 last:border-0">
                <p className="text-sm dark:text-brand-text text-slate-700">{a.label}</p>
                <button className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${a.danger ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20' : 'dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 hover:opacity-80'}`}>
                  {a.btn}
                </button>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

function ToggleSwitch({ on, disabled, onChange }) {
  const [enabled, setEnabled] = useState(on)

  useEffect(() => { setEnabled(on) }, [on])

  function handleClick() {
    if (disabled) return
    const next = !enabled
    setEnabled(next)
    onChange?.(next)
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${enabled ? 'bg-gradient-brand' : 'dark:bg-brand-border bg-slate-300'}`}
    >
      <motion.span
        animate={{ x: enabled ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
      />
    </button>
  )
}
