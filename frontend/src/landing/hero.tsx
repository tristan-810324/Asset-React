export default function Hero() {
  return (
    <section
      id="home"
      aria-labelledby="home-heading"
      className="relative isolate flex min-h-[min(100svh,38rem)] items-center overflow-hidden bg-slate-950 font-['Plus_Jakarta_Sans'] sm:min-h-[max(100svh,42rem)]"
    >
      <div
        className="absolute inset-0 -z-20 bg-cover bg-position-[center_42%] bg-no-repeat"
        style={{ backgroundImage: "url('/dyci_img/mainhome.jpg')" }}
        role="img"
        aria-label="Dr. Yanga's Colleges campus"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-slate-950/25" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-slate-950/90 via-slate-950/25 to-slate-950/45" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-r from-slate-950/85 via-slate-950/45 to-slate-950/5" />

      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-24 sm:px-8 sm:pb-16 sm:pt-36 lg:px-12 lg:pb-20">
        <div className="max-w-3xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/45 px-3.5 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.15em] text-slate-100 backdrop-blur-md sm:mb-6 sm:gap-2.5 sm:px-4 sm:py-2 sm:text-xs">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.75)]" />
            Dr. Yanga&apos;s Colleges, Inc.
          </p>

          <h1 id="home-heading" className="max-w-3xl text-[2rem] font-black leading-[1.08] tracking-tighter text-white sm:text-4xl md:text-5xl lg:text-6xl">
            Keep school equipment{' '}
            <span className="bg-linear-to-r from-sky-200 via-blue-200 to-white bg-clip-text text-transparent">easier to manage.</span>
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-100/90 sm:mt-5 sm:text-base sm:leading-7">
            A.SSET brings DYCI equipment records and GSO workflows together—from item details and staff assignments to returns and repair follow-up.
          </p>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:items-center sm:gap-4">
            <a
              href="/login"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[0.68rem] font-extrabold uppercase tracking-widest text-white shadow-lg shadow-blue-950/30 transition hover:-translate-y-0.5 hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700 sm:min-h-12 sm:min-w-48 sm:gap-2.5 sm:px-6 sm:py-3.5 sm:text-xs"
            >
              Access the portal <span aria-hidden="true" className="text-base leading-none">→</span>
            </a>
            <a
              href="#about"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/25 bg-slate-950/40 px-4 py-2.5 text-[0.68rem] font-extrabold uppercase tracking-widest text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:min-h-12 sm:min-w-48 sm:px-6 sm:py-3.5 sm:text-xs"
            >
              Explore A.SSET
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
