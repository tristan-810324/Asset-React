import { apiRequest } from '../auth/authApi'

export type EmployeeProfile = {
  id: string
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  department: string
  position: string
  email: string
  status: 'Active' | 'Inactive'
  assignedCount: number
  // True while the employee has items out, a pending issuance or return, or an unsettled lost item.
  emailLocked: boolean
  changeHistory: Array<{
    changedAt: string
    changedBy: string | null
    reason: string
  }>
}

export type EmployeeProfileInput = Omit<EmployeeProfile, 'id' | 'assignedCount' | 'emailLocked' | 'changeHistory'> & {
  employeeCode: string
  pictureData?: string | null
  reason?: string
}

export type DepartmentProfile = {
  id: string
  name: string
}

export type EmployeePositionProfile = {
  id: string
  name: string
}

export async function listEmployees() {
  return apiRequest<{ employees: EmployeeProfile[] }>('/employees')
}

export async function createEmployee(input: EmployeeProfileInput) {
  return apiRequest<{ employee: EmployeeProfile }>('/employees', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateEmployee(employeeCode: string, input: EmployeeProfileInput & { reason: string }) {
  return apiRequest<{ employee: EmployeeProfile }>(`/employees/${encodeURIComponent(employeeCode)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function listDepartments() {
  return apiRequest<{ departments: DepartmentProfile[] }>('/departments')
}

export async function createDepartment(name: string) {
  return apiRequest<{ department: DepartmentProfile }>('/departments', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function renameDepartment(id: string, input: { name: string; reason: string }) {
  return apiRequest<{ department: DepartmentProfile; renamedEmployeeCount: number; updatedRequesterProfileCount: number }>(`/departments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteDepartment(id: string, input: { replacementDepartmentId: string; reason: string }) {
  return apiRequest<{ deletedDepartmentId: string; replacementDepartment: DepartmentProfile; reassignedEmployeeCount: number; updatedRequesterProfileCount: number }>(`/departments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify(input),
  })
}

export async function listEmployeePositions() {
  return apiRequest<{ positions: EmployeePositionProfile[] }>('/employees/positions')
}

export async function createEmployeePosition(name: string) {
  return apiRequest<{ position: EmployeePositionProfile }>('/employees/positions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function renameEmployeePosition(id: string, input: { name: string; reason: string }) {
  return apiRequest<{ position: EmployeePositionProfile; renamedEmployeeCount: number; updatedRequesterProfileCount: number; updatedUserCount: number }>(`/employees/positions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteEmployeePosition(id: string, input: { replacementPositionId: string; reason: string }) {
  return apiRequest<{ deletedPositionId: string; replacementPosition: EmployeePositionProfile; reassignedEmployeeCount: number; updatedRequesterProfileCount: number; updatedUserCount: number }>(`/employees/positions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify(input),
  })
}
