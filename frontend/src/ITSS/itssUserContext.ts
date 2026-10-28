import { createContext, useContext } from 'react'
import type { AuthUser } from '../auth/authApi'

export const ITSSUserContext = createContext<AuthUser | null>(null)

export function useITSSUser() {
  return useContext(ITSSUserContext)
}
