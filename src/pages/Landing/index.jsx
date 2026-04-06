import { useState, useEffect } from 'react'
import { joinWaitlist } from '@/lib/db'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Timeline from '@/components/Timeline'

const WORDS = ['Tanda','Osusu','Hui','Juntas','Arisan','Stokvel','Pandeiros','Pollas']

const fadeUp = (delay = 0) => ({
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay, ease: 'easeOut' } },
})

function Section({ children, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.section
      ref={ref}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      className={`py-20 px-4 ${className}`}
    >
      {children}
    </motion.section>
  )
}

function FadeUp({ children, delay = 0 }) {
  return <motion.div variants={fadeUp(delay)}>{children}</motion.div>
}

/* ── Share helpers ── */
function shareWa(text) { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') }
function shareTg(url, text) { window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank') }

export default function Landing() {
  const { t } = useTranslation()
  const [wordIdx, setWordIdx] = useState(0)
  const [email, setEmail]         = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [wlError, setWlError]     = useState(null)
  const [wlLoading, setWlLoading] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setWordIdx(i => (i + 1) % WORDS.length), 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="overflow-x-hidden">

      {/* ══ HERO ══ */}
      <section className="relative min-h-[92vh] flex items-center justify-center text-center px-4 overflow-hidden">
        {/* Animated orbs */}
        <div className="orb w-[600px] h-[600px] bg-brand-blue top-[-100px] left-[-150px] animate-orb-drift" />
        <div className="orb w-[500px] h-[500px] bg-brand-cyan bottom-[-80px] right-[-120px] animate-orb-drift-r" />
        <div className="orb w-[300px] h-[300px] bg-blue-800 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

        {/* Banner image overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/media/banner.webp)', opacity: 0.08 }}
        />
        <div className="absolute inset-0 dark:bg-gradient-to-b dark:from-brand-dark/40 dark:to-brand-dark/90 bg-gradient-to-b from-slate-50/40 to-slate-50/90" />

        <div className="relative z-10 max-w-3xl mx-auto">
          <motion.img
            src="/media/tlogo.png"
            alt="DeFi Tanda"
            className="w-20 h-20 mx-auto mb-8 dark:brightness-[10] brightness-0"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
          />

          <motion.h1
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6 dark:text-white text-slate-900"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            {t('hero.headline1')}<br />
            <span className="gradient-text">{t('hero.headline2')}</span>
          </motion.h1>

          {/* Rotating word */}
          <motion.p
            className="text-lg sm:text-xl dark:text-brand-text text-slate-600 max-w-xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          >
            {t('hero.sub', { word: '' }).split('{{word}}')[0]}
            <AnimatePresence mode="wait">
              <motion.span
                key={wordIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="gradient-text font-bold"
              >
                {WORDS[wordIdx]}
              </motion.span>
            </AnimatePresence>
            {t('hero.sub', { word: '' }).split('{{word}}')[1]}
          </motion.p>

          <motion.div
            className="flex flex-wrap gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <Button size="xl" onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })}>
              {t('hero.cta1')}
            </Button>
            <Button size="xl" variant="outline" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
              {t('hero.cta2')} ↓
            </Button>
          </motion.div>

          {/* Stats row */}
          <motion.div
            className="flex flex-wrap gap-8 justify-center mt-16"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          >
            {[['2 networks','ETH · XRPL'],['$0 fees','During pilot'],['< 5 sec','Settlement']].map(([val, label]) => (
              <div key={val} className="text-center">
                <div className="text-2xl font-extrabold gradient-text">{val}</div>
                <div className="text-xs dark:text-brand-muted text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══ WHAT IS A TANDA ══ */}
      <Section id="tanda" className="dark:bg-brand-darker bg-slate-100">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <FadeUp><h2 className="text-4xl font-extrabold dark:text-white text-slate-900 mb-4">{t('tanda.title')}</h2></FadeUp>
            <FadeUp delay={0.1}><div className="w-14 h-1 bg-gradient-brand rounded-full mb-8" /></FadeUp>
            {['p1','p2','p3','p4'].map((k, i) => (
              <FadeUp key={k} delay={0.1 * i}>
                <p className="dark:text-brand-text text-slate-600 leading-relaxed mb-4">{t(`tanda.${k}`)}</p>
              </FadeUp>
            ))}
          </div>
          <FadeUp delay={0.2}>
            <motion.div
              className="relative"
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="absolute inset-0 bg-gradient-brand rounded-3xl opacity-20 blur-2xl scale-95" />
              <img src="/media/tanda-2.png" alt="Tanda App" className="relative rounded-3xl w-full max-w-sm mx-auto dark:shadow-glow shadow-xl" />
            </motion.div>
          </FadeUp>
        </div>
      </Section>

      {/* ══ HOW IT WORKS ══ */}
      <Section id="how">
        <div className="max-w-5xl mx-auto text-center">
          <FadeUp><h2 className="text-4xl font-extrabold dark:text-white text-slate-900 mb-3">{t('how.title')}</h2></FadeUp>
          <FadeUp delay={0.05}><div className="w-14 h-1 bg-gradient-brand rounded-full mx-auto mb-4" /></FadeUp>
          <FadeUp delay={0.1}><p className="dark:text-brand-muted text-slate-500 text-lg mb-14">{t('how.sub')}</p></FadeUp>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              { n: '1', title: t('how.step1Title'), body: t('how.step1'), icon: '🏘️' },
              { n: '2', title: t('how.step2Title'), body: t('how.step2'), icon: '💳' },
              { n: '3', title: t('how.step3Title'), body: t('how.step3'), icon: '🎉' },
            ].map(({ n, title, body, icon }, i) => (
              <FadeUp key={n} delay={0.1 * i}>
                <Card className="p-8 text-center h-full" glow={n === '3'}>
                  <div className="w-14 h-14 rounded-2xl bg-gradient-brand flex items-center justify-center text-2xl mx-auto mb-5 shadow-glow-sm">
                    {icon}
                  </div>
                  <div className="text-xs font-bold tracking-widest gradient-text mb-2">STEP {n}</div>
                  <h3 className="text-lg font-bold dark:text-white text-slate-900 mb-3">{title}</h3>
                  <p className="dark:text-brand-muted text-slate-500 text-sm leading-relaxed">{body}</p>
                </Card>
              </FadeUp>
            ))}
          </div>

          {/* Pod example */}
          <FadeUp delay={0.3}>
            <Card className="max-w-lg mx-auto overflow-hidden" hover={false}>
              <div className="p-4 bg-gradient-brand text-white font-bold text-center text-sm tracking-wide">
                {t('how.exampleTitle')}
              </div>
              {[
                [t('how.members'), '10'],
                [t('how.contribution'), '$100 / week'],
                [t('how.pot'), '$1,000'],
                [t('how.duration'), '10 weeks'],
                [t('how.receives'), '$1,000 once'],
                [t('how.fee'), t('how.feeValue')],
              ].map(([label, val], i) => (
                <div key={label} className={`flex justify-between items-center px-6 py-3.5 ${i % 2 === 0 ? 'dark:bg-brand-mid/50 bg-slate-50' : ''}`}>
                  <span className="text-sm dark:text-brand-muted text-slate-500 font-medium uppercase tracking-wider text-xs">{label}</span>
                  <span className="font-bold dark:text-white text-slate-900">{val}</span>
                </div>
              ))}
            </Card>
          </FadeUp>
        </div>
      </Section>

      {/* ══ WHY ══ */}
      <Section className="dark:bg-brand-darker bg-slate-100">
        <div className="max-w-6xl mx-auto text-center">
          <FadeUp><h2 className="text-4xl font-extrabold dark:text-white text-slate-900 mb-3">{t('why.title')}</h2></FadeUp>
          <FadeUp delay={0.05}><div className="w-14 h-1 bg-gradient-brand rounded-full mx-auto mb-4" /></FadeUp>
          <FadeUp delay={0.1}><p className="dark:text-brand-muted text-slate-500 text-lg mb-14">{t('why.sub')}</p></FadeUp>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { key: 'fraud',   icon: '🔒' },
              { key: 'bank',    icon: '📱' },
              { key: 'remit',   icon: '🌎' },
              { key: 'record',  icon: '📋' },
              { key: 'whatsapp',icon: '💬' },
              { key: 'yield',   icon: '📈' },
            ].map(({ key, icon }, i) => (
              <FadeUp key={key} delay={0.05 * i}>
                <Card className="p-6 text-left">
                  <div className="text-3xl mb-4">{icon}</div>
                  <h4 className="font-bold dark:text-white text-slate-900 mb-2">{t(`why.${key}.title`)}</h4>
                  <p className="text-sm dark:text-brand-muted text-slate-500 leading-relaxed">{t(`why.${key}.body`)}</p>
                </Card>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* ══ PAY YOUR WAY ══ */}
      <Section id="pay">
        <div className="max-w-4xl mx-auto text-center">
          <FadeUp><h2 className="text-4xl font-extrabold dark:text-white text-slate-900 mb-3">{t('pay.title')}</h2></FadeUp>
          <FadeUp delay={0.05}><div className="w-14 h-1 bg-gradient-brand rounded-full mx-auto mb-4" /></FadeUp>
          <FadeUp delay={0.1}><p className="dark:text-brand-muted text-slate-500 text-lg mb-14">{t('pay.sub')}</p></FadeUp>

          <div className="grid md:grid-cols-2 gap-6">
            <FadeUp delay={0.15}>
              <Card className="p-8 text-left h-full">
                <h4 className="text-lg font-bold dark:text-white text-slate-900 mb-3">{t('pay.fiatTitle')}</h4>
                <p className="dark:text-brand-muted text-slate-500 text-sm mb-6 leading-relaxed">{t('pay.fiatBody')}</p>
                <div className="flex flex-wrap gap-2">
                  {['Debit Card','Bank Transfer'].map(b => (
                    <span key={b} className="px-3 py-1.5 rounded-xl text-xs font-bold border dark:bg-brand-mid bg-slate-100 dark:border-brand-border border-slate-200 dark:text-brand-text text-slate-600">
                      {b}
                    </span>
                  ))}
                </div>
              </Card>
            </FadeUp>
            <FadeUp delay={0.2}>
              <Card className="p-8 text-left h-full">
                <h4 className="text-lg font-bold dark:text-white text-slate-900 mb-3">{t('pay.walletTitle')}</h4>
                <p className="dark:text-brand-muted text-slate-500 text-sm mb-6 leading-relaxed">{t('pay.walletBody')}</p>
                <div className="flex flex-wrap gap-2">
                  {['MetaMask','Xaman','Coinbase'].map(w => (
                    <span key={w} className="px-3 py-1.5 rounded-xl text-xs font-bold border dark:bg-brand-mid bg-slate-100 dark:border-brand-border border-slate-200 dark:text-brand-text text-slate-600">{w}</span>
                  ))}
                </div>
              </Card>
            </FadeUp>
          </div>
        </div>
      </Section>

      {/* ══ CHAINS ══ */}
      <Section id="chains" className="dark:bg-brand-darker bg-slate-100">
        <div className="max-w-4xl mx-auto text-center">
          <FadeUp><h2 className="text-4xl font-extrabold dark:text-white text-slate-900 mb-3">{t('chains.title')}</h2></FadeUp>
          <FadeUp delay={0.05}><div className="w-14 h-1 bg-gradient-brand rounded-full mx-auto mb-4" /></FadeUp>
          <FadeUp delay={0.1}><p className="dark:text-brand-muted text-slate-500 text-lg mb-14">{t('chains.sub')}</p></FadeUp>

          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {[
              { key: 'eth',  logo: null,                 name: 'Ethereum',   star: false },
              { key: 'xrpl', logo: '/media/logou.webp', name: 'XRP Ledger', star: true  },
            ].map(({ key, logo, name, star }, i) => (
              <FadeUp key={key} delay={0.1 * i}>
                <Card className="p-8 text-center" glow={star}>
                  <div className="h-12 flex items-center justify-center mb-4">
                    {logo
                      ? <img src={logo} alt={name} className="h-10 object-contain dark:brightness-100 brightness-100" style={key === 'sol' ? { filter: 'brightness(1.4)' } : {}} />
                      : <EthLogo />
                    }
                  </div>
                  <h4 className="font-bold dark:text-white text-slate-900 mb-2">{name}</h4>
                  <span className="inline-block px-3 py-1 rounded-lg text-xs font-bold bg-brand-blue/10 text-brand-cyan border border-brand-blue/30 mb-3">
                    {t(`chains.${key}.token`)}
                  </span>
                  <p className="text-sm dark:text-brand-muted text-slate-500 leading-relaxed mb-3">{t(`chains.${key}.body`)}</p>
                  <p className="text-xs font-bold text-brand-blue">{t(`chains.${key}.best`)}</p>
                </Card>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* ══ LEARN ══ */}
      <Section id="learn">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <FadeUp><h2 className="text-4xl font-extrabold dark:text-white text-slate-900 mb-4">{t('learn.title')}</h2></FadeUp>
            <FadeUp delay={0.05}><div className="w-14 h-1 bg-gradient-brand rounded-full mb-6" /></FadeUp>
            <FadeUp delay={0.1}><p className="dark:text-brand-text text-slate-600 leading-relaxed mb-4">{t('learn.body1')}</p></FadeUp>
            <FadeUp delay={0.15}><p className="dark:text-brand-text text-slate-600 leading-relaxed mb-8">{t('learn.body2')}</p></FadeUp>
            <FadeUp delay={0.2}>
              <Button onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })}>
                {t('learn.cta')} →
              </Button>
            </FadeUp>
          </div>
          <FadeUp delay={0.15}>
            <Card className="overflow-hidden" hover={false}>
              <div className="px-5 py-3 border-b dark:border-brand-border border-slate-200">
                <span className="text-xs font-bold tracking-widest gradient-text uppercase">{t('learn.courseLabel')}</span>
              </div>
              {['l1','l2','l3','l4','l5'].map((k, i) => (
                <motion.div
                  key={k}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i, duration: 0.4 }}
                  viewport={{ once: true }}
                  className="flex items-center gap-4 px-5 py-4 border-b dark:border-brand-border/50 border-slate-100 last:border-0 dark:hover:bg-brand-mid/40 hover:bg-slate-50 transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm dark:text-brand-text text-slate-700">{t(`learn.${k}`)}</span>
                </motion.div>
              ))}
            </Card>
          </FadeUp>
        </div>
      </Section>

      {/* ══ TIMELINE ══ */}
      <Section className="dark:bg-brand-darker bg-slate-50">
        <Timeline />
      </Section>

      {/* ══ WAITLIST ══ */}
      <Section id="waitlist" className="dark:bg-brand-darker bg-slate-100">
        <div className="max-w-xl mx-auto text-center">
          <FadeUp>
            <motion.div
              className="relative p-10 rounded-3xl dark:bg-brand-mid bg-white dark:border-brand-border border-slate-200 border"
              whileInView={{ boxShadow: ['0 0 0px rgba(0,106,255,0)', '0 0 60px rgba(0,106,255,0.25)', '0 0 30px rgba(0,106,255,0.15)'] }}
              transition={{ duration: 2, ease: 'easeOut' }}
              viewport={{ once: true }}
            >
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-brand-blue/30 via-transparent to-brand-cyan/20 -z-10" />
              <motion.img
                src="/media/tlogo.png"
                alt=""
                className="w-14 h-14 mx-auto mb-6 dark:brightness-[10] brightness-0"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <h2 className="text-3xl font-extrabold dark:text-white text-slate-900 mb-3">{t('waitlist.title')}</h2>
              <p className="dark:text-brand-muted text-slate-500 mb-8 leading-relaxed">{t('waitlist.body')}</p>

              {submitted ? (
                <motion.p
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-lg font-bold gradient-text"
                >
                  {t('waitlist.success')}
                </motion.p>
              ) : (
                <>
                  <form onSubmit={async (e) => {
                      e.preventDefault()
                      setWlLoading(true)
                      setWlError(null)
                      const { error } = await joinWaitlist({ email, source: 'landing' })
                      setWlLoading(false)
                      if (error && error.code !== '23505') {
                        setWlError('Something went wrong. Try again.')
                      } else {
                        setSubmitted(true)
                      }
                    }} className="flex gap-3 flex-wrap justify-center">
                    <input
                      type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder={t('waitlist.placeholder')}
                      className="flex-1 min-w-[200px] px-4 py-3 rounded-2xl text-sm
                        dark:bg-brand-dark bg-slate-50
                        dark:border-brand-border border-slate-300 border
                        dark:text-white text-slate-900
                        dark:placeholder-brand-border placeholder-slate-400
                        focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
                    />
                    <Button type="submit" size="md" disabled={wlLoading}>
                      {wlLoading ? '…' : t('waitlist.cta')}
                    </Button>
                  </form>
                  {wlError && <p className="text-xs text-red-400 mt-2">{wlError}</p>}
                </>
              )}
              <p className="text-xs dark:text-brand-border text-slate-400 mt-4">{t('waitlist.note')}</p>
            </motion.div>
          </FadeUp>
        </div>
      </Section>

    </div>
  )
}

function EthLogo() {
  return (
    <svg width="28" height="44" viewBox="0 0 256 417" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="127.9,0 125.2,9.5 125.2,285.2 127.9,287.8 255.8,212.3" fill="#5a8a9f"/>
      <polygon points="127.9,0 0,212.3 127.9,287.8 127.9,154.1" fill="#a0c4d8"/>
      <polygon points="127.9,312.6 126.3,314.6 126.3,411.6 127.9,416.3 255.9,237.5" fill="#5a8a9f"/>
      <polygon points="127.9,416.3 127.9,312.6 0,237.5" fill="#a0c4d8"/>
      <polygon points="127.9,287.8 255.8,212.3 127.9,154.1" fill="#006aff"/>
      <polygon points="0,212.3 127.9,287.8 127.9,154.1" fill="#00c1ff"/>
    </svg>
  )
}
