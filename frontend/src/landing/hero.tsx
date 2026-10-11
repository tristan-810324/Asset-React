import Navbar from '../components/navbars/navbar'

export default function Hero() {
  return (
    <main
      id="home"
      className="relative isolate flex min-h-screen items-center overflow-hidden bg-slate-950 font-['Plus_Jakarta_Sans']"
    >
      {/* Background Campus Image */}
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/dyci_img/homepage5.jpg')" }}
        role="img"
        aria-label="Dr. Yanga's Colleges campus"
      />

      {/* Subtle Dark Glass Overlays for Readability */}
      <div className="absolute inset-0 -z-10 bg-slate-950/20" />
      <div className="absolute inset-0 -z-10 bg-linear-to-t from-slate-950/90 via-slate-950/25 to-slate-950/40" />
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-slate-950/80 via-slate-950/35 to-transparent" />

      {/* Top Navigation */}
      <Navbar />

      {/* Hero Content Section */}
      <section className="mx-auto w-full max-w-7xl px-5 pb-14 pt-32 sm:px-8 sm:pb-16 sm:pt-36 lg:px-12 lg:pb-20 lg:pt-40">
        <div className="max-w-2xl sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          
          {/* Pill Badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/50 px-3.5 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-slate-200 backdrop-blur-md sm:mb-6 sm:px-4 sm:text-xs">
            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            DR. YANGA&apos;S COLLEGES, INC.
          </div>

          {/* Main Title (Fixed to 2 Lines Max) */}
          <h1 className="text-[2.2rem] font-black leading-[1.05] tracking-tight text-white sm:text-[3.2rem] md:text-[3.6rem] lg:text-[3.85rem] xl:text-[4.15rem]">
            Master Your School&apos;s Data
            <span className="mt-1 block">
              <span className="bg-linear-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">
                Without{" "}
              </span>
              <span className="text-slate-100">the </span>
              <span className="bg-linear-to-r from-sky-300 via-blue-200 to-indigo-200 bg-clip-text text-transparent">
                Headache.
              </span>
            </span>
          </h1>

          {/* Subtitle Paragraph */}
          <p className="mt-4 max-w-lg text-xs font-medium leading-relaxed text-slate-200/90 sm:mt-5 sm:text-sm sm:leading-relaxed lg:max-w-xl">
            The GSO keeps your school&apos;s master data organized in one system—from available equipment to every item deployed across departments. See exactly{" "}
            <strong className="font-extrabold text-white">
              what was assigned, where it went, and who received it.
            </strong>
          </p>

          {/* Fully Responsive Buttons */}
          <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:gap-4">
            <a
              href="/dashboard"
              className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/30 transition-all hover:-translate-y-0.5 hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:min-w-48"
            >
              Access Dashboard
              <span aria-hidden="true" className="text-base leading-none">→</span>
            </a>

            <a
              href="#about"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-slate-900/50 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-slate-200 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-slate-800/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:min-w-48"
            >
              Explore Features
            </a>
          </div>

        </div>
      </section>
    </main>
  )
}