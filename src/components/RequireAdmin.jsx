import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAppStore from '@/store/useAppStore'
import supabase from '@/lib/supabase'

/**
 * Wraps admin routes. Redirects to /admin/login if no admin session.
 * Preserves the intended destination so login can redirect back.
 *
 * adminUser is persisted to localStorage indefinitely, so a stale/expired/
 * revoked Supabase session would otherwise still render the admin UI shell
 * until the first API call 401s. This re-validates the live Supabase session
 * on mount and reacts to sign-out/refresh-failure events while mounted.
 *
 * Note: this is a UX / defense-in-depth check, not the real security boundary —
 * every admin Netlify function independently re-verifies the bearer JWT against
 * admin_users on every call regardless of what the frontend thinks.
 */
export default function RequireAdmin({ children }) {
  const adminUser   = useAppStore(s => s.adminUser)
  const logoutAdmin = useAppStore(s => s.logoutAdmin)
  const location    = useLocation()

  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionValid,   setSessionValid]   = useState(false)

  useEffect(() => {
    if (!adminUser) {
      setSessionChecked(true)
      setSessionValid(false)
      return
    }

    let cancelled = false

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return
      const valid = !error && Boolean(data?.session)
      if (!valid) logoutAdmin()
      setSessionValid(valid)
      setSessionChecked(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return
      if (event === 'SIGNED_OUT') {
        logoutAdmin()
        setSessionValid(false)
      }
    })

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser])

  if (!adminUser) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  if (!sessionChecked) {
    return null // brief validation against the live Supabase session before rendering admin UI
  }

  if (!sessionValid) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return children
}
