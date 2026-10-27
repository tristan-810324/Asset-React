import { apiRequest } from '../auth/authApi'

export type UserAccountRole = 'BORROWER' | 'GSO_STAFF' | 'IT_STAFF'

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
  name: string
  email: string
  roleKey: UserAccountRole
  position: string
}

export async function listSystemUsers() {
  const result = await apiRequest<{ users: SystemUserAccount[] }>('/users')
  return result.users
}

export async function listUserPositions() {
  const result = await apiRequest<{ positions: string[] }>('/users/positions')
  return result.positions
}

export async function createSystemUser(input: CreateSystemUserInput) {
  const result = await apiRequest<{ user: SystemUserAccount }>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.user
}
