import { apiRequest } from '../auth/authApi'

// A venue the requester can pick. A venue that asks for details is sent to GSO as "Venue – detail".
export type FacilityVenue = {
  id: string
  label: string
  requiresDetail: boolean
  detailLabel: string | null
}

// A venue as GSO sees it, hidden ones included.
export type ManagedVenue = FacilityVenue & { isActive: boolean }

export type VenueInput = {
  label: string
  requiresDetail: boolean
  detailLabel: string
}

// Requesters get only the venues GSO has not hidden.
export function listFacilityVenues() {
  return apiRequest<{ venues: FacilityVenue[] }>('/facility-options').then((data) => data.venues)
}

// GSO Staff see every venue, hidden ones included.
export function listManagedVenues() {
  return apiRequest<{ venues: ManagedVenue[] }>('/facility-options/manage').then((data) => data.venues)
}

export function createVenue(input: VenueInput) {
  return apiRequest<{ venue: ManagedVenue }>('/facility-options', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((data) => data.venue)
}

// Edits a name, its question, or whether it is shown.
export function updateVenue(id: string, change: Partial<VenueInput> & { isActive?: boolean }) {
  return apiRequest<{ venue: ManagedVenue }>(`/facility-options/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(change),
  }).then((data) => data.venue)
}

export function deleteVenue(id: string) {
  return apiRequest<{ venue: ManagedVenue }>(`/facility-options/${id}`, {
    method: 'DELETE',
  }).then((data) => data.venue)
}
