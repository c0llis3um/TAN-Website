import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import useAppStore from '@/store/useAppStore'
import { IconCheck } from '@/components/ui/Icons'

const BITSO_XRP_URL = 'https://bitso.com/mx/prices/xrp'

/**
 * Bitso has no embeddable/prefillable buy widget (unlike MoonPay) — this is a
 * guide, not an integration. The one real value-add given no prefill exists
 * is showing the user's own address ready to copy-paste into Bitso's
 * withdraw screen.
 */
export default function BitsoGuideModal({ onClose }) {
  const { t }       = useTranslation()
  const { wallet }  = useAppStore()
  const [copied, setCopied] = useState(false)

  function copyAddress() {
    if (!wallet?.address) return
    navigator.clipboard.writeText(wallet.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-extrabold dark:text-white text-slate-900">{t('bitsoGuide.title')}</h2>
          <button onClick={onClose} className="text-2xl dark:text-brand-muted text-slate-400 hover:text-red-400 transition-colors leading-none">×</button>
        </div>

        <p className="text-sm dark:text-brand-muted text-slate-500 mb-4">{t('bitsoGuide.subtitle')}</p>

        {wallet?.address && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-1.5">{t('bitsoGuide.yourAddress')}</p>
            <div className="flex items-center gap-2">
              <input readOnly value={wallet.address}
                className="flex-1 text-xs font-mono px-3 py-2.5 rounded-xl dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 truncate" />
              <button onClick={copyAddress}
                className="text-xs px-3 py-2.5 rounded-xl bg-brand-blue/10 text-brand-cyan font-semibold hover:bg-brand-blue/20 transition-colors inline-flex items-center gap-1 flex-shrink-0">
                {copied && <IconCheck className="w-3.5 h-3.5" />} {copied ? t('pod.linkCopied') : t('common.copy', 'Copy')}
              </button>
            </div>
          </div>
        )}

        <ol className="space-y-2.5 mb-4 list-decimal list-inside">
          {['step1', 'step2', 'step3', 'step4', 'step5'].map(key => (
            <li key={key} className="text-sm dark:text-brand-text text-slate-700">{t(`bitsoGuide.${key}`)}</li>
          ))}
        </ol>

        <a href={BITSO_XRP_URL} target="_blank" rel="noopener noreferrer"
          className="block w-full text-center py-3 rounded-2xl bg-gradient-brand text-white text-sm font-bold shadow-glow-sm hover:shadow-glow transition-all mb-3">
          {t('bitsoGuide.openBitso')} →
        </a>

        <p className="text-xs dark:text-brand-muted text-slate-400 text-center">{t('bitsoGuide.disclaimer')}</p>
      </motion.div>
    </motion.div>
  )
}
