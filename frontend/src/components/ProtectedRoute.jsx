import { Navigate } from 'react-router-dom'

import { isAuthenticated } from '../auth/auth.js'

export default function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/auth" replace />
  }
  return children
}
