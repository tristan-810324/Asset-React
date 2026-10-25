import { apiRequest } from '../auth/authApi'

export type RolePermission = { key: string; description: string }
export type SystemRole = { roleKey: string; displayName: string; permissions: RolePermission[] }
export type SystemPermission = RolePermission
export type SystemSecurityEvent = {
  id: string
  eventType: string
  targetRoleKey: string | null
  oldValues: Record<string, unknown>
  newValues: Record<string, unknown>
  createdAt: string
  actorName: string | null
  actorEmail: string | null
  ipAddress: string | null
}

export function listSystemRoles() {
  return apiRequest<{ roles: SystemRole[] }>('/admin/roles').then((data) => data.roles)
}

export function listSystemPermissionCatalog() {
  return apiRequest<{ permissions: SystemPermission[] }>('/admin/permissions').then((data) => data.permissions)
}

export function listSystemSecurityEvents() {
  return apiRequest<{ events: SystemSecurityEvent[] }>('/admin/security-events').then((data) => data.events)
}

export function getBackupOperationsInfo() {
  return apiRequest<{ backupMode: string; scheduledJobConfiguredInApp: boolean; script: string; guide: string }>('/admin/backup-info')
}

export function updateSystemRolePermissions(roleKey: string, permissionKeys: string[]) {
  return apiRequest<{ roles: SystemRole[] }>(`/admin/roles/${encodeURIComponent(roleKey)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissionKeys }),
  }).then((data) => data.roles)
}
