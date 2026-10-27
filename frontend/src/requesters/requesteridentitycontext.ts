import { createContext, useContext } from 'react'
import type { AuthUser } from '../auth/authApi'
import type { RequesterIdentity } from './requesterApi'

export type RequesterIdentityContextValue = {
  user: AuthUser | null
  identity: RequesterIdentity | null
  identityLoading: boolean
  identityError: string
  refreshIdentity: () => Promise<RequesterIdentity | null>
  openIdentityPrompt: () => void
  dismissIdentityPrompt: () => void
}

export const RequesterIdentityContext = createContext<RequesterIdentityContextValue | null>(null)

export function useRequesterIdentity() {
  const context = useContext(RequesterIdentityContext)
  if (!context) throw new Error('useRequesterIdentity must be rendered inside RequesterLayout.')
  return context
}
