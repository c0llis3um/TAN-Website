import { motion } from 'framer-motion'
import { cn } from './cn'

const variants = {
  primary: `
    bg-gradient-to-r from-brand-blue to-brand-cyan text-white
    shadow-glow hover:shadow-glow-lg
    dark:shadow-glow dark:hover:shadow-glow-lg
  `,
  outline: `
    border-2 border-brand-blue text-brand-blue
    hover:bg-brand-blue/10 dark:text-brand-cyan dark:border-brand-cyan
  `,
  ghost: `
    text-brand-muted hover:text-white hover:bg-white/5
    dark:hover:bg-white/5
  `,
  danger: `
    bg-red-500/20 border border-red-500/40 text-red-400
    hover:bg-red-500/30 hover:shadow-glow-red
  `,
}

const sizes = {
  sm:  'px-4 py-2 text-sm rounded-xl',
  md:  'px-6 py-3 text-sm rounded-2xl',
  lg:  'px-8 py-4 text-base rounded-2xl',
  xl:  'px-10 py-5 text-lg rounded-3xl',
}

export default function Button({
  children, variant = 'primary', size = 'md',
  className, disabled, onClick, type = 'button', ...props
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.03, y: -1 }}
      whileTap={disabled  ? {} : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold',
        'transition-all duration-200 cursor-pointer select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  )
}
