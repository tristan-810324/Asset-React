import { apiRequest } from '../auth/authApi'

export type AuditLogAction = 'created' | 'updated' | 'renamed' | 'deleted'
export type AuditLogEntityType = 'item' | 'category' | 'employee'

export type AuditLogEntry = {
  id: string
  entityType: AuditLogEntityType
  entityId: string
  entityName: string
  action: AuditLogAction
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
  search: string
  from: string
  to: string
}

export type AuditLogPage = {
  logs: AuditLogEntry[]
  total: number
  limit: number
  offset: number
}

export async function listAuditLogs(filters: AuditLogFilters) {
  const query = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
    action: filters.action,
    entityType: filters.entityType,
    search: filters.search.trim(),
    from: filters.from,
    to: filters.to,
  })
  return apiRequest<AuditLogPage>(`/audit/logs?${query.toString()}`)
}
