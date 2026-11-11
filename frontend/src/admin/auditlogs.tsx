import { useState } from 'react'
import { clearAuthSession } from '../auth/authApi'
import AuditLogView from '../components/audit/auditlogview'
import AdminNavbar, { AdminPageHeader } from '../components/navbars/adminnavbar'

export default function AuditLogs() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSignOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <AuditLogView
      frame={(content) => (
        <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
          <AdminNavbar activePath="/admin/audit-logs" mobileMenuOpen={mobileMenuOpen} onMobileMenuClose={() => setMobileMenuOpen(false)} />
          <section className="min-h-screen lg:pl-72">
            <AdminPageHeader pageName="Audit logs" subtitle="Items, issuances, returns, requests, and employee changes" onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={handleSignOut} />
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">{content}</div>
          </section>
        </main>
      )}
    />
  )
}
