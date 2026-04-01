import { motion } from 'framer-motion'
import { cn } from './cn'

export default function Card({ children, className, glow = false, hover = true, onClick, ...props }) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={hover ? { y: -3, scale: 1.005 } : {}}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'rounded-2xl border',
        /* dark */
        'dark:bg-brand-mid dark:border-brand-border',
        /* light */
        'bg-white border-slate-200 shadow-sm',
        hover && 'cursor-pointer dark:hover:border-brand-blue/60 hover:border-brand-blue/40',
        hover && 'dark:hover:shadow-glow-sm transition-shadow duration-300',
        glow && 'card-glow dark:shadow-glow animate-glow-pulse',
        onClick && 'cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
