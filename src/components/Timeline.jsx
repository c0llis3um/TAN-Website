import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useTranslation } from 'react-i18next'

function TimelineItem({ item, side, index }) {
  const ref    = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  const isPast   = item.era === 'past'
  const isToday  = item.era === 'today'

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: side === 'left' ? -40 : 40 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.07, ease: 'easeOut' }}
      className={`relative flex items-start gap-0 mb-8 ${side === 'left' ? 'md:flex-row-reverse md:text-right' : 'md:flex-row'} flex-row`}
    >
      {/* Card */}
      <div className={`flex-1 md:mx-8 mx-4 ${isToday ? 'md:mx-8' : ''}`}>
        {isToday ? (
          <div className="relative px-6 py-4 rounded-2xl bg-gradient-brand shadow-glow text-white text-center">
            <div className="text-xs font-black uppercase tracking-widest opacity-80 mb-1">{item.date}</div>
            <div className="text-xl font-black">{item.title}</div>
            <div className="text-sm opacity-80 mt-1">{item.body}</div>
            {/* pulse rings */}
            <span className="absolute -top-1 -right-1 w-4 h-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan opacity-60" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-brand-cyan" />
            </span>
          </div>
        ) : (
          <div className={`px-5 py-4 rounded-2xl border transition-all group
            ${isPast
              ? 'dark:bg-brand-darker/80 bg-white dark:border-brand-border/60 border-slate-200 dark:hover:border-brand-border hover:border-slate-300'
              : 'dark:bg-brand-mid/50 bg-white dark:border-brand-blue/20 border-brand-blue/20 dark:hover:border-brand-blue/40 hover:border-brand-blue/40 hover:shadow-glow-sm'
            }`}>
            <div className="flex items-center gap-2 mb-1 md:justify-start flex-wrap">
              <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                ${isPast
                  ? 'dark:bg-brand-border/40 bg-slate-100 dark:text-brand-muted text-slate-500'
                  : 'bg-brand-blue/15 text-brand-blue'
                }`}>
                {item.date}
              </span>
              {item.badge && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                  ${item.badge === 'done'    ? 'bg-emerald-500/15 text-emerald-400' :
                    item.badge === 'live'    ? 'bg-brand-cyan/15 text-brand-cyan animate-pulse' :
                    item.badge === 'yield'   ? 'bg-purple-500/15 text-purple-400' :
                    item.badge === 'mobile'  ? 'bg-pink-500/15 text-pink-400' :
                    item.badge === 'global'  ? 'bg-amber-500/15 text-amber-400' :
                                              'bg-brand-blue/15 text-brand-blue'}`}>
                  {item.badge === 'done' ? '✓ Shipped' : item.badge === 'live' ? '⚡ Live' : item.badge === 'yield' ? '📈 Yield' : item.badge === 'mobile' ? '📱 Mobile' : item.badge === 'global' ? '🌍 Global' : item.badge}
                </span>
              )}
            </div>
            <div className={`font-bold mb-1 text-sm ${isPast ? 'dark:text-brand-text text-slate-700' : 'dark:text-white text-slate-900'}`}>
              {item.icon} {item.title}
            </div>
            <div className={`text-xs leading-relaxed ${isPast ? 'dark:text-brand-muted/80 text-slate-500' : 'dark:text-brand-muted text-slate-600'}`}>
              {item.body}
            </div>
          </div>
        )}
      </div>

      {/* Dot on the spine — hidden on mobile, shown on md+ */}
      <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 top-4 flex-col items-center z-10">
        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0
          ${isToday  ? 'bg-brand-cyan border-brand-cyan shadow-glow-cyan w-5 h-5' :
            isPast   ? 'dark:bg-brand-darker bg-white dark:border-brand-border border-slate-300' :
                       'bg-brand-blue/20 border-brand-blue'
          }`} />
      </div>

      {/* Mobile dot */}
      <div className="md:hidden flex-shrink-0 mt-4">
        <div className={`w-3 h-3 rounded-full border-2
          ${isToday ? 'bg-brand-cyan border-brand-cyan' : isPast ? 'dark:bg-brand-border bg-slate-300 dark:border-brand-border border-slate-300' : 'bg-brand-blue/30 border-brand-blue'}
        `} />
      </div>
    </motion.div>
  )
}

export default function Timeline() {
  const { t } = useTranslation()

  const items = [
    {
      era: 'past',
      date: '2022',
      icon: '💡',
      title: t('timeline.y2022_title'),
      body:  t('timeline.y2022_body'),
      badge: 'done',
    },
    {
      era: 'past',
      date: 'Early 2023',
      icon: '🎨',
      title: t('timeline.y2023a_title'),
      body:  t('timeline.y2023a_body'),
      badge: 'done',
    },
    {
      era: 'past',
      date: 'Mid 2023',
      icon: '⛓️',
      title: t('timeline.y2023b_title'),
      body:  t('timeline.y2023b_body'),
      badge: 'done',
    },
    {
      era: 'past',
      date: 'Late 2023',
      icon: '⚡',
      title: t('timeline.y2023c_title'),
      body:  t('timeline.y2023c_body'),
      badge: 'done',
    },
    {
      era: 'past',
      date: 'Early 2024',
      icon: '🔗',
      title: t('timeline.y2024a_title'),
      body:  t('timeline.y2024a_body'),
      badge: 'done',
    },
    {
      era: 'past',
      date: 'Mid 2024',
      icon: '🛡️',
      title: t('timeline.y2024b_title'),
      body:  t('timeline.y2024b_body'),
      badge: 'done',
    },
    {
      era: 'past',
      date: 'Late 2024',
      icon: '🌐',
      title: t('timeline.y2024c_title'),
      body:  t('timeline.y2024c_body'),
      badge: 'done',
    },
    {
      era: 'past',
      date: 'Early 2025',
      icon: '⚙️',
      title: t('timeline.y2025a_title'),
      body:  t('timeline.y2025a_body'),
      badge: 'done',
    },
    {
      era: 'past',
      date: 'Late 2025',
      icon: '🔒',
      title: t('timeline.y2025b_title'),
      body:  t('timeline.y2025b_body'),
      badge: 'done',
    },
    {
      era: 'today',
      date: t('timeline.today_date'),
      title: t('timeline.today_title'),
      body:  t('timeline.today_body'),
    },
    {
      era: 'future',
      date: 'Q2 2026',
      icon: '🚀',
      title: t('timeline.f2026a_title'),
      body:  t('timeline.f2026a_body'),
      badge: 'live',
    },
    {
      era: 'future',
      date: 'Q3 2026',
      icon: '📈',
      title: t('timeline.f2026b_title'),
      body:  t('timeline.f2026b_body'),
      badge: 'yield',
    },
    {
      era: 'future',
      date: 'Q4 2026',
      icon: '📱',
      title: t('timeline.f2026c_title'),
      body:  t('timeline.f2026c_body'),
      badge: 'mobile',
    },
    {
      era: 'future',
      date: 'Q1 2027',
      icon: '🌏',
      title: t('timeline.f2027a_title'),
      body:  t('timeline.f2027a_body'),
      badge: 'global',
    },
    {
      era: 'future',
      date: 'Q3 2027',
      icon: '🏗️',
      title: t('timeline.f2027b_title'),
      body:  t('timeline.f2027b_body'),
    },
    {
      era: 'future',
      date: '2028',
      icon: '🌍',
      title: t('timeline.f2028_title'),
      body:  t('timeline.f2028_body'),
    },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4">
      {/* Section header */}
      <div className="text-center mb-16">
        <motion.span
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-brand-blue/30 bg-brand-blue/10 text-brand-blue mb-4"
        >
          {t('timeline.label')}
        </motion.span>
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-5xl font-black dark:text-white text-slate-900"
        >
          {t('timeline.heading')}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-4 text-lg dark:text-brand-muted text-slate-600 max-w-xl mx-auto"
        >
          {t('timeline.sub')}
        </motion.p>
      </div>

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="flex flex-wrap justify-center gap-5 mb-12 text-xs dark:text-brand-muted text-slate-500"
      >
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full dark:bg-brand-border bg-slate-300 inline-block" /> {t('timeline.legendPast')}</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-cyan inline-block animate-pulse" /> {t('timeline.legendNow')}</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-blue inline-block" /> {t('timeline.legendFuture')}</span>
      </motion.div>

      {/* Timeline spine + items */}
      <div className="relative">
        {/* Vertical spine — desktop only */}
        <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px dark:bg-brand-border/60 bg-slate-200 -translate-x-1/2" />

        {items.map((item, i) => {
          const side = i % 2 === 0 ? 'left' : 'right'
          return (
            <TimelineItem key={i} item={item} side={side} index={i} />
          )
        })}
      </div>
    </div>
  )
}
