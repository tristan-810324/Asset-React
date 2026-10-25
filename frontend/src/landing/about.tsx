export function AboutSection() {
  return (
    <section id="about" aria-labelledby="about-heading" className="relative isolate overflow-hidden bg-white px-4 py-8 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-blue-100/70 blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl">
        <div className="grid overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_28px_90px_-48px_rgba(15,37,79,0.34)] sm:rounded-4xl lg:grid-cols-[0.94fr_1.06fr] lg:items-center">
          <figure className="group relative min-h-60 overflow-hidden bg-[#0b2551] sm:min-h-96 lg:h-128 lg:min-h-0">
            <img
              src="/dyci_img/homepage1.jpg"
              alt="Students and staff gathered around a campus robot exhibit at Dr. Yanga's Colleges"
              className="absolute inset-0 h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.025]"
              loading="lazy"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-[#071a3c]/90 via-[#071a3c]/10 to-[#071a3c]/10" />
            <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#071a3c]/55 px-3 py-1.5 text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-white backdrop-blur-md sm:left-7 sm:top-7 sm:py-2 sm:text-[0.62rem] sm:tracking-[0.14em]">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-300" />Built for DYCI
            </div>
            <figcaption className="absolute bottom-4 left-4 right-4 flex items-center gap-2.5 rounded-xl border border-white/70 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur sm:bottom-7 sm:left-7 sm:right-auto sm:min-w-76 sm:gap-3 sm:rounded-2xl sm:px-5 sm:py-4">
              <img src="/dyci_img/dyci-logo.webp" alt="" className="h-9 w-9 shrink-0 object-contain sm:h-11 sm:w-11" loading="lazy" />
              <span>
                <span className="block text-sm font-extrabold text-slate-950">Dr. Yanga&apos;s Colleges, Inc.</span>
                <span className="mt-0.5 block text-xs text-slate-500">A.SSET equipment tracking</span>
              </span>
            </figcaption>
          </figure>

          <div className="relative flex flex-col justify-center p-4 sm:p-8 lg:p-9 xl:p-10">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-2 text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-blue-800">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-blue-600" />About A.SSET
            </p>
            <h2 id="about-heading" className="mt-3 max-w-2xl text-2xl font-black leading-[1.1] tracking-[-0.045em] text-slate-950 sm:mt-4 sm:text-4xl lg:text-4xl">
              School equipment records, <span className="text-blue-700">kept in view.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-600 sm:mt-4 sm:text-[0.95rem] sm:leading-7">
              A.SSET is Dr. Yanga&apos;s Colleges&apos; equipment tracking portal. It helps the teams responsible for school equipment organize item records and follow equipment through assignment, return, and repair.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5 max-[360px]:grid-cols-1 sm:mt-6 sm:grid-cols-2 sm:gap-3">
              <article className="group rounded-xl border border-blue-100 bg-[#f6f9ff] p-3 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/6 sm:rounded-2xl sm:p-5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-700 text-[0.65rem] font-black text-white shadow-md shadow-blue-900/15 sm:h-11 sm:w-11 sm:rounded-xl sm:text-xs">GS</span>
                <h3 className="mt-3 text-xs font-extrabold text-slate-950 sm:mt-4 sm:text-base">GSO Staff</h3>
                <p className="mt-1.5 text-[0.68rem] leading-4.5 text-slate-600 sm:mt-2 sm:text-sm sm:leading-6">Manage equipment and employee records, issuance, returns, and repair follow-up.</p>
              </article>
              <article className="group rounded-xl border border-blue-100 bg-[#f6f9ff] p-3 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/6 sm:rounded-2xl sm:p-5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-100 text-[0.65rem] font-black text-blue-800 ring-1 ring-sky-200 sm:h-11 sm:w-11 sm:rounded-xl sm:text-xs">IT</span>
                <h3 className="mt-3 text-xs font-extrabold text-slate-950 sm:mt-4 sm:text-base">IT Admin</h3>
                <p className="mt-1.5 text-[0.68rem] leading-4.5 text-slate-600 sm:mt-2 sm:text-sm sm:leading-6">Support account access and system oversight for the portal.</p>
              </article>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 sm:gap-3">
              <a href="/login" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2.5 text-[0.68rem] font-extrabold text-white shadow-md shadow-blue-900/15 transition hover:-translate-y-0.5 hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:min-h-12 sm:gap-2 sm:px-5 sm:py-3 sm:text-xs">
                Open the portal <span aria-hidden="true">→</span>
              </a>
              <a href="#contact" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[0.68rem] font-extrabold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:min-h-12 sm:px-5 sm:py-3 sm:text-xs">
                Contact the team
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
