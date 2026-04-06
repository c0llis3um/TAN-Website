import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Timeline from '@/components/Timeline'

/* ── animation helpers ── */
const fadeUp = (delay = 0) => ({
  hidden:  { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, delay, ease: 'easeOut' } },
})

function Section({ children, className = '', dark = false }) {
  const ref    = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.section
      ref={ref}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      className={`relative py-24 px-4 ${dark ? 'dark:bg-brand-darker bg-slate-100' : ''} ${className}`}
    >
      {children}
    </motion.section>
  )
}

function FadeUp({ children, delay = 0, className = '' }) {
  return <motion.div variants={fadeUp(delay)} className={className}>{children}</motion.div>
}

function Pill({ children, color = 'blue' }) {
  const cls = color === 'cyan'
    ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30'
    : 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
  return (
    <span className={`inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${cls} mb-4`}>
      {children}
    </span>
  )
}

function StatCard({ value, label, sub, delay = 0 }) {
  return (
    <FadeUp delay={delay} className="dark:bg-brand-mid/60 bg-white rounded-2xl border dark:border-brand-border border-slate-200 p-6 text-center shadow-glow-sm">
      <div className="text-4xl font-black bg-gradient-brand bg-clip-text text-transparent mb-1">{value}</div>
      <div className="text-sm font-bold dark:text-white text-slate-900 mb-1">{label}</div>
      {sub && <div className="text-xs dark:text-brand-muted text-slate-500">{sub}</div>}
    </FadeUp>
  )
}

function RoadmapItem({ phase, title, items, done = false, active = false, delay = 0 }) {
  return (
    <FadeUp delay={delay} className="relative flex gap-5">
      {/* spine */}
      <div className="flex flex-col items-center">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 border-2 ${
          done   ? 'bg-brand-cyan border-brand-cyan text-brand-darker' :
          active ? 'bg-brand-blue border-brand-blue text-white shadow-glow-sm' :
                   'dark:bg-brand-mid bg-slate-100 dark:border-brand-border border-slate-300 dark:text-brand-muted text-slate-400'
        }`}>
          {done ? '✓' : phase}
        </div>
        <div className="w-0.5 flex-1 dark:bg-brand-border bg-slate-200 mt-2" />
      </div>
      {/* content */}
      <div className="pb-10 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-bold dark:text-white text-slate-900">{title}</span>
          {done   && <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Done</span>}
          {active && <span className="text-xs bg-brand-blue/15 text-brand-blue px-2 py-0.5 rounded-full font-bold animate-pulse">Live</span>}
        </div>
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm dark:text-brand-muted text-slate-600">
              <span className={done ? 'text-emerald-400' : active ? 'text-brand-cyan' : 'dark:text-brand-border text-slate-300'}>▸</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </FadeUp>
  )
}

function UseCard({ icon, title, amount, pct, delay = 0 }) {
  return (
    <FadeUp delay={delay} className="dark:bg-brand-mid/60 bg-white rounded-2xl border dark:border-brand-border border-slate-200 p-5 shadow-glow-sm">
      <div className="text-3xl mb-3">{icon}</div>
      <div className="font-bold dark:text-white text-slate-900 mb-1">{title}</div>
      <div className="text-2xl font-black bg-gradient-brand bg-clip-text text-transparent mb-3">{amount}</div>
      <div className="w-full dark:bg-brand-border/40 bg-slate-200 rounded-full h-1.5">
        <div className="h-1.5 rounded-full bg-gradient-brand" style={{ width: pct }} />
      </div>
    </FadeUp>
  )
}

function MarketBar({ label, value, pct, color = 'blue', delay = 0 }) {
  return (
    <FadeUp delay={delay} className="mb-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm dark:text-brand-text text-slate-700">{label}</span>
        <span className="text-sm font-bold dark:text-white text-slate-900">{value}</span>
      </div>
      <div className="w-full dark:bg-brand-border/40 bg-slate-200 rounded-full h-2">
        <motion.div
          className={`h-2 rounded-full ${color === 'cyan' ? 'bg-brand-cyan' : 'bg-gradient-brand'}`}
          initial={{ width: 0 }}
          whileInView={{ width: pct }}
          transition={{ duration: 1.2, delay, ease: 'easeOut' }}
          viewport={{ once: true }}
        />
      </div>
    </FadeUp>
  )
}

export default function Pitch() {
  return (
    <div className="overflow-x-hidden min-h-screen dark:bg-brand-dark bg-slate-50">

      {/* ══ HERO ══ */}
      <section className="relative min-h-screen flex items-center justify-center text-center px-4 overflow-hidden">
        <div className="orb w-[700px] h-[700px] bg-brand-blue top-[-200px] left-[-200px] animate-orb-drift opacity-30" />
        <div className="orb w-[500px] h-[500px] bg-brand-cyan bottom-[-100px] right-[-150px] animate-orb-drift-r opacity-20" />

        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <img src="/media/tlogo.png" alt="DeFi Tanda" className="w-16 h-16 mx-auto mb-6 dark:brightness-[10] brightness-0 animate-float" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="inline-block text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full border border-brand-blue/40 bg-brand-blue/10 text-brand-blue mb-6"
          >
            Seed Round · April 2026 · Confidential
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-5xl sm:text-7xl font-black dark:text-white text-slate-900 leading-tight mb-6"
          >
            The savings circle
            <br />
            <span className="bg-gradient-brand bg-clip-text text-transparent">reimagined on-chain.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="text-xl dark:text-brand-muted text-slate-600 max-w-2xl mx-auto mb-10"
          >
            DeFi Tanda brings the world's oldest community savings tradition — the <strong className="dark:text-brand-text text-slate-800">rotating savings circle</strong> — to the blockchain. Trustless, automatic, borderless.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-wrap justify-center gap-4 text-sm"
          >
            {[
              { label: 'Live on XRPL Testnet', icon: '⚡' },
              { label: 'RLUSD + XRP', icon: '🪙' },
              { label: 'Smart Contract Secured', icon: '🔒' },
              { label: 'Chicago · Global', icon: '🌎' },
            ].map((b, i) => (
              <span key={i} className="flex items-center gap-2 px-4 py-2 rounded-xl dark:bg-brand-mid/60 bg-white border dark:border-brand-border border-slate-200 dark:text-brand-text text-slate-700 shadow-sm">
                <span>{b.icon}</span> {b.label}
              </span>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-16 text-brand-muted text-sm animate-bounce"
          >
            ↓ scroll
          </motion.div>
        </div>
      </section>

      {/* ══ THE ASK ══ */}
      <Section dark>
        <div className="max-w-5xl mx-auto text-center">
          <FadeUp><Pill>The Opportunity</Pill></FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="text-4xl sm:text-5xl font-black dark:text-white text-slate-900 mb-4">
              We are raising <span className="bg-gradient-brand bg-clip-text text-transparent">$1,000,000</span>
            </h2>
          </FadeUp>
          <FadeUp delay={0.2}>
            <p className="text-lg dark:text-brand-muted text-slate-600 max-w-2xl mx-auto mb-16">
              To launch on XRPL mainnet, scale community adoption across Latino and Chinese markets, and establish DeFi Tanda as the global standard for on-chain rotating savings.
            </p>
          </FadeUp>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard value="$500B+" label="Global ROSCA Market" sub="Rotating savings circles worldwide" delay={0.1} />
            <StatCard value="$150B" label="US Latino Remittances" sub="Sent to Latin America in 2023" delay={0.2} />
            <StatCard value="62M" label="Latinos in the US" sub="Fastest growing US demographic" delay={0.3} />
            <StatCard value="50M+" label="Chinese Diaspora" sub="Globally, $50T in wealth" delay={0.4} />
          </div>
        </div>
      </Section>

      {/* ══ PROBLEM ══ */}
      <Section>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <FadeUp><Pill color="cyan">The Problem</Pill></FadeUp>
            <FadeUp delay={0.1}>
              <h2 className="text-4xl font-black dark:text-white text-slate-900">
                Tandas break. Always have.
              </h2>
            </FadeUp>
            <FadeUp delay={0.2}>
              <p className="text-lg dark:text-brand-muted text-slate-600 mt-4 max-w-xl mx-auto">
                $500B+ moves through informal rotating savings circles every year — tracked in notebooks, collected in cash, organized on WhatsApp. No recourse when it goes wrong.
              </p>
            </FadeUp>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: '🚨', title: 'Organizer fraud', body: 'The organizer holds all the money. One bad actor wipes out the entire group. No contract, no recourse.' },
              { icon: '👻', title: 'Ghost members', body: 'Members collect their payout then disappear. No enforcement mechanism. Trust is the only guarantee — and it fails.' },
              { icon: '📓', title: 'Paper records', body: 'Disputes with no proof. No payment history. No transparency. Communities lose billions to informal record-keeping.' },
            ].map((p, i) => (
              <FadeUp key={i} delay={i * 0.1}>
                <div className="dark:bg-brand-mid/60 bg-white rounded-2xl border dark:border-brand-border border-slate-200 p-6 h-full shadow-sm">
                  <div className="text-4xl mb-4">{p.icon}</div>
                  <div className="font-bold dark:text-white text-slate-900 mb-2">{p.title}</div>
                  <div className="text-sm dark:text-brand-muted text-slate-600">{p.body}</div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* ══ SOLUTION ══ */}
      <Section dark>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <FadeUp><Pill>The Solution</Pill></FadeUp>
            <FadeUp delay={0.1}>
              <h2 className="text-4xl font-black dark:text-white text-slate-900">
                DeFi Tanda: trustless by design
              </h2>
            </FadeUp>
            <FadeUp delay={0.2}>
              <p className="text-lg dark:text-brand-muted text-slate-600 mt-4 max-w-2xl mx-auto">
                A smart contract replaces the organizer's handshake. Every contribution, every payout — automatic, transparent, immutable on XRPL.
              </p>
            </FadeUp>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: '🔒', title: 'No one holds the money', body: 'Smart contract custody. The organizer manages the group — but never touches funds.' },
              { icon: '⚡', title: 'Settles in 3 seconds', body: 'Built on XRP Ledger. $0.001 per transaction. Perfect for weekly savings circles.' },
              { icon: '💵', title: 'RLUSD stable payouts', body: 'Members can contribute and receive in RLUSD — Ripple\'s stablecoin, no crypto volatility.' },
              { icon: '🛡️', title: 'Collateral enforcement', body: '2× security deposit locked on-chain. Members can\'t collect and disappear.' },
              { icon: '🌐', title: 'Borderless payouts', body: 'Send your payout to family anywhere in seconds. No Western Union. Near-zero fees.' },
              { icon: '📱', title: 'WhatsApp + Xaman native', body: 'Invite members via WhatsApp. Pay via Xaman. Works where your community already lives.' },
            ].map((s, i) => (
              <FadeUp key={i} delay={i * 0.08}>
                <div className="dark:bg-brand-mid/40 bg-white rounded-2xl border dark:border-brand-border border-slate-200 p-5 shadow-sm h-full">
                  <div className="text-3xl mb-3">{s.icon}</div>
                  <div className="font-bold dark:text-white text-slate-900 mb-1 text-sm">{s.title}</div>
                  <div className="text-xs dark:text-brand-muted text-slate-600">{s.body}</div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* ══ MARKET — CHICAGO ══ */}
      <Section>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <FadeUp><Pill color="cyan">Market · Chicago First</Pill></FadeUp>
            <FadeUp delay={0.1}>
              <h2 className="text-4xl font-black dark:text-white text-slate-900">
                Why Chicago is ground zero
              </h2>
            </FadeUp>
            <FadeUp delay={0.2}>
              <p className="text-lg dark:text-brand-muted text-slate-600 mt-4 max-w-2xl mx-auto">
                Chicago is the #2 city for Mexican-Americans in the United States — a community where tandas have run for generations. Our home court.
              </p>
            </FadeUp>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <FadeUp>
                <h3 className="text-xl font-bold dark:text-white text-slate-900 mb-6">Chicago by the numbers</h3>
              </FadeUp>
              <MarketBar label="Latino residents — Chicago city" value="800K" pct="78%" delay={0.1} />
              <MarketBar label="Latino residents — Chicago metro" value="1.7M" pct="88%" delay={0.2} />
              <MarketBar label="Chinese community — Chicago metro" value="65K" pct="32%" color="cyan" delay={0.3} />
              <MarketBar label="Annual Illinois remittances to Mexico" value="$1.8B" pct="60%" delay={0.4} />
              <MarketBar label="Unbanked / underbanked households — IL" value="22%" pct="44%" delay={0.5} />
            </div>

            <div className="space-y-4">
              {[
                { icon: '🇲🇽', stat: '#2', label: 'US city for Mexican-Americans', sub: 'After Los Angeles' },
                { icon: '🏙️', stat: '2.7M', label: 'Chicago city population', sub: '29% Latino, growing' },
                { icon: '🇨🇳', stat: 'Chinatown', label: 'One of the Midwest\'s largest Chinese communities', sub: 'Pilsen · Bridgeport · suburban clusters' },
                { icon: '💸', stat: '$8B+', label: 'Estimated annual tanda volume', sub: 'Illinois alone, informal & uncaptured' },
              ].map((c, i) => (
                <FadeUp key={i} delay={i * 0.1}>
                  <div className="flex items-center gap-4 dark:bg-brand-mid/60 bg-white rounded-2xl border dark:border-brand-border border-slate-200 p-4 shadow-sm">
                    <div className="text-3xl">{c.icon}</div>
                    <div>
                      <div className="font-black text-xl bg-gradient-brand bg-clip-text text-transparent">{c.stat}</div>
                      <div className="text-sm font-bold dark:text-white text-slate-900">{c.label}</div>
                      <div className="text-xs dark:text-brand-muted text-slate-500">{c.sub}</div>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ══ MARKET — LATINO + CHINESE GLOBAL ══ */}
      <Section dark>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <FadeUp><Pill>Global Market</Pill></FadeUp>
            <FadeUp delay={0.1}>
              <h2 className="text-4xl font-black dark:text-white text-slate-900">
                Two communities. One product.
              </h2>
            </FadeUp>
            <FadeUp delay={0.2}>
              <p className="text-lg dark:text-brand-muted text-slate-600 mt-4 max-w-2xl mx-auto">
                Rotating savings circles are cultural DNA for both Latino and Chinese communities — two of the fastest-growing crypto-curious populations in the world.
              </p>
            </FadeUp>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">

            {/* Latino */}
            <FadeUp delay={0.1}>
              <div className="dark:bg-brand-mid/50 bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 h-full shadow-sm">
                <div className="text-4xl mb-4">🇲🇽🇨🇴🇵🇷🇩🇴</div>
                <h3 className="text-2xl font-black dark:text-white text-slate-900 mb-2">Latino Market</h3>
                <p className="text-sm dark:text-brand-muted text-slate-600 mb-6">The tanda is embedded in Mexican, Colombian, Dominican, and Puerto Rican culture. It already runs everywhere — DeFi Tanda just makes it unbreakable.</p>
                <div className="space-y-3">
                  {[
                    { label: 'Latinos in the US', value: '62.1M' },
                    { label: 'US Latino GDP', value: '$3.2T' },
                    { label: 'Remittances sent to LATAM (2023)', value: '$150B' },
                    { label: 'Estimated US tanda participants', value: '~10M' },
                    { label: 'Unbanked Latino households', value: '12%' },
                  ].map((r, i) => (
                    <div key={i} className="flex justify-between text-sm border-b dark:border-brand-border/60 border-slate-100 pb-2">
                      <span className="dark:text-brand-text text-slate-700">{r.label}</span>
                      <span className="font-bold dark:text-white text-slate-900">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>

            {/* Chinese */}
            <FadeUp delay={0.2}>
              <div className="dark:bg-brand-mid/50 bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 h-full shadow-sm">
                <div className="text-4xl mb-4">🇨🇳🇸🇬🇹🇼🇭🇰</div>
                <h3 className="text-2xl font-black dark:text-white text-slate-900 mb-2">Chinese Market</h3>
                <p className="text-sm dark:text-brand-muted text-slate-600 mb-6">The <em>Hui</em> (会) is the Chinese equivalent — practiced for centuries across mainland China, Taiwan, Hong Kong, and the diaspora in Singapore, Malaysia, and the US.</p>
                <div className="space-y-3">
                  {[
                    { label: 'Global Chinese diaspora', value: '50M+' },
                    { label: 'Singapore crypto adoption rate', value: '#2 globally' },
                    { label: 'Chinese diaspora wealth (est.)', value: '$50T+' },
                    { label: 'Hui participants — SE Asia alone', value: 'Hundreds of millions' },
                    { label: 'XRP / XRPL adoption — Asia', value: 'Market leader' },
                  ].map((r, i) => (
                    <div key={i} className="flex justify-between text-sm border-b dark:border-brand-border/60 border-slate-100 pb-2">
                      <span className="dark:text-brand-text text-slate-700">{r.label}</span>
                      <span className="font-bold dark:text-white text-slate-900">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>
          </div>

          {/* Combined */}
          <div className="mt-8 grid sm:grid-cols-3 gap-4">
            <StatCard value="$500B+" label="Estimated Global ROSCA Volume" sub="Annual informal rotating savings" delay={0.1} />
            <StatCard value="1B+" label="People Use ROSCAs" sub="Tanda, Hui, Chit Fund, Stokvel…" delay={0.2} />
            <StatCard value="$0" label="Captured by DeFi — So Far" sub="Massive untapped market" delay={0.3} />
          </div>
        </div>
      </Section>

      {/* ══ WHERE WE ARE ══ */}
      <Section>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <FadeUp><Pill color="cyan">Traction</Pill></FadeUp>
            <FadeUp delay={0.1}>
              <h2 className="text-4xl font-black dark:text-white text-slate-900">Where we are today</h2>
            </FadeUp>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            {[
              { icon: '✅', title: 'XRPL Testnet Live', body: 'Full tanda lifecycle deployed — create, join, pay, payout, claim collateral. Real smart contract logic on XRPL devnet.' },
              { icon: '✅', title: 'RLUSD + XRP Support', body: 'Dual-token system live. Members can save and receive payouts in Ripple\'s regulated stablecoin or native XRP.' },
              { icon: '✅', title: 'Xaman Wallet Integration', body: 'One-tap payments via Xaman (XUMM). Native XRPL wallet, 10M+ users globally.' },
              { icon: '✅', title: 'Full Web App', body: 'Dashboard, pod creation, payout tracking, collateral flow, WhatsApp/Telegram sharing — all built and live.' },
              { icon: '✅', title: 'Multilingual (ES · EN · 中文)', body: 'Full Spanish, English, and Mandarin support — targeting our three core communities from day one.' },
              { icon: '🔄', title: 'Waitlist Growing', body: 'Community members signing up daily. Chicago-first launch strategy targeting existing tanda organizers.' },
            ].map((t, i) => (
              <FadeUp key={i} delay={i * 0.08}>
                <div className="flex gap-4 dark:bg-brand-mid/50 bg-white rounded-2xl border dark:border-brand-border border-slate-200 p-5 shadow-sm">
                  <div className="text-2xl">{t.icon}</div>
                  <div>
                    <div className="font-bold dark:text-white text-slate-900 text-sm mb-1">{t.title}</div>
                    <div className="text-xs dark:text-brand-muted text-slate-600">{t.body}</div>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* ══ TIMELINE ══ */}
      <Section dark>
        <Timeline />
      </Section>

      {/* ══ THE ASK BREAKDOWN ══ */}
      <Section>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <FadeUp><Pill color="cyan">The Ask</Pill></FadeUp>
            <FadeUp delay={0.1}>
              <h2 className="text-4xl font-black dark:text-white text-slate-900">
                $1,000,000 seed round
              </h2>
            </FadeUp>
            <FadeUp delay={0.2}>
              <p className="text-lg dark:text-brand-muted text-slate-600 mt-4 max-w-xl mx-auto">
                18 months of runway. Mainnet launch. First 1,000 active tanda groups.
              </p>
            </FadeUp>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
            <UseCard icon="👩‍💻" title="Engineering & Product" amount="$400K" pct="40%" delay={0.1} />
            <UseCard icon="📣" title="Community & Growth" amount="$250K" pct="25%" delay={0.2} />
            <UseCard icon="⚖️" title="Legal & Compliance" amount="$150K" pct="15%" delay={0.3} />
            <UseCard icon="🏗️" title="Ops & Infrastructure" amount="$200K" pct="20%" delay={0.4} />
          </div>

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: '🎯', title: '18-month runway', body: 'From seed close to Series A readiness — mainnet live, first cohort of active users, revenue model validated.' },
              { icon: '📊', title: 'Milestones unlocked', body: '1,000 active tanda groups · $5M total value locked · 10,000 registered users · 3 city markets.' },
              { icon: '🤝', title: 'Strategic fit', body: 'Fenbushi\'s portfolio and reach in the Chinese and Asian DeFi ecosystem is the exact distribution channel DeFi Tanda needs to scale in Singapore and SE Asia.' },
            ].map((m, i) => (
              <FadeUp key={i} delay={i * 0.1}>
                <div className="dark:bg-brand-mid/60 bg-white rounded-2xl border dark:border-brand-border border-slate-200 p-6 shadow-sm h-full">
                  <div className="text-3xl mb-3">{m.icon}</div>
                  <div className="font-bold dark:text-white text-slate-900 mb-2">{m.title}</div>
                  <div className="text-sm dark:text-brand-muted text-slate-600">{m.body}</div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* ══ WHY FENBUSHI ══ */}
      <Section dark>
        <div className="max-w-3xl mx-auto text-center">
          <FadeUp><Pill>Why Fenbushi</Pill></FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="text-4xl font-black dark:text-white text-slate-900 mb-6">
              More than capital
            </h2>
          </FadeUp>
          <FadeUp delay={0.2}>
            <p className="text-lg dark:text-brand-muted text-slate-600 mb-12">
              Fenbushi's decade of building DeFi infrastructure, deep roots in the Chinese crypto ecosystem, and Singapore presence make this a strategic partnership — not just a check.
            </p>
          </FadeUp>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: '🌏', title: 'Asia distribution', body: 'Direct access to the Chinese and SE Asian communities DeFi Tanda is built for.' },
              { icon: '🏗️', title: 'DeFi expertise', body: 'Protocol-level knowledge to accelerate our XRPL integration and cross-chain roadmap.' },
              { icon: '🤝', title: 'Ecosystem network', body: 'Portfolio synergies for on-ramp partners, stablecoin integrations, and cross-border payment rails.' },
            ].map((w, i) => (
              <FadeUp key={i} delay={i * 0.1}>
                <div className="dark:bg-brand-mid/40 bg-white rounded-2xl border dark:border-brand-border border-slate-200 p-5 shadow-sm">
                  <div className="text-3xl mb-3">{w.icon}</div>
                  <div className="font-bold dark:text-white text-slate-900 mb-1 text-sm">{w.title}</div>
                  <div className="text-xs dark:text-brand-muted text-slate-600">{w.body}</div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* ══ CLOSING ══ */}
      <section className="relative py-32 px-4 text-center overflow-hidden">
        <div className="orb w-[600px] h-[600px] bg-brand-blue top-[-150px] left-1/2 -translate-x-1/2 animate-orb-drift opacity-20" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7 }}
            viewport={{ once: true }}
          >
            <div className="text-6xl mb-6">🤝</div>
            <h2 className="text-5xl font-black dark:text-white text-slate-900 mb-6">
              Let's build the future of<br />
              <span className="bg-gradient-brand bg-clip-text text-transparent">community finance.</span>
            </h2>
            <p className="text-xl dark:text-brand-muted text-slate-600 mb-10">
              A billion people already trust their communities with their savings. We're just making that trust unbreakable.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm dark:text-brand-muted text-slate-500">
              <span>defitanda.com</span>
              <span>·</span>
              <span>Chicago, IL</span>
              <span>·</span>
              <span>Built on XRP Ledger</span>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  )
}
