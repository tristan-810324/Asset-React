import type { FormEvent } from 'react'

export default function Login() {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  }

  return (
    <main className="min-h-screen bg-white font-['Plus_Jakarta_Sans'] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Hero Image Section (Desktop Only) */}
        <section
          className="relative hidden min-h-107.5 overflow-hidden bg-cover bg-center lg:flex lg:min-h-screen"
          style={{ backgroundImage: "url('/dyci_img/homepage7.jpg')" }}
          aria-label="Dr. Yanga's Colleges campus"
        >
          <div className="absolute inset-0 bg-slate-950/60" />
          <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/30 to-slate-950/10" />

          <a
            href="/"
            className="absolute left-7 top-7 z-10 inline-flex items-center gap-2 rounded-full bg-slate-950/60 px-4 py-2.5 text-xs font-extrabold text-white backdrop-blur-md transition hover:bg-slate-950/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <span aria-hidden="true" className="text-lg leading-none">←</span>
            Back to Home
          </a>

          <div className="relative z-10 mt-auto max-w-xl px-8 pb-12 xl:px-12 xl:pb-14">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/50 px-3.5 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-blue-200 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              DR. YANGA&apos;S COLLEGES, INC.
            </div>

            {/* Inayos na Headline at Gradient Colors */}
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-white xl:text-[3.2rem]">
              Welcome to your
              <span className="mt-1 block">
                <span className="bg-linear-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">
                  modern asset{" "}
                </span>
                <span className="bg-linear-to-r from-sky-300 via-blue-200 to-indigo-200 bg-clip-text text-transparent">
                  command.
                </span>
              </span>
            </h1>

            {/* Inayos na Subtitle Text */}
            <p className="mt-5 max-w-md text-sm font-medium leading-relaxed text-slate-200">
              Seamlessly manage school deployments, equipment tracking, and live audit logs in one unified platform—<strong className="font-extrabold text-white">ensuring campus readiness every day.</strong>
            </p>
          </div>
        </section>

        {/* Login Form Section */}
        <section className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-10 md:py-12 lg:px-16 xl:px-20">
          <a
            href="/"
            className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-extrabold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:left-10 sm:top-6 sm:py-2.5 lg:hidden"
          >
            <span aria-hidden="true" className="text-lg leading-none">←</span>
            Back to Home
          </a>

          {/* Form Container with Tablet Scaling */}
          <div className="w-full max-w-90 md:max-w-120 lg:max-w-100">

            
            {/* Logos */}
            <div className="mb-5 flex items-center justify-center gap-3 sm:mb-6 md:mb-8 md:gap-4">
              <img
                src="/dyci_img/A.sset.webp"
                alt="A.SSET logo"
                className="h-16 w-16 object-contain transition-all sm:h-18 sm:w-18 md:h-20 md:w-20 lg:h-16 lg:w-16"
              />
              <img
                src="/dyci_img/dyci-logo.webp"
                alt="Dr. Yanga's Colleges logo"
                className="h-14 w-14 object-contain transition-all sm:h-15 sm:w-15 md:h-16 md:w-16 lg:h-14 lg:w-14"
              />
            </div>

            <div className="mb-5 md:mb-7">
              <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl md:text-3xl lg:text-2xl">
                Sign in
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500 md:text-sm lg:text-xs">
                Sign in using your registered email account.
              </p>
            </div>

            <form className="space-y-4 md:space-y-5 lg:space-y-4" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-600 md:text-xs lg:text-[0.7rem]"
                >
                  DYCI Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="yourname@example.com"
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 md:h-13 md:text-base lg:h-12 lg:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-600 md:text-xs lg:text-[0.7rem]"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 md:h-13 md:text-base lg:h-12 lg:text-sm"
                />
              </div>

              <div className="flex justify-end pt-0.5">
                <a
                  href="#forgot-password"
                  className="text-xs font-bold text-blue-600 transition hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 md:text-sm lg:text-xs"
                >
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                className="mt-1 flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-blue-600 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25 md:h-13 md:text-sm lg:h-12 lg:text-xs"
              >
                Sign in
                <span aria-hidden="true" className="text-base leading-none md:text-lg">→</span>
              </button>
            </form>

          
          </div>
        </section>
      </div>
    </main>
  )
}