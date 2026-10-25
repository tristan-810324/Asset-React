import { useEffect } from 'react'
import LandingPageFooter from '../components/footer'
import Navbar from '../components/navbars/navbar'
import { AboutSection } from './about'
import { ContactSection } from './contact'
import { FAQSection } from './faq'
import { FeaturesSection } from './features'
import Hero from './hero'
import { WorkflowSection } from './workflow'

export default function LandingHome() {
  useEffect(() => {
    const pathSection = window.location.pathname.slice(1)
    const directSection = ['about', 'faq', 'contact'].includes(pathSection) ? pathSection : ''
    const sectionId = decodeURIComponent(window.location.hash.slice(1)) || directSection
    if (!sectionId) return

    if (!window.location.hash && directSection) {
      window.history.replaceState(null, '', `/#${directSection}`)
    }

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [])

  return (
    <div className="min-h-screen bg-white font-['Plus_Jakarta_Sans'] text-slate-900">
      <Navbar />
      <a href="#main-content" className="sr-only fixed left-4 top-4 z-60 rounded-lg bg-white px-4 py-3 text-sm font-bold text-blue-900 shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-blue-600">
        Skip to content
      </a>
      <Hero />

      <main id="main-content">
        <FeaturesSection />
        <WorkflowSection />
        <AboutSection />
        <FAQSection />
        <ContactSection />
      </main>

      <LandingPageFooter />
    </div>
  )
}
