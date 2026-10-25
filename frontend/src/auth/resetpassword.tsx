import { useEffect, useState, type FormEvent } from 'react'
import {
  clearAuthSession,
  clearPasswordResetState,
  finishPasswordReset,
  getPasswordResetToken,
  getPendingPasswordReset,
} from './authApi'

export default function ResetPassword() {
  const [resetToken] = useState(getPasswordResetToken)
  const [pendingReset] = useState(getPendingPasswordReset)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!resetToken) window.location.replace(pendingReset ? '/reset-otp' : '/forgot-password')
  }, [pendingReset, resetToken])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!resetToken || isSubmitting) return

    const formData = new FormData(event.currentTarget)
    const password = String(formData.get('password') || '')
    const confirmPassword = String(formData.get('confirmPassword') || '')
    if (password !== confirmPassword) {
      setErrorMessage('The password and confirmation do not match.')
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await finishPasswordReset(resetToken, password)
      clearPasswordResetState()
      clearAuthSession()
      window.location.replace('/login')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the password. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-500 selection:text-white">
      <div className="fixed inset-0 z-0 bg-cover bg-center lg:hidden" style={{ backgroundImage: "url('/dyci_img/homepage7.jpg')" }}><div className="absolute inset-0 bg-linear-to-b from-white/40 via-white/20 to-slate-900/30 backdrop-blur-[3px]" /></div>
      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden min-h-107.5 overflow-hidden bg-cover bg-center lg:flex lg:min-h-screen" style={{ backgroundImage: "url('/dyci_img/homepage7.jpg')" }} aria-label="Dr. Yanga's Colleges campus"><div className="absolute inset-0 bg-slate-950/60" /><div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/30 to-slate-950/10" /><a href="/" className="absolute left-7 top-7 z-10 rounded-full bg-slate-950/60 px-4 py-2.5 text-xs font-extrabold text-white backdrop-blur-md transition hover:bg-slate-950/80">← Back to Home</a><div className="relative z-10 mt-auto max-w-xl px-8 pb-12 xl:px-12 xl:pb-14"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/50 px-3.5 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-blue-200 backdrop-blur-md"><span className="h-2 w-2 rounded-full bg-amber-400" />DR. YANGA&apos;S COLLEGES, INC.</div><h1 className="text-4xl font-black leading-[1.08] tracking-tight text-white xl:text-[3.2rem]">Choose a new<span className="mt-1 block bg-linear-to-r from-amber-300 via-amber-400 to-sky-200 bg-clip-text text-transparent">password.</span></h1><p className="mt-5 max-w-md text-sm font-medium leading-relaxed text-slate-200">Set a strong password to keep your A.SSET account safe.</p></div></section>
        <section className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:bg-white lg:px-16 xl:px-20"><a href="/reset-otp" className="absolute left-4 top-4 z-20 rounded-full border border-white/60 bg-white/80 px-3.5 py-1.5 text-[0.7rem] font-extrabold text-slate-800 shadow-sm backdrop-blur-md lg:hidden">← Back</a><div className="relative z-10 w-full max-w-85 rounded-3xl bg-white/85 p-5 shadow-2xl shadow-slate-950/15 backdrop-blur-xl sm:max-w-105 sm:p-7 lg:max-w-100 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
          <div className="mb-3 text-center lg:hidden"><span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/15 bg-blue-50/70 px-2.5 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-blue-700"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" />A.SSET Campus System</span></div><div className="mb-4 flex items-center justify-center gap-2.5 sm:mb-5 sm:gap-3.5"><img src="/dyci_img/A.sset.webp" alt="A.SSET logo" className="h-10 w-10 object-contain sm:h-13 sm:w-13 lg:h-16 lg:w-16" /><div className="h-6 w-px bg-slate-300/80 sm:h-8" /><img src="/dyci_img/dyci-logo.webp" alt="Dr. Yanga's Colleges logo" className="h-9 w-9 object-contain sm:h-11 sm:w-11 lg:h-14 lg:w-14" /></div>
          <div className="mb-5 text-center sm:text-left"><h2 className="text-xl font-black tracking-tight sm:text-2xl">Reset password</h2><p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">Choose a new password for your account.</p>{errorMessage && <p role="alert" className="mt-3 text-xs font-bold text-red-600">{errorMessage}</p>}</div>
          <form className="space-y-4" onSubmit={handleSubmit}><div><label htmlFor="password" className="mb-1 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">New password</label><input id="password" name="password" type="password" autoComplete="new-password" placeholder="Enter a new password" minLength={8} required className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm shadow-sm shadow-slate-900/5 outline-none transition hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 sm:h-12" /></div><div><label htmlFor="confirmPassword" className="mb-1 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" placeholder="Enter it again" minLength={8} required className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm shadow-sm shadow-slate-900/5 outline-none transition hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 sm:h-12" /></div><p className="-mt-2 text-[0.65rem] text-slate-500">Use at least 8 characters.</p><button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-xs font-black uppercase tracking-[0.14em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-500 active:scale-[0.98] sm:h-12">Save new password <span aria-hidden="true">→</span></button></form>
          <div className="mt-5 border-t border-slate-200/70 pt-4 text-center"><p className="text-xs font-semibold text-slate-600">Remembered it? <a href="/login" className="font-extrabold text-blue-600 hover:underline">Sign in</a></p></div>
        </div></section>
      </div>
    </main>
  )
}
