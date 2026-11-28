import { useEffect, useState } from 'react'
import { getCurrentUser, type AuthUser } from '../auth/authApi'
import { IdentityProfileCard } from '../requesters/identityprofilecard'
import { IdentityPrompt } from '../requesters/requesterlayout'
import { getMyRequesterIdentity, type RequesterIdentity } from '../requesters/requesterApi'
import { GsoHeadPageFrame } from './gsoheadnavbar'

// The signed-in GSO Head's staff identity. It is the same card the requester profile shows, and GSO Staff verify it.
export default function GsoHeadProfile() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [identity, setIdentity] = useState<RequesterIdentity | null>(null)
  const [identityLoading, setIdentityLoading] = useState(true)
  const [identityError, setIdentityError] = useState('')
  const [promptOpen, setPromptOpen] = useState(false)

  useEffect(() => {
    let active = true
    const userRequest = getCurrentUser()
      .then((current) => { if (active) setUser(current) })
      .catch(() => { if (active) setUser(null) })
    const identityRequest = getMyRequesterIdentity()
      .then((next) => { if (active) { setIdentity(next); setIdentityError('') } })
      .catch((reason: unknown) => { if (active) setIdentityError(reason instanceof Error ? reason.message : 'Unable to load your staff details.') })
    Promise.all([userRequest, identityRequest]).finally(() => { if (active) setIdentityLoading(false) })
    return () => { active = false }
  }, [])

  const refreshIdentity = async () => {
    setIdentityLoading(true)
    try {
      const next = await getMyRequesterIdentity()
      setIdentity(next)
      setIdentityError('')
      return next
    } catch (reason) {
      setIdentityError(reason instanceof Error ? reason.message : 'Unable to refresh your staff details.')
      return null
    } finally {
      setIdentityLoading(false)
    }
  }

  return (
    <GsoHeadPageFrame activePage="profile">
      <div className="mx-auto max-w-3xl">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">GSO Head workspace</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Your profile</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">IT Admin verifies your staff details.</p>
          </div>
        </section>

        <IdentityProfileCard user={user} identity={identity} identityLoading={identityLoading} identityError={identityError} refreshIdentity={refreshIdentity} openVerificationStatus={() => setPromptOpen(true)} />
      </div>

      {promptOpen && identity && <IdentityPrompt identity={identity} onSaved={setIdentity} onClose={() => setPromptOpen(false)} />}
    </GsoHeadPageFrame>
  )
}
