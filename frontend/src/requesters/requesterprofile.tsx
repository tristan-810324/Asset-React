import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import { IdentityProfileCard } from './identityprofilecard'

function RequesterProfileContent() {
  const { user, identity, identityLoading, identityError, refreshIdentity, openIdentityPrompt } = useRequesterIdentity()

  return <div className="mx-auto max-w-3xl">
    <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
      <div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Staff identity</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Your requester profile</h1><p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">GSO must verify your staff details before you can send a service request.</p></div>
    </section>

    <IdentityProfileCard user={user} identity={identity} identityLoading={identityLoading} identityError={identityError} refreshIdentity={refreshIdentity} openVerificationStatus={openIdentityPrompt} />
  </div>
}

export default function RequesterProfile() {
  return <RequesterLayout title="Profile" subtitle="Update your staff identity and check GSO validation status."><RequesterProfileContent /></RequesterLayout>
}
