import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

const LESSONS = [
  { id: 'L-01', title: 'What is a Tanda?',           status: 'PUBLISHED', lang: ['ES','EN'], views: 142 },
  { id: 'L-02', title: 'How collateral protects you', status: 'PUBLISHED', lang: ['ES','EN'], views: 98  },
  { id: 'L-03', title: 'Choosing your chain',         status: 'DRAFT',    lang: ['EN'],      views: 0   },
  { id: 'L-04', title: 'Reading your reputation',     status: 'DRAFT',    lang: [],          views: 0   },
  { id: 'L-05', title: 'DeFi vs bank savings',        status: 'DRAFT',    lang: [],          views: 0   },
]

const stagger = { visible: { transition: { staggerChildren: 0.07 } } }
const item = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }

export default function AdminContent() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Akademia Content</h1>
          <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">Financial literacy lessons · Sprint 4</p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-gradient-brand text-white text-sm font-bold shadow-glow-sm hover:shadow-glow transition-all">
          + New Lesson
        </button>
      </div>

      <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-3">
        {LESSONS.map(l => (
          <motion.div key={l.id} variants={item}>
            <Card hover className="p-5 flex items-center justify-between gap-4 cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl dark:bg-brand-dark bg-slate-50 flex items-center justify-center font-mono text-xs dark:text-brand-muted text-slate-400">
                  {l.id}
                </div>
                <div>
                  <p className="font-semibold dark:text-white text-slate-900">{l.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {l.lang.map(lg => <Badge key={lg} variant="muted">{lg}</Badge>)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs dark:text-brand-muted text-slate-400">{l.views} views</span>
                <Badge variant={l.status === 'PUBLISHED' ? 'green' : 'yellow'}>{l.status}</Badge>
                <button className="text-xs text-brand-cyan font-semibold hover:underline">Edit →</button>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <Card hover={false} className="p-6 text-center dark:bg-brand-blue/5 border dark:border-brand-blue/20 border-blue-200">
        <p className="text-4xl mb-3">📚</p>
        <p className="font-bold dark:text-white text-slate-900 mb-1">Akademia launching Sprint 4</p>
        <p className="text-sm dark:text-brand-muted text-slate-500">Full lesson editor with Markdown, video embeds, and quiz questions coming soon.</p>
      </Card>
    </div>
  )
}
