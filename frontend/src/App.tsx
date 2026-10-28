import { useEffect, useState, type ReactNode } from 'react'
import AdminDashboard from './admin/admindashboard'
import UserManagement from './ITSS/usermanagement'
import AuditLogs from './admin/auditlogs'
import RequesterDashboard from './requesters/requesterdashboard'
import RequestCenter from './requesters/requestcenter'
import RequestForm from './requesters/requestform'
import MyRequests from './requesters/myrequests'
import RequestDetail from './requesters/requestdetail'
import RequesterProfile from './requesters/requesterprofile'
import RequesterNotifications from './requesters/notifications'
import ITSSDashboard from './ITSS/itssdashboard'



import GsoDashboard from './gso/gsodashboard'
import BorrowingPage from './gso/borrowing'
import EmployeeMasterData from './gso/employemasterdata'
import IssuanceRecord from './gso/issuancerecord'
import ReturnItems from './gso/returnitems'
import ToRepaired from './gso/torepaired'
import ItemsMasterData from './gso/itemsmasterdata'
import IssuanceApproval from './gso/issuanceapproval'
import Notifications from './gso/notifications' 
import RequesterVerification from './gso/requesterverification'



import Login from './auth/login'
import Register from './auth/register'
import ForgotPassword from './auth/forgotpassword'
import ResetOtp from './auth/resetotp'
import ResetPassword from './auth/resetpassword'
import VerifyEmailOtp from './auth/verifyemailotp'


import LandingHome from './landing/home'
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
          {status === 'checking' ? 'Checking your account…' : 'Unable to connect to the backend to verify your account.'}
        </p>
        {status === 'error' && <a href="/login" className="mt-3 inline-block text-sm font-bold text-blue-600 hover:underline">Return to sign in</a>}
      </div>
    </main>
  )
}

export default function App() {
  const path = window.location.pathname

  if (path === '/about' || path === '/faq' || path === '/contact') {
    return <LandingHome />
  }
  if (path === '/' || path === '/dashboard') return <LandingHome />

  if (path === '/issuance-approval') return <IssuanceApproval />

  if (path === '/admin' || path === '/admin/dashboard') {
    return <ProtectedDashboard requiredRole="IT_ADMIN"><AdminDashboard /></ProtectedDashboard>
  }
  if (path === '/admin/audit-logs') {
    return <ProtectedDashboard requiredRole="IT_ADMIN"><AuditLogs /></ProtectedDashboard>
  }
  if (path === '/itss/users') {
    return <ProtectedDashboard requiredRole="IT_STAFF"><UserManagement /></ProtectedDashboard>
  }
  if (path === '/itss' || path === '/itss/dashboard') {
    return <ProtectedDashboard requiredRole="IT_STAFF"><ITSSDashboard /></ProtectedDashboard>
  }
  if (path === '/gso/items') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><ItemsMasterData /></ProtectedDashboard>
  }
  if (path === '/gso/notifications') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><Notifications /></ProtectedDashboard>
  }
  if (path === '/gso/requester-verification') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><RequesterVerification /></ProtectedDashboard>
  }
  if (path === '/gso/employees') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><EmployeeMasterData /></ProtectedDashboard>
  }
  if (path === '/gso/issuance') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><IssuanceRecord /></ProtectedDashboard>
  }
  if (path === '/gso/return-items') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><ReturnItems /></ProtectedDashboard>
  }
  if (path === '/gso/to-be-repaired') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><ToRepaired /></ProtectedDashboard>
  }
  if (path === '/gso/requests-borrowing') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><BorrowingPage /></ProtectedDashboard>
  }
  if (path === '/gso' || path === '/gso/dashboard') {
    return <ProtectedDashboard requiredRole="GSO_STAFF"><GsoDashboard /></ProtectedDashboard>
  }
  if (path === '/requester/request-center' || path === '/borrower/request-center') {
    return <ProtectedDashboard requiredRole="BORROWER"><RequestCenter /></ProtectedDashboard>
  }
  if (path === '/requester/requests/new' || path === '/borrower/requests/new') {
    return <ProtectedDashboard requiredRole="BORROWER"><RequestForm /></ProtectedDashboard>
  }
  if (path === '/requester/my-requests' || path === '/borrower/my-requests') {
    return <ProtectedDashboard requiredRole="BORROWER"><MyRequests /></ProtectedDashboard>
  }
  if (path === '/requester/profile' || path === '/borrower/profile') {
    return <ProtectedDashboard requiredRole="BORROWER"><RequesterProfile /></ProtectedDashboard>
  }
  if (path === '/requester/notifications' || path === '/borrower/notifications') {
    return <ProtectedDashboard requiredRole="BORROWER"><RequesterNotifications /></ProtectedDashboard>
  }
  if (/^\/(?:requester|borrower)\/requests\/\d+$/.test(path)) {
    return <ProtectedDashboard requiredRole="BORROWER"><RequestDetail /></ProtectedDashboard>
  }
  if (path === '/requester' || path === '/requester/dashboard' || path === '/borrower' || path === '/borrower/dashboard') {
    return <ProtectedDashboard requiredRole="BORROWER"><RequesterDashboard /></ProtectedDashboard>
  }
  if (path === '/login' && window.location.hash === '#forgot-password') return <ForgotPassword />
  if (path === '/login') return <Login />
  if (path === '/register') return <Register />
  if (path === '/forgot-password') return <ForgotPassword />
  if (path === '/reset-otp') return <ResetOtp />
  if (path === '/reset-password') return <ResetPassword />
  if (path === '/verify-email') return <VerifyEmailOtp />

  return <LandingHome />
}
