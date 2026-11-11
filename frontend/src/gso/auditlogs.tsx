import AuditLogView from '../components/audit/auditlogview'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { GsoHeadPageFrame } from '../gsohead/gsoheadnavbar'

// GSO Head and GSO Staff share this page; only the navigation frame differs.
export default function GsoAuditLogs() {
  const isHeadView = window.location.pathname.startsWith('/gso-head/')
  return (
    <AuditLogView
      frame={(content) => isHeadView
        ? <GsoHeadPageFrame activePage="audit-logs">{content}</GsoHeadPageFrame>
        : <GsoPageFrame activePage="Audit Logs" searchPlaceholder="Search audit logs...">{content}</GsoPageFrame>}
    />
  )
}
