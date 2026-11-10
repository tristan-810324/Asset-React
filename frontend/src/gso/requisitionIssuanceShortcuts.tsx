type RequisitionIssuanceDestination = 'requisitions' | 'issuance'

const shortcuts: Array<{ destination: RequisitionIssuanceDestination; label: string; href: string }> = [
  { destination: 'requisitions', label: 'Check Requisitions', href: '/gso/purchase-requisitions?tab=review' },
  { destination: 'issuance', label: 'Open Main Issuance', href: '/gso/main-issuance' },
]

export function RequisitionIssuanceShortcuts({ active }: { active: RequisitionIssuanceDestination }) {
  return <nav className="mt-5 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="Requisition and issuance navigation">
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
