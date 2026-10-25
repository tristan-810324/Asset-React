import { apiRequest } from '../auth/authApi'

export type OperationalReports = {
  generatedAt: string
  inventory: Array<Record<string, unknown>>
  requests: Array<Record<string, unknown>>
  issuances: Array<Record<string, unknown>>
  returns: Array<Record<string, unknown>>
  movements: Array<Record<string, unknown>>
  assetUnits: Array<Record<string, unknown>>
}

export function getOperationalReports() {
  return apiRequest<{ reports: OperationalReports }>('/reports/operational').then((data) => data.reports)
}
