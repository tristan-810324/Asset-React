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
  changeHistory: Array<{
    changedAt: string
    changedBy: string | null
    reason: string
  }>
}

export type EmployeeProfileInput = Omit<EmployeeProfile, 'id' | 'assignedCount' | 'changeHistory'> & {
  employeeCode: string
  pictureData?: string | null
  reason?: string
}

export type DepartmentProfile = {
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
