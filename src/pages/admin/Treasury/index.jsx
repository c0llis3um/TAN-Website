import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetTreasuryWallets, adminGetTreasuryProposals, adminCreateTreasuryProposal, adminUpsertTreasuryWallet } from '@/lib/db'
import { setFactoryTreasury } from '@/lib/contracts'
import useAppStore from '@/store/useAppStore'

const CHAIN_META = {
  XRPL:     { label: 'XRP Ledger',      icon: '🔵', color: '#006aff' },
  Ethereum: { label: 'Ethereum',        icon: '🟣', color: '#627EEA' },
  Solana:   { label: 'Solana',          icon: '💜', color: '#9945FF' },
}

const stagger = { visible: { transition: { staggerChildren: 0.08 } } }
const item    = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }

export default function AdminTreasury() {
  const adminUser                       = useAppStore(s => s.adminUser)
  const [wallets,   setWallets]         = useState([])
  const [proposals, setProposals]       = useState([])
  const [loading,   setLoading]         = useState(true)
  const [changeModal, setChangeModal]   = useState(null)
  const [copied,    setCopied]          = useState(null)

  useEffect(() => {
    Promise.all([adminGetTreasuryWallets(), adminGetTreasuryProposals()])
      .then(([{ data: w }, { data: p }]) => {
        setWallets(w ?? [])
        setProposals(p ?? [])
        setLoading(false)
      })
  }, [])

  const handleCopy = (addr, chain) => {
    navigator.clipboard.writeText(addr)
    setCopied(chain)
    setTimeout(() => setCopied(null), 1800)
  }

  const handleSaved = (updatedWallet) => {
    setWallets(prev => {
      const idx = prev.findIndex(w => w.chain === updatedWallet.chain)
      return idx >= 0
        ? prev.map((w, i) => i === idx ? updatedWallet : w)
        : [...prev, updatedWallet]
    })
  }

  const handleProposalCreated = (p) => setProposals(prev => [p, ...prev])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Treasury Wallets</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">
          Fee-collection wallet per chain · Changes are logged as proposals
        </p>
      </div>

      {/* Info banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-2xl border dark:bg-brand-blue/5 bg-blue-50 dark:border-brand-blue/20 border-blue-200 flex items-start gap-3"
      >
        <span className="text-xl mt-0.5">🔒</span>
        <div className="text-sm dark:text-brand-text text-slate-700">
          <span className="font-bold">These are the wallets where pod creation fees are collected.</span>{' '}
          Each chain has one active wallet. Changes are recorded in the proposal log below.
        </div>
      </motion.div>

      {/* Wallet cards */}
      {loading ? (
        <div className="grid lg:grid-cols-3 gap-5">
          {[1,2,3].map(i => <div key={i} className="h-56 rounded-2xl dark:bg-brand-mid bg-slate-100 animate-pulse" />)}
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid lg:grid-cols-3 gap-5">
          {/* Show existing wallets */}
          {wallets.map(w => {
            const meta = CHAIN_META[w.chain] ?? { label: w.chain, icon: '🔗', color: '#5a8a9f' }
            return (
              <motion.div key={w.chain} variants={item}>
                <Card hover={false} className="p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${meta.color}20` }}>
                      {meta.icon}
                    </div>
                    <div>
                      <p className="font-bold dark:text-white text-slate-900 text-sm">{meta.label}</p>
                      <Badge variant={w.chain === 'XRPL' ? 'blue' : 'muted'} className="mt-0.5">{w.chain}</Badge>
                    </div>
                    {w.active && <Badge variant="green" className="ml-auto">Active</Badge>}
                  </div>

                  <div className="dark:bg-brand-dark bg-slate-50 rounded-xl p-3 mb-4">
                    <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">Fee Wallet Address</p>
                    <p className="font-mono text-xs dark:text-brand-text text-slate-700 break-all leading-relaxed">{w.address}</p>
                  </div>

                  {w.label && <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">{w.label}</p>}
                  <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">
                    Set by: {w.set_by_admin?.email ?? '—'} · {new Date(w.created_at).toLocaleDateString()}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(w.address, w.chain)}
                      className="flex-1 py-2 rounded-xl dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 text-xs font-semibold hover:opacity-80 transition-opacity"
                    >
                      {copied === w.chain ? '✓ Copied' : 'Copy Address'}
                    </button>
                    <button
                      onClick={() => setChangeModal({ mode: 'change', chain: w.chain, currentAddress: w.address, label: meta.label })}
                      className="flex-1 py-2 rounded-xl bg-brand-blue/10 text-brand-cyan border border-brand-blue/30 text-xs font-semibold hover:bg-brand-blue/20 transition-colors"
                    >
                      Update
                    </button>
                  </div>
                </Card>
              </motion.div>
            )
          })}

          {/* Add wallet button for chains not yet configured */}
          {Object.keys(CHAIN_META).filter(c => !wallets.find(w => w.chain === c)).map(chain => {
            const meta = CHAIN_META[chain]
            return (
              <motion.div key={chain} variants={item}>
                <Card hover={false} className="p-6 border-dashed opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => setChangeModal({ mode: 'add', chain, currentAddress: '', label: meta.label })}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${meta.color}20` }}>
                      {meta.icon}
                    </div>
                    <div>
                      <p className="font-bold dark:text-white text-slate-900 text-sm">{meta.label}</p>
                      <Badge variant="muted">Not configured</Badge>
                    </div>
                  </div>
                  <p className="text-sm dark:text-brand-muted text-slate-400 text-center py-4">
                    + Add {chain} treasury wallet
                  </p>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Proposal / Change history */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card hover={false} className="overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-brand-border border-slate-200">
            <h3 className="font-bold dark:text-white text-slate-900">Change Proposals</h3>
            <p className="text-xs dark:text-brand-muted text-slate-400 mt-0.5">Log of all treasury wallet change requests</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-brand-border border-slate-200">
                  {['Date','Chain','Proposed Address','Reason','Proposed By','Status'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center dark:text-brand-muted text-slate-400">Loading…</td></tr>
                ) : proposals.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center dark:text-brand-muted text-slate-400">No proposals yet.</td></tr>
                ) : proposals.map((p, i) => (
                  <motion.tr key={p.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.04 * i }}
                    className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/30 hover:bg-slate-50">
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-4"><Badge variant={p.chain === 'XRPL' ? 'blue' : 'muted'}>{p.chain}</Badge></td>
                    <td className="px-5 py-4 font-mono text-xs dark:text-brand-muted text-slate-400 max-w-[160px] truncate">{p.proposed_address}</td>
                    <td className="px-5 py-4 text-xs dark:text-brand-text text-slate-600 max-w-[200px] truncate">{p.reason}</td>
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{p.proposed_by_admin?.email ?? '—'}</td>
                    <td className="px-5 py-4"><Badge variant={p.status === 'APPROVED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'yellow'}>{p.status}</Badge></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {changeModal && (
        <WalletModal
          mode={changeModal.mode}
          chain={changeModal.chain}
          chainLabel={changeModal.label}
          currentAddress={changeModal.currentAddress}
          adminId={adminUser?.id}
          onClose={() => setChangeModal(null)}
          onSaved={handleSaved}
          onProposalCreated={handleProposalCreated}
        />
      )}
    </div>
  )
}

function WalletModal({ mode, chain, chainLabel, currentAddress, adminId, onClose, onSaved, onProposalCreated }) {
  const { env }                   = useAppStore()
  const [newAddr,   setNewAddr]   = useState('')
  const [reason,    setReason]    = useState('')
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')
  const [onChainTx, setOnChainTx] = useState(null)

  const isAdd = mode === 'add'

  const handleSubmit = async () => {
    if (!newAddr.trim()) return
    if (!isAdd && !reason.trim()) return
    setSaving(true)
    setError('')

    // For Ethereum: update treasury on-chain first
    if (chain === 'Ethereum') {
      try {
        const { txHash } = await setFactoryTreasury(newAddr.trim(), env)
        setOnChainTx(txHash)
      } catch (err) {
        setError(`On-chain update failed: ${err?.message ?? err}. Make sure you are the factory owner and MetaMask is connected.`)
        setSaving(false)
        return
      }
    }

    // Always log a proposal
    const { data: proposal, error: propErr } = await adminCreateTreasuryProposal(chain, newAddr.trim(), reason.trim() || 'Initial setup', adminId)
    if (propErr) { setError(propErr.message); setSaving(false); return }

    // Immediately apply (no approval workflow for now)
    const { data: wallet, error: walletErr } = await adminUpsertTreasuryWallet(chain, newAddr.trim(), chainLabel, adminId)
    if (walletErr) { setError(walletErr.message); setSaving(false); return }

    if (proposal) onProposalCreated({ ...proposal, status: 'APPROVED' })
    if (wallet) onSaved(wallet)
    setSaving(false)
    setDone(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 shadow-glow"
      >
        {!done ? (
          <>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-extrabold dark:text-white text-slate-900">
                  {isAdd ? 'Add Treasury Wallet' : 'Update Treasury Wallet'}
                </h2>
                <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">{chainLabel} · {chain}</p>
              </div>
              <button onClick={onClose} className="text-2xl dark:text-brand-muted text-slate-400 hover:text-red-400 transition-colors leading-none">×</button>
            </div>

            <div className="space-y-4 mb-6">
              {!isAdd && (
                <div>
                  <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-1.5">Current Address</label>
                  <p className="font-mono text-xs dark:text-brand-text text-slate-600 dark:bg-brand-dark bg-slate-50 p-3 rounded-xl break-all">{currentAddress}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-1.5">
                  {isAdd ? 'Wallet Address' : 'New Address'}
                </label>
                <input
                  value={newAddr} onChange={e => setNewAddr(e.target.value)}
                  placeholder={`${chain} wallet address…`}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-mono dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60"
                />
              </div>
              {!isAdd && (
                <div>
                  <label className="text-xs font-bold dark:text-brand-muted text-slate-500 block mb-1.5">Reason for change</label>
                  <textarea
                    value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="Why is this address being updated?"
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60 resize-none"
                  />
                </div>
              )}
              {error && <p className="text-xs text-red-400 dark:bg-red-500/10 bg-red-50 p-3 rounded-xl">{error}</p>}
            </div>

            <div className="p-3 rounded-xl dark:bg-amber-500/10 bg-amber-50 dark:border-amber-500/20 border border-amber-200 text-xs dark:text-amber-400 text-amber-600 mb-5">
              ⚠ This address will receive all {chain} creation fees immediately after saving.
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 text-sm font-semibold hover:opacity-80">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !newAddr.trim() || (!isAdd && !reason.trim())}
                className="flex-1 py-3 rounded-2xl bg-gradient-brand text-white text-sm font-bold shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save Wallet'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-extrabold dark:text-white text-slate-900 mb-2">Wallet Saved</h2>
            <p className="text-sm dark:text-brand-muted text-slate-500 mb-2">
              The {chain} treasury wallet has been updated. All future fees will go to the new address.
            </p>
            {onChainTx && (
              <p className="text-xs font-mono dark:text-brand-muted text-slate-400 mb-4 break-all px-2">
                On-chain tx: {onChainTx.slice(0,20)}…{onChainTx.slice(-6)}
              </p>
            )}
            <button onClick={onClose} className="px-8 py-3 rounded-2xl bg-gradient-brand text-white font-bold text-sm shadow-glow-sm">
              Close
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
