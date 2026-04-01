import { motion, AnimatePresence } from 'framer-motion'
import useAppStore from '@/store/useAppStore'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useAppStore()
  const dark = theme === 'dark'

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="relative w-14 h-7 rounded-full p-0.5 transition-colors duration-300
        dark:bg-brand-mid bg-slate-200 border dark:border-brand-border border-slate-300
        focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
      aria-label="Toggle theme"
    >
      {/* Track glow */}
      <AnimatePresence>
        {dark && (
          <motion.div
            key="glow"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-full shadow-glow-sm pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Thumb */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className={`w-6 h-6 rounded-full flex items-center justify-center text-sm
          ${dark
            ? 'ml-auto bg-gradient-to-br from-brand-blue to-brand-cyan shadow-glow-sm'
            : 'bg-white shadow-md'
          }`}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={dark ? 'moon' : 'sun'}
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0,   opacity: 1, scale: 1 }}
            exit={   { rotate:  90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2 }}
          >
            {dark ? '🌙' : '☀️'}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </motion.button>
  )
}
