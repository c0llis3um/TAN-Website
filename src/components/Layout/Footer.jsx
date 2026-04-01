import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const links = [
  { label: 'Home', to: '/' },
  { label: 'Docs', href: 'https://whoosh.gitbook.io/defi-tanda', external: true },
  { label: 'Telegram', href: 'https://t.me/tandasolana', external: true },
  { label: 'GitHub', href: 'https://github.com/c0llis3um/TAN-Website', external: true },
]

export default function Footer() {
  return (
    <footer className="dark:bg-brand-darker bg-slate-100 border-t dark:border-brand-border border-slate-200 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/media/tlogo.png" alt="DeFi Tanda" className="w-7 h-7 dark:brightness-[10] brightness-0" />
            <span className="font-bold dark:text-white text-slate-800">DeFi Tanda</span>
            <span className="dark:text-brand-muted text-slate-400 text-sm">Chicago, IL</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-1 flex-wrap justify-center">
            {links.map(({ label, to, href, external }) => (
              <motion.span key={label} whileHover={{ y: -1 }}>
                {external
                  ? <a href={href} target="_blank" rel="noreferrer" className="px-3 py-1 text-sm dark:text-brand-muted text-slate-500 dark:hover:text-white hover:text-slate-900 transition-colors">{label}</a>
                  : <Link to={to} className="px-3 py-1 text-sm dark:text-brand-muted text-slate-500 dark:hover:text-white hover:text-slate-900 transition-colors">{label}</Link>
                }
              </motion.span>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-xs dark:text-brand-border text-slate-400">© 2026 DeFi Tanda</p>
        </div>
      </div>
    </footer>
  )
}
