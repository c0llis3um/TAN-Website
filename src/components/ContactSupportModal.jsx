import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import useAppStore from '@/store/useAppStore'
import { IconBadge, IconCheck } from '@/components/ui/Icons'

/**
 * Small "something wrong? contact us" modal. Emails support (via
 * netlify/functions/contact-support.js) with the user's message plus whatever
 * wallet/pod/tx context the calling page already has — so a report about a
 * payment issue always arrives with the details needed to look it up.
 */
export default function ContactSupportModal({ podId, podName, txHash, onClose }) {
  const { t }    = useTranslation()
  const { wallet } = useAppStore()

  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/.netlify/functions/contact-support', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message:       message.trim(),
          walletAddress: wallet?.address,
          podId,
          podName,
          txHash,
        }),
      })
      if (!res.ok) throw new Error()
      setSent(true)
    } catch {
      setError(t('pay.contactError'))
    } finally {
      setSending(false)
    }
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
        {!sent ? (
          <>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-extrabold dark:text-white text-slate-900">{t('pay.contactTitle')}</h2>
              <button onClick={onClose} className="text-2xl dark:text-brand-muted text-slate-400 hover:text-red-400 transition-colors leading-none">×</button>
            </div>

            <p className="text-sm dark:text-brand-muted text-slate-500 mb-4">{t('pay.contactBody')}</p>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('pay.contactPlaceholder')}
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60 resize-none mb-4"
            />

            {error && <p className="text-xs text-red-400 dark:bg-red-500/10 bg-red-50 p-3 rounded-xl mb-4">{error}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 text-sm font-semibold hover:opacity-80">
                {t('pay.contactCancel')}
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="flex-1 py-3 rounded-2xl bg-gradient-brand text-white text-sm font-bold shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? t('pay.contactSending') : t('pay.contactSend')}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <IconBadge size="lg" className="mx-auto mb-4"><IconCheck /></IconBadge>
            <p className="text-sm dark:text-brand-text text-slate-700 mb-6">{t('pay.contactSent')}</p>
            <button onClick={onClose} className="px-8 py-3 rounded-2xl bg-gradient-brand text-white font-bold text-sm shadow-glow-sm">
              {t('common.back')}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
