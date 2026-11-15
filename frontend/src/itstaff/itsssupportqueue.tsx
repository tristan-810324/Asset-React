import { useEffect, useState } from 'react'
import { getCurrentUser } from '../auth/authApi'
import ITSSNavbar from '../components/navbars/itssnavbar'
import { ServiceWorkboard } from '../gso/serviceworkboard'

// IT Admin accounts work inside the admin console, so the shared computer lab link opens their admin queue.
export default function ITSSSupportQueue() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((user) => {
        if (!active) return
        if (user.roles.includes('IT_ADMIN') && !user.roles.includes('IT_STAFF')) {
          window.location.replace(`/admin/support-queue${window.location.search}`)
          return
        }
        setReady(true)
      })
      .catch(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  if (!ready) return null

  return (
    <ITSSNavbar
      currentPage="Support Queue"
      title="ITSS Support Queue"
      subtitle="Computer laboratory and technical requests routed to IT Staff"
    >
      <ServiceWorkboard team="ITSS" />
    </ITSSNavbar>
  )
}
