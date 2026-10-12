import { useEffect, useState, type ReactNode } from 'react'
import AdminDashboard from './admin/admindashboard'
import GsoDashboard from './gso/gsodashboard'
import Login from './auth/login'
import ForgotPassword from './auth/forgotpassword'
import ResetOtp from './auth/resetotp'
import ResetPassword from './auth/resetpassword'
import Hero from './landing/hero'
import { ApiError, clearAuthSession, dashboardPathForRoles, getCurrentUser, hasAuthToken } from './auth/authApi'

function ProtectedDashboard({ requiredRole, children }: { requiredRole: string; children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking')

  useEffect(() => {
    let active = true

    if (!hasAuthToken()) {
      window.location.replace('/login')
      return () => { active = false }
    }

    getCurrentUser()
      .then((user) => {
        if (!active) return
        if (user.roles.includes(requiredRole)) {
          setStatus('ready')
          return
        }

        const destination = dashboardPathForRoles(user.roles)
        if (destination) window.location.replace(destination)
        else {
          clearAuthSession()
          window.location.replace('/login')
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          clearAuthSession()
          window.location.replace('/login')
          return
        }
        setStatus('error')
      })

    return () => { active = false }
  }, [requiredRole])

  if (status === 'ready') return children

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 font-['Plus_Jakarta_Sans'] text-slate-900">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-slate-600">
          {status === 'checking' ? 'Sinusuri ang iyong account…' : 'Hindi makakonekta sa backend para ma-verify ang account.'}
        </p>
        {status === 'error' && <a href="/login" className="mt-3 inline-block text-sm font-bold text-blue-600 hover:underline">Bumalik sa sign in</a>}
      </div>
    </main>
  )
}

export default function App() {
  const path = window.location.pathname

  if (path === '/admin' || path === '/admin/dashboard') {
    return <ProtectedDashboard requiredRole="IT_ADMIN"><AdminDashboard /></ProtectedDashboard>
  }
  if (path === '/gso' || path === '/gso/dashboard') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><GsoDashboard /></ProtectedDashboard>
  }
  if (path === '/login' && window.location.hash === '#forgot-password') return <ForgotPassword />
  if (path === '/login') return <Login />
  if (path === '/forgot-password') return <ForgotPassword />
  if (path === '/reset-otp') return <ResetOtp />
  if (path === '/reset-password') return <ResetPassword />

  return <Hero />
}
