import { apiRequest } from '../auth/authApi'

export type MyActivityRecord = {
  id: string | number
  entityType: string
  entityName: string
  entityKey: string
  action: string
  reason: string
  flag: string | null
  changedAt: string
}

export async function listMyAdminActivity() {
  const result = await apiRequest<{ activity: MyActivityRecord[] }>('/audit/my-activity')
  return result.activity
}
