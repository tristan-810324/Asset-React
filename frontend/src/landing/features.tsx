import type { ReactNode } from 'react'

type FeatureKind = 'transfer' | 'repair' | 'roles'

type Feature = {
  number: string
  title: string
  description: string
  kind: FeatureKind
}

const features: Feature[] = [
  {
    number: '02',
    title: 'Issuance and returns',
    description: 'Follow equipment assignments and keep return activity connected to each item.',
    kind: 'transfer',
  },
  {
    number: '03',
    title: 'Repair follow-up',
    description: 'Keep equipment that needs attention easy for GSO to find and follow up.',
    kind: 'repair',
  },
  {
    number: '04',
    title: 'Role-based workspaces',
    description: 'Give GSO Staff and IT Admin focused tools for the work they manage.',
    kind: 'roles',
  },
]

function FeatureIcon({ kind, className = 'h-6 w-6' }: { kind: FeatureKind | 'inventory'; className?: string }) {
  const paths: Record<FeatureKind | 'inventory', ReactNode> = {
    inventory: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21" /></>,
    transfer: <><path d="M8 7h12m0 0-4-4m4 4-4 4M16 17H4m0 0 4 4m-4-4 4-4" /></>,
    repair: <><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3 3-3.4-3.4 3.4-3Z" /></>,
    roles: <><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20m16 0v-1.5a4.5 4.5 0 0 0-3-4.24M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-6.8a4 4 0 0 1 0 7.6" /></>,
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[kind]}
    </svg>
  )
}

function InventoryPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-88 sm:max-w-108 lg:justify-self-end">
      <div className="absolute -right-4 -top-5 h-24 w-24 rounded-full bg-sky-300/25 blur-2xl" />
      <div className="absolute -bottom-5 -left-4 h-24 w-24 rounded-full bg-blue-300/20 blur-2xl" />
      <div className="relative rounded-[1.3rem] border border-white/20 bg-white/10 p-3 shadow-2xl shadow-blue-950/25 backdrop-blur-xl sm:rounded-[1.6rem] sm:p-4">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 sm:gap-4 sm:pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-300/15 text-sky-100 ring-1 ring-white/10 sm:h-10 sm:w-10 sm:rounded-xl">
              <FeatureIcon kind="inventory" className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span>
              <span className="block text-[0.65rem] font-extrabold text-white sm:text-xs">EQUIPMENT RECORDS</span>
              <span className="mt-1 hidden text-[0.65rem] font-medium text-blue-100/70 sm:block">Organized in one workspace</span>
            </span>
          </div>
          <span className="h-2.5 w-2.5 rounded-full bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,0.65)]" />
        </div>
        <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-2.5">
          {[0, 1].map((row) => (
            <div key={row} className={`items-center gap-2.5 rounded-xl border border-white/10 bg-slate-950/15 px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-3 ${row === 1 ? 'hidden sm:flex' : 'flex'}`}>
              <span className={`h-7 w-7 shrink-0 rounded-lg sm:h-9 sm:w-9 ${row === 1 ? 'bg-sky-200/15' : 'bg-white/10'}`} />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block h-2 w-2/3 rounded-full bg-white/55" />
                <span className="block h-1.5 w-1/2 rounded-full bg-blue-100/25" />
              </span>
              <span className="h-5 w-14 shrink-0 rounded-full border border-sky-100/15 bg-sky-200/10" />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 right-3 flex items-center gap-1.5 rounded-lg border border-white/20 bg-white px-2.5 py-1.5 text-[0.56rem] font-extrabold uppercase tracking-[0.08em] text-blue-900 shadow-lg shadow-blue-950/20 sm:-bottom-4 sm:right-8 sm:gap-2 sm:rounded-xl sm:px-3.5 sm:py-2.5 sm:text-[0.65rem] sm:tracking-widest">
        <span className="h-2 w-2 rounded-full bg-blue-600" />A.SSET · DYCI
      </div>
    </div>
  )
}

function CapabilityPreview({ kind }: { kind: 'transfer' | 'repair' }) {
  const isTransfer = kind === 'transfer'
  const checkpoints = isTransfer ? ['Assignment', 'Return status'] : ['Needs attention', 'Follow-up']

  return (
    <div aria-hidden="true" className="mt-auto pt-3 sm:pt-5">
      <div className="flex items-center justify-between gap-2 border-t border-blue-100 pt-3 sm:hidden">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
          <FeatureIcon kind={kind} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-[0.62rem] font-bold text-slate-500">{isTransfer ? 'Assignment to return' : 'Repair follow-up'}</span>
        <span className="h-1.5 w-12 shrink-0 rounded-full bg-linear-to-r from-blue-600 to-sky-300" />
      </div>
      <div className="hidden rounded-xl border border-blue-100/90 bg-linear-to-br from-[#f8faff] to-white px-3.5 py-3 sm:block">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">Equipment workflow</span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.58rem] font-extrabold text-blue-700">
            {isTransfer ? 'Issue → return' : 'Repair follow-up'}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {checkpoints.map((checkpoint, index) => (
            <span key={checkpoint} className="flex min-w-0 items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-[0.62rem] font-bold text-slate-600 ring-1 ring-slate-200/80">
              <span className={`h-2 w-2 shrink-0 rounded-full ${index === 0 ? 'bg-blue-600' : 'bg-sky-300'}`} />
              <span className="truncate">{checkpoint}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function CapabilityCard({ feature }: { feature: Feature }) {
  const isRoles = feature.kind === 'roles'

  return (
    <article className={`group relative isolate overflow-hidden rounded-[1.25rem] border border-blue-100/90 bg-white p-4 shadow-[0_10px_35px_-22px_rgba(15,37,79,0.32)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_22px_55px_-28px_rgba(15,37,79,0.35)] sm:rounded-3xl sm:p-6 ${isRoles ? 'col-span-2 max-[360px]:col-span-1 sm:col-span-2 lg:col-span-4 lg:grid lg:grid-cols-[1fr_0.9fr] lg:items-center lg:gap-7' : 'flex min-h-0 flex-col sm:min-h-56 lg:col-span-2 lg:min-h-64'}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-16 -z-10 h-48 w-48 rounded-full bg-blue-100/80 blur-3xl transition duration-300 group-hover:bg-sky-100" />
      <div className={isRoles ? 'relative z-10 max-w-xl' : 'relative z-10'}>
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition group-hover:bg-blue-700 group-hover:text-white group-hover:ring-blue-700">
            <FeatureIcon kind={feature.kind} />
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.12em] text-blue-300">{feature.number}</span>
        </div>
        <div className="mt-4 sm:mt-5">
          <h3 className="text-base font-extrabold leading-tight tracking-tight text-slate-950 sm:text-xl">{feature.title}</h3>
          <p className="mt-2 max-w-xl text-xs leading-5 text-slate-600 sm:mt-2.5 sm:text-[0.95rem] sm:leading-6">{feature.description}</p>
        </div>
      </div>

      {isRoles ? (
        <div role="group" aria-label="GSO Staff and IT Admin workspaces" className="mt-4 grid grid-cols-2 gap-2 lg:mt-0 sm:mt-6 sm:gap-3">
          <div className="rounded-xl border border-blue-100 bg-white/85 p-3 shadow-sm sm:rounded-2xl sm:p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-700 text-xs font-black text-white shadow-md shadow-blue-900/15 sm:h-11 sm:w-11 sm:rounded-xl sm:text-sm">GS</span>
            <span className="mt-3 block text-xs font-extrabold text-slate-900 sm:mt-4 sm:text-sm">GSO Staff</span>
            <span className="mt-1 block text-[0.65rem] leading-4 text-slate-500 sm:text-xs sm:leading-5">Equipment workflows</span>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white/85 p-3 shadow-sm sm:rounded-2xl sm:p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-100 text-xs font-black text-blue-800 sm:h-11 sm:w-11 sm:rounded-xl sm:text-sm">IT</span>
            <span className="mt-3 block text-xs font-extrabold text-slate-900 sm:mt-4 sm:text-sm">IT Admin</span>
            <span className="mt-1 block text-[0.65rem] leading-4 text-slate-500 sm:text-xs sm:leading-5">Portal access</span>
          </div>
        </div>
      ) : (
        <CapabilityPreview kind={feature.kind === 'repair' ? 'repair' : 'transfer'} />
      )}
    </article>
  )
}

export function FeaturesSection() {
  return (
    <section id="features" aria-labelledby="capabilities-heading" className="relative isolate overflow-hidden bg-[#f4f8ff] px-4 py-8 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg className="absolute inset-0 h-full w-full opacity-45" aria-hidden="true">
          <defs>
            <pattern id="features-grid-pattern" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="#2563eb" strokeOpacity="0.1" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#features-grid-pattern)" />
        </svg>
        <div className="absolute -right-40 -top-40 h-136 w-136 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-56 -left-40 h-136 w-136 rounded-full bg-sky-100/80 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.72fr] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-3.5 py-2 text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-blue-800 shadow-sm shadow-blue-900/5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-blue-600" />A clearer equipment picture
            </p>
            <h2 id="capabilities-heading" className="mt-3 max-w-3xl text-2xl font-black leading-[1.08] tracking-[-0.045em] text-slate-950 sm:mt-4 sm:text-4xl lg:text-5xl">
              The records teams need, <span className="text-blue-700">all in one place.</span>
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-7 lg:justify-self-end">
            A.SSET supports the day-to-day work of keeping school equipment documented, assigned, and accounted for.
          </p>
        </div>

        {/* Adapted from Magic UI's free, MIT-licensed Bento Grid pattern. */}
        <div className="mt-5 grid grid-cols-2 gap-3 max-[360px]:grid-cols-1 sm:mt-7 sm:grid-cols-2 sm:gap-4 lg:mt-9 lg:grid-cols-6 lg:auto-rows-[minmax(16rem,auto)]">
          <article className="group relative isolate col-span-2 max-[360px]:col-span-1 overflow-hidden rounded-3xl border border-blue-900/20 bg-linear-to-br from-[#081d42] via-[#0b2b60] to-[#15528f] p-4 text-white shadow-[0_24px_70px_-30px_rgba(5,27,64,0.52)] sm:col-span-2 sm:rounded-[1.75rem] sm:p-7 lg:col-span-4 lg:grid lg:min-h-72 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-6 lg:p-7">
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_22%,rgba(125,211,252,0.24),transparent_33%),radial-gradient(circle_at_12%_95%,rgba(37,99,235,0.25),transparent_38%)]" />
            <div className="relative z-10 max-w-xl">
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-sky-100">Core workspace</span>
                <span className="font-mono text-sm font-bold tracking-[0.12em] text-sky-200/70">01 / 04</span>
              </div>
              <span className="mt-4 grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-sky-200 ring-1 ring-white/15 shadow-lg shadow-blue-950/20 sm:mt-6 sm:h-12 sm:w-12 sm:rounded-2xl">
                <FeatureIcon kind="inventory" className="h-5 w-5 sm:h-7 sm:w-7" />
              </span>
              <h3 className="mt-4 max-w-lg text-xl font-black leading-tight tracking-[-0.04em] sm:mt-5 sm:text-3xl">Organized inventory records</h3>
              <p className="mt-2 max-w-lg text-xs leading-5 text-blue-100/85 sm:mt-3 sm:text-[0.95rem] sm:leading-7">
                Keep school equipment details together so GSO staff can review, maintain, and follow each item.
              </p>
            </div>
            <div className="mt-5 lg:mt-0"><InventoryPreview /></div>
          </article>

          {features.map((feature) => <CapabilityCard key={feature.number} feature={feature} />)}
        </div>
      </div>
    </section>
  )
}
