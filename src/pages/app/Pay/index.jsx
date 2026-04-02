import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import useAppStore from '@/store/useAppStore'
import { getPod, recordPayment, maybeAdvanceCycle, getUser } from '@/lib/db'
import { sendContribution, tandaPodContribute } from '@/lib/contracts'

function shareWa(text) { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') }
function shareTg(url, text) { window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank') }

export default function Pay() {
  const { id }          = useParams()
  const navigate        = useNavigate()
  const { t, i18n }    = useTranslation()
  const { env, wallet } = useAppStore()

  const [pod,     setPod]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [step,      setStep]      = useState('select')  // select | confirming | done
  const [method,    setMethod]    = useState(null)
  const [payError,  setPayError]  = useState(null)
  const [txHash,    setTxHash]    = useState(null)
  const [recipient, setRecipient] = useState(null)

  useEffect(() => {
    if (!id) return
    getPod(id).then(({ data }) => {
      setPod(data ?? null)
      setLoading(false)
    })
  }, [id])

  const podUrl  = `${window.location.origin}/app/pod/${id}`
  const podName = pod?.name ?? '…'
  const paidMsg = i18n.language === 'es'
    ? `✅ Pagué mi tanda esta semana — ${podName}\n👉 ${podUrl}`
    : `✅ Just paid my DeFi Tanda contribution — ${podName}\n👉 ${podUrl}`

  const handlePay = async (m) => {
    if (!pod || !wallet?.address) return
    setMethod(m)
    setStep('confirming')
    setPayError(null)
    setTxHash(null)

    // Look up the user record to get their UUID
    const { data: user } = await getUser(wallet.address)
    if (!user) {
      setPayError('Wallet not found — connect your wallet first.')
      setStep('select')
      return
    }

    // Find the payout recipient for this cycle
    const payoutMember = pod.pod_members?.find(m => m.payout_slot === pod.current_cycle)
    const recipientAddr = payoutMember?.user?.wallet_address
    const recipientAlias = payoutMember?.user?.alias ?? recipientAddr?.slice(0, 8)

    let txHashResult = null

    if (m === 'wallet') {
      if (!recipientAddr) {
        setPayError('Payout recipient not assigned yet — pod may not be fully active.')
        setStep('select')
        return
      }

      // If I am the payout recipient this cycle, skip the on-chain self-transfer.
      // The net math is the same: I receive from n-1 other members and don't pay myself.
      const iAmRecipient = wallet?.address?.toLowerCase() === recipientAddr?.toLowerCase()

      if (iAmRecipient) {
        txHashResult = 'self-recipient'
        setTxHash('self-recipient')
      } else {
        try {
          const result = await sendContribution(
            recipientAddr,
            pod.contribution_amount,
            pod.token,
            pod.chain,
            env,
          )
          txHashResult = result.txHash
          setTxHash(result.txHash)
        } catch (err) {
          setPayError(err?.message ?? 'Transaction failed.')
          setStep('select')
          return
        }
      }
    }
    // Apple Pay / Google Pay: fiat — record to DB, no on-chain tx yet

    setRecipient(recipientAlias)

    // Record the payment in the DB
    const { error: payErr } = await recordPayment({
      pod_id:  id,
      user_id: user.id,
      cycle:   pod.current_cycle,
      amount:  pod.contribution_amount,
      token:   pod.token,
      chain:   pod.chain,
      method:  m,
      tx_hash: txHashResult,
    })

    if (payErr) {
      setPayError(payErr.message)
      setStep('select')
      return
    }

    // If everyone has paid this cycle, advance to next cycle (or complete the pod)
    await maybeAdvanceCycle(id)

    setStep('done')
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 rounded-full border-2 border-brand-blue border-t-transparent animate-spin mx-auto" />
      </div>
    )
  }

  if (!pod) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">⚠</p>
        <h2 className="text-xl font-bold dark:text-white text-slate-900 mb-2">{t('pay.notFound')}</h2>
        <Button onClick={() => navigate('/app')}>{t('common.back')}</Button>
      </div>
    )
  }

  const shortAddr = wallet?.address ? `${wallet.address.slice(0,6)}…${wallet.address.slice(-4)}` : '—'

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <motion.button onClick={() => navigate(`/app/pod/${id}`)}
        className="text-sm dark:text-brand-muted text-slate-400 hover:text-brand-cyan mb-6 flex items-center gap-1"
        whileHover={{ x: -3 }}>
        {t('pay.back')}
      </motion.button>

      <AnimatePresence mode="wait">

        {/* ── SELECT PAYMENT METHOD ── */}
        {step === 'select' && (
          <motion.div key="select" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
            <Card hover={false} className="overflow-hidden">
              <div className="bg-gradient-brand p-6 text-white text-center">
                <p className="text-sm font-semibold opacity-80 mb-1">{pod.name}</p>
                <div className="text-5xl font-extrabold tracking-tight mb-1">
                  {pod.contribution_amount}
                  <span className="text-2xl opacity-70 ml-2">{pod.token}</span>
                </div>
                <p className="text-sm opacity-70">
                  {t('pod.cycle')} {pod.current_cycle} {t('pod.of')} {pod.total_cycles} · {pod.chain}
                  {env === 'dev' && ` · ${t('common.testnet')}`}
                </p>
                {(() => {
                  const rec = pod.pod_members?.find(m => m.payout_slot === pod.current_cycle)
                  const name = rec?.user?.alias ?? rec?.user?.wallet_address?.slice(0, 8)
                  return name ? (
                    <p className="text-xs mt-1 opacity-80">
                      {t('pod.potRecipient')} → <span className="font-bold">{name}</span>
                    </p>
                  ) : null
                })()}
              </div>

              <div className="p-6 space-y-3">

                <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                  onClick={() => handlePay('wallet')}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-brand-blue/50 text-brand-cyan font-bold text-base hover:bg-brand-blue/10 hover:border-brand-blue transition-all">
                  🔗 {t('pay.payFromWallet')}
                  <span className="text-xs font-normal dark:text-brand-muted text-slate-400">{shortAddr}</span>
                </motion.button>

                {payError && (
                  <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-xl p-3">{payError}</p>
                )}
                <p className="text-xs dark:text-brand-muted text-slate-400 text-center pt-1">
                  {t('pay.secured', { chain: pod.chain })}
                </p>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ── CONFIRMING ── */}
        {step === 'confirming' && (
          <motion.div key="confirming" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="text-center py-20">
            <motion.div className="w-24 h-24 rounded-full bg-gradient-brand mx-auto flex items-center justify-center shadow-glow mb-8"
              animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
              <span className="text-4xl">⚡</span>
            </motion.div>
            <h2 className="text-2xl font-extrabold dark:text-white text-slate-900 mb-2">{t('pay.processing')}</h2>
            <p className="dark:text-brand-muted text-slate-500 text-sm">{t('pay.confirming', { chain: pod.chain })}</p>
            <div className="flex justify-center gap-1 mt-6">
              {[0,1,2].map(i => (
                <motion.div key={i} className="w-2 h-2 rounded-full bg-brand-cyan"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.9, delay: i * 0.2, repeat: Infinity }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
            <Card hover={false} className="p-8 text-center">
              <motion.div className="w-24 h-24 rounded-full bg-gradient-brand mx-auto flex items-center justify-center mb-6 shadow-glow"
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}>
                <motion.span className="text-5xl"
                  initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}>✓</motion.span>
              </motion.div>

              <motion.h2 className="text-3xl font-extrabold dark:text-white text-slate-900 mb-2"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                {t('pay.confirmed')}
              </motion.h2>
              <motion.p className="dark:text-brand-muted text-slate-500 mb-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                {pod.contribution_amount} {pod.token} · {pod.chain}
              </motion.p>
              {recipient && (
                <motion.p className="text-sm text-emerald-400 font-semibold"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                  {t('pay.sentTo', { name: recipient })}
                </motion.p>
              )}
              {txHash && txHash !== 'self-recipient' && (
                <motion.p className="font-mono text-xs dark:text-brand-muted text-slate-400 mt-2 break-all px-4"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                  Tx: {txHash.slice(0, 20)}…{txHash.slice(-6)}
                </motion.p>
              )}

              <motion.div className="mt-8 space-y-3"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
                <p className="text-xs dark:text-brand-muted text-slate-400 font-semibold uppercase tracking-wider mb-3">{t('pay.shareYourWin')}</p>
                <div className="flex gap-3">
                  <Button size="sm" className="flex-1" disabled={env === 'dev'} onClick={() => shareWa(paidMsg)}>
                    <WaIcon /> WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={env === 'dev'} onClick={() => shareTg(podUrl, paidMsg)}>
                    <TgIcon /> Telegram
                  </Button>
                </div>
                {env === 'dev' && <p className="text-xs text-amber-500 text-center">{t('pay.sharingDisabled')}</p>}
              </motion.div>

              <motion.div className="mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/app/pod/${id}`)}>
                  {t('common.back')}
                </Button>
              </motion.div>
            </Card>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}


function WaIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.527 5.845L.057 23.876l6.155-1.463A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.804 9.804 0 01-5.003-1.37l-.357-.212-3.705.88.936-3.608-.232-.368A9.786 9.786 0 012.182 12C2.182 6.574 6.574 2.182 12 2.182S21.818 6.574 21.818 12 17.426 21.818 12 21.818z"/>
    </svg>
  )
}

function TgIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
    </svg>
  )
}
