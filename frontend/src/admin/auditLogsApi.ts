import { apiRequest } from '../auth/authApi'

export type AuditLogAction = 'created' | 'updated' | 'renamed' | 'deleted' | 'requested' | 'issued' | 'returned' | 'received' | 'approved' | 'rejected' | 'cancelled' | 'moved'
export type AuditLogEntityType = 'item' | 'category' | 'employee' | 'request' | 'signature'
export type AuditLogFlag = 'MANUAL_ENTRY' | 'ITEM_LOST' | 'DELIVERY_UNDONE' | 'RECORD_DELETED' | 'LABEL_REPRINT' | 'FINANCE_PDF_REPRINT'

export type AuditLogEntry = {
  id: string
  entityType: AuditLogEntityType
  entityId: string
  entityName: string
  action: AuditLogAction
  flag: AuditLogFlag | null
  requestId: string | null
  reason: string
  oldValues: Record<string, unknown>
  newValues: Record<string, unknown>
  changedBy: string | null
  changedAt: string
}

export type AuditLogFilters = {
  limit: number
  offset: number
  action: 'all' | AuditLogAction
  entityType: 'all' | AuditLogEntityType
  // 'any' shows every red-flagged entry; a specific flag shows only that one.
  flag: 'all' | 'any' | AuditLogFlag
  search: string
  from: string
  to: string
}

export type AuditLogPage = {
  logs: AuditLogEntry[]
  total: number
  limit: number
  offset: number
  flaggedLast30Days: number
}

export async function listAuditLogs(filters: AuditLogFilters) {
  const query = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
    action: filters.action,
    entityType: filters.entityType,
    flag: filters.flag,
    search: filters.search.trim(),
    from: filters.from,
    to: filters.to,
  })
  return apiRequest<AuditLogPage>(`/audit/logs?${query.toString()}`)
}
