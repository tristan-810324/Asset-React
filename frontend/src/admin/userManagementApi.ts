import { apiRequest } from '../auth/authApi'

export type UserAccountRole = 'BORROWER' | 'GSO_STAFF' | 'GSO_HEAD' | 'IT_STAFF'

export type SystemUserAccount = {
  id: string
  name: string
  email: string
  position: string
  roles: string[]
  isActive: boolean
  emailVerifiedAt: string | null
  createdAt: string
}

export type CreateSystemUserInput = {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  employeeCode: string
  department: string
  position: string
  contactNumber: string
  email: string
  roleKey: UserAccountRole
}

export async function listSystemUsers() {
  const result = await apiRequest<{ users: SystemUserAccount[] }>('/users')
  return result.users
}

export async function listUserPositions() {
  const result = await apiRequest<{ positions: string[] }>('/users/positions')
  return result.positions
}

export async function setSystemUserActive(userId: string, isActive: boolean) {
  const result = await apiRequest<{ user: { id: string; isActive: boolean } }>(`/users/${encodeURIComponent(userId)}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  })
  return result.user
}

export async function deleteSystemUser(userId: string) {
  await apiRequest<{ user: { id: string } }>(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export async function createSystemUser(input: CreateSystemUserInput) {
  const result = await apiRequest<{ user: SystemUserAccount }>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.user
}
