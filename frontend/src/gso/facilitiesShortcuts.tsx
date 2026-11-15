type FacilitiesDestination = 'facilities' | 'requests'

const shortcuts: Array<{ destination: FacilitiesDestination; label: string; href: string }> = [
  { destination: 'facilities', label: 'View facilities', href: '/gso/facilities-equipment' },
  { destination: 'requests', label: 'Facility requests', href: '/gso/facility-requests' },
]

// Same navigation row as RequisitionIssuanceShortcuts: the current page is highlighted, the other links stay available.
export function FacilitiesShortcuts({ active }: { active: FacilitiesDestination }) {
  return <nav className="mt-5 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="Facilities navigation">
    {shortcuts.map((shortcut) => {
      const isActive = shortcut.destination === active
      return <a
        key={shortcut.destination}
        href={shortcut.href}
        aria-current={isActive ? 'page' : undefined}
        className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition ${isActive ? 'border-white bg-white text-blue-950 shadow-md' : 'border-white/15 bg-white/5 text-blue-100 hover:bg-white/12'}`}
      >
        {shortcut.label}
      </a>
    })}
  </nav>
}
