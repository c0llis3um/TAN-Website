import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import supabase from '@/lib/supabase'
import useAppStore from '@/store/useAppStore'

export default function AdminLogin() {
  const navigate    = useNavigate()
  const setAdminUser = useAppStore(s => s.setAdminUser)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 1. Sign in via Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) { setError('Invalid email or password.'); return }

      // 2. Verify the email exists in admin_users
      const { data: adminRow, error: adminErr } = await supabase
        .from('admin_users')
        .select('id, email, role')
        .eq('email', email)
        .single()

      if (adminErr || !adminRow) {
        await supabase.auth.signOut()
        setError('This account does not have admin access.')
        return
      }

      setAdminUser({ id: adminRow.id, email: adminRow.email, role: adminRow.role })
      navigate('/admin')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center dark:bg-[#070f13] bg-slate-100 px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/media/tlogo.png" alt="DeFi Tanda" className="w-12 h-12 dark:brightness-[10] brightness-0 mb-3" />
          <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Admin Portal</h1>
          <p className="text-sm dark:text-brand-muted text-slate-500 mt-1">DeFi Tanda · Restricted Access</p>
        </div>

        <div className="dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 shadow-glow">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold dark:text-brand-muted text-slate-500 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@defitanda.app"
                className="w-full px-4 py-3 rounded-xl dark:bg-brand-mid bg-slate-50 border dark:border-brand-border border-slate-200 dark:text-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold dark:text-brand-muted text-slate-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl dark:bg-brand-mid bg-slate-50 border dark:border-brand-border border-slate-200 dark:text-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-red-400 text-center"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-brand text-white font-bold text-sm shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs dark:text-brand-muted text-slate-400 mt-6">
          Not an admin?{' '}
          <a href="/" className="text-brand-blue hover:underline">Back to site</a>
        </p>
      </motion.div>
    </div>
  )
}
