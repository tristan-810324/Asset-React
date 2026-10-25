import { useEffect, useState } from 'react'
import AdminNavbar, { AdminPageHeader } from '../components/navbars/adminnavbar'
import { clearAuthSession } from '../auth/authApi'
import { getBackupOperationsInfo } from './adminApi'

export default function BackupRecovery() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [backupInfo, setBackupInfo] = useState<{ backupMode: string; scheduledJobConfiguredInApp: boolean; script: string; guide: string } | null>(null)
  const [backupInfoError, setBackupInfoError] = useState('')
  const command = ".\\scripts\\backup-database.ps1 -BackupDirectory 'D:\\A-SET-Backups'"

  useEffect(() => {
    let active = true
    getBackupOperationsInfo().then((data) => { if (active) setBackupInfo(data) }).catch((reason: unknown) => {
      if (active) setBackupInfoError(reason instanceof Error ? reason.message : 'Hindi ma-load ang backup configuration status.')
    })
    return () => { active = false }
  }, [])

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  function signOut() {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900">
      <AdminNavbar activePath="/admin/backup-recovery" mobileMenuOpen={mobileMenuOpen} onMobileMenuClose={() => setMobileMenuOpen(false)} />
      <section className="min-h-screen lg:pl-72">
        <AdminPageHeader pageName="Backup & recovery" subtitle="Database protection and recovery procedure" onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={signOut} />
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <section className="rounded-3xl bg-[#09244a] p-6 text-white shadow-xl shadow-blue-950/15">
            <span className="rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Operational security</span>
            <h1 className="mt-3 text-2xl font-black sm:text-3xl">Backup &amp; Recovery</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">Configure the scheduled backup in the secured database environment. Credentials stay in the backend environment and never reach this browser page.</p>
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-base font-black text-slate-900">Scheduled PostgreSQL dump</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">Run daily and before database migrations. Use secured storage outside the app server.</p></div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.58rem] font-extrabold text-amber-800">{backupInfo ? 'External schedule required' : 'Checking access'}</span>
              </div>
              {backupInfoError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-700">{backupInfoError}</p>}
              {backupInfo && <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-900">The application does not run scheduled dumps. Configure the job described in <code>{backupInfo.guide}</code> using <code>{backupInfo.script}</code>.</p>}
              <div className="mt-4 rounded-xl bg-slate-950 p-4 text-xs text-slate-100"><code>{command}</code></div>
              <button type="button" onClick={() => void copyCommand()} className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-extrabold text-slate-600">{copied ? 'Copied' : 'Copy command'}</button>
              <ol className="mt-4 list-inside list-decimal space-y-2 text-xs leading-relaxed text-slate-600">
                <li>Install PostgreSQL client tools so <code>pg_dump</code> is available.</li>
                <li>Keep <code>DATABASE_URL</code> only in <code>backend/.env</code> or the protected deployment secret store.</li>
                <li>Schedule the included PowerShell backup script with Windows Task Scheduler or an equivalent secure job runner.</li>
                <li>Copy backup files to encrypted off-site or managed storage and restrict access.</li>
              </ol>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-black text-slate-900">Recovery and restore drill</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Practice recovery against a separate staging database before planning any production restore.</p>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-extrabold text-amber-900">Protect the target database</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">A restore can replace existing data. Verify the target URL and backup timestamp, then restore to a new staging database first.</p>
              </div>
              <div className="mt-4 space-y-3 text-xs text-slate-600">
                <p><strong>1.</strong> Restore the custom dump to a separate PostgreSQL database using <code>pg_restore --no-owner</code>.</p>
                <p><strong>2.</strong> Verify inventory, user roles, requests, asset-unit tags, issuance, returns, movements, and audit history.</p>
                <p><strong>3.</strong> Record the tested backup timestamp and recovery time in the operations log.</p>
                <p><strong>4.</strong> For production, use the database provider's managed backup and point-in-time recovery controls alongside off-site dumps.</p>
              </div>
            </article>
          </section>
          <p className="mt-4 text-[0.65rem] leading-relaxed text-slate-500">The app records operational data; scheduling, encryption, storage retention, and restore testing must run in the secured database/deployment environment. See <code>backend/database/backup-recovery.md</code>.</p>
        </div>
      </section>
    </main>
  )
}
