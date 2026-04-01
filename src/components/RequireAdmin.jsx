import { Navigate, useLocation } from 'react-router-dom'
import useAppStore from '@/store/useAppStore'

/**
 * Wraps admin routes. Redirects to /admin/login if no admin session.
 * Preserves the intended destination so login can redirect back.
 */
export default function RequireAdmin({ children }) {
  const adminUser = useAppStore(s => s.adminUser)
  const location  = useLocation()

  if (!adminUser) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return children
}
