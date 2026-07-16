import { motion } from 'framer-motion'
import useAppStore from '@/store/useAppStore'
import { IconWarning } from '@/components/ui/Icons'

export default function DevBanner() {
  const env = useAppStore((s) => s.env)
  if (env === 'live') return null

  return (
    <motion.div
      initial={{ y: -40 }} animate={{ y: 0 }}
      className="relative z-50 overflow-hidden"
    >
      {/* Striped background */}
      <div className="dev-banner h-1.5 w-full" />
      <div className="bg-amber-500 text-amber-950 text-center py-1.5 px-4 text-xs font-bold tracking-wider flex items-center justify-center gap-3">
        <IconWarning className="w-3.5 h-3.5 animate-pulse" />
        TESTNET MODE — All transactions use test tokens. No real money at risk.
        <IconWarning className="w-3.5 h-3.5 animate-pulse" />
      </div>
      <div className="dev-banner h-1.5 w-full" />
    </motion.div>
  )
}
