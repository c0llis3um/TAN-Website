import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'

const CATEGORIES = [
  {
    key: 'basics',
    items: ['whatIsTanda', 'howRotationWorks', 'whichChain'],
  },
  {
    key: 'creating',
    items: ['howToCreate', 'howToJoin', 'whyCollateral'],
  },
  {
    key: 'payments',
    items: ['howToPay', 'whatIsDefault', 'whyCantIPay', 'howToClaimBack'],
  },
  {
    key: 'security',
    items: ['isItSafe', 'fees'],
  },
]

function Question({ id, open, onToggle }) {
  const { t } = useTranslation()
  const isOpen = open === id

  return (
    <Card hover={false} className="overflow-hidden">
      <button
        onClick={() => onToggle(isOpen ? null : id)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="font-bold dark:text-white text-slate-900">{t(`faq.q.${id}.q`)}</span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          className="text-2xl dark:text-brand-cyan text-brand-blue shrink-0 leading-none"
        >
          +
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <p className="px-6 pb-5 text-sm leading-relaxed dark:text-brand-muted text-slate-500 whitespace-pre-line">
          {t(`faq.q.${id}.a`)}
        </p>
      </motion.div>
    </Card>
  )
}

export default function FAQ() {
  const { t } = useTranslation()
  const [open, setOpen] = useState('whatIsDefault') // open the most-asked-about one by default

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
        <h1 className="text-4xl font-extrabold dark:text-white text-slate-900 mb-3">{t('faq.title')}</h1>
        <p className="dark:text-brand-muted text-slate-500 text-lg">{t('faq.sub')}</p>
      </motion.div>

      {CATEGORIES.map((cat) => (
        <div key={cat.key} className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest gradient-text mb-4">
            {t(`faq.categories.${cat.key}`)}
          </h2>
          <div className="space-y-3">
            {cat.items.map((id) => (
              <Question key={id} id={id} open={open} onToggle={setOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
