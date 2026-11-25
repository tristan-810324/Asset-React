import AuditLogView from '../components/audit/auditlogview'
import { AdminPageFrame } from '../components/navbars/adminnavbar'

export default function AuditLogs() {
  return (
    <AuditLogView
      variant="activity"
      frame={(content) => (
        <AdminPageFrame activePath="/admin/audit-logs" pageName="Audit logs" subtitle="Items, issuances, returns, requests, and employee changes">
          {content}
        </AdminPageFrame>
      )}
    />
  )
}
