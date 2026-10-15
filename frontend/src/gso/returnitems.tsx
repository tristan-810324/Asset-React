import { useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'

const departments = [
  'Registrar Office',
  'IT Services',
  'Science Department',
  'Finance Office',
  'Property & Supply',
  'Academic Affairs',
  'Human Resources',
]

const returnedItems = [
  {
    code: 'AST-CHR-0112',
    asset: 'Ergonomic Office Chair',
    category: 'Office Equipment',
    returnedBy: 'Ana Santos',
    department: 'Registrar Office',
    returnedDate: 'Sep 18, 2026 · 1:30 PM',
    returnCondition: 'Fair',
    reason: 'Returned due to department transfer',
    status: 'In Storage',
    statusTone: 'bg-blue-50 text-blue-700',
  },
  {
    code: 'AST-DES-0044',
    asset: 'Dell OptiPlex 3080 Desktop',
    category: 'Office Equipment',
    returnedBy: 'Rafael Cruz',
    department: 'Finance Office',
    returnedDate: 'Aug 25, 2026 · 11:00 AM',
    returnCondition: 'Needs Repair',
    reason: 'Power supply unit failure',
    status: 'Sent to Maintenance',
    statusTone: 'bg-rose-50 text-rose-700',
  },
]

export default function ReturnItems() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all')
  const [selectedItem, setSelectedItem] = useState<typeof returnedItems[number] | null>(null)

  const filteredItems = returnedItems.filter((item) => {
    const query = searchQuery.toLowerCase()
    const matchesSearch = item.asset.toLowerCase().includes(query)
      || item.code.toLowerCase().includes(query)
      || item.returnedBy.toLowerCase().includes(query)
    const matchesDepartment = selectedDeptFilter === 'all' || item.department === selectedDeptFilter
    return matchesSearch && matchesDepartment
  })

  const handleGenerateCSV = () => {
    if (filteredItems.length === 0) {
      alert('There is no data to export to CSV.')
      return
    }
    const headers = Object.keys(filteredItems[0]).join(',')
    const rows = filteredItems.map((item) =>
      Object.values(item).map((value) => `"${value}"`).join(','),
    )
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n')
    const link = document.createElement('a')
    link.href = encodeURI(csvContent)
    link.download = `Returned_Items_Report_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleGenerateWord = () => {
    if (filteredItems.length === 0) {
      alert('There is no data to export to Word.')
      return
    }
    const headers = Object.keys(filteredItems[0])
      .map((key) => `<th style="background:#09244a;color:white;padding:8px;">${key.toUpperCase()}</th>`)
      .join('')
    const rows = filteredItems.map((item) =>
      `<tr>${Object.values(item).map((value) => `<td style="padding:8px;">${value}</td>`).join('')}</tr>`,
    ).join('')
    const html = `<html><head><meta charset="utf-8"><title>Returned Items</title></head><body><h2>Returned Items</h2><p>Generated on: ${new Date().toLocaleString()}</p><table border="1" style="border-collapse:collapse;width:100%;"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`
    const link = document.createElement('a')
    link.href = `data:application/vnd.ms-word;charset=utf-8,${encodeURIComponent(html)}`
    link.download = `Returned_Items_Report_${new Date().toISOString().slice(0, 10)}.doc`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <GsoPageFrame activePage="Returned Items" searchPlaceholder="Search returned asset, code, or employee...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            Asset Custody &amp; Tracking
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Returned Items</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
            Review returned assets, return conditions, and their current storage or maintenance status.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Search returned items</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search asset, code, or recipient..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Department</span>
            <select
              value={selectedDeptFilter}
              onChange={(event) => setSelectedDeptFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Returned Item Records</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Return condition and current status for each surrendered asset.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleGenerateCSV} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
              Generate CSV
            </button>
            <button type="button" onClick={handleGenerateWord} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-blue-700">
              Generate Word
            </button>
            <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700">
              {filteredItems.length} return record(s)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-220 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Asset Code &amp; Name</th>
                <th className="px-5 py-3.5">Returned By</th>
                <th className="px-5 py-3.5">Returned Date &amp; Time</th>
                <th className="px-5 py-3.5">Condition Upon Return</th>
                <th className="px-5 py-3.5">Reason / Note</th>
                <th className="px-5 py-3.5 sm:px-6">Current Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.code} onClick={() => setSelectedItem(item)} className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/60">
                  <td className="px-5 py-4 sm:px-6">
                    <span className="block text-xs font-extrabold text-slate-800">{item.asset}</span>
                    <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code} · {item.category}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="block text-xs font-bold text-slate-700">{item.returnedBy}</span>
                    <span className="mt-1 block text-[0.62rem] text-slate-400">{item.department}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">{item.returnedDate}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-amber-700">{item.returnCondition}</span>
                  </td>
                  <td className="max-w-xs px-5 py-4 text-xs text-slate-600">{item.reason}</td>
                  <td className="px-5 py-4 sm:px-6">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.statusTone}`}>{item.status}</span>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">No returned items match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="returned-item-dialog-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id="returned-item-dialog-title" className="text-sm font-black text-slate-900">Returned Item Details</h3>
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50">Close</button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Returned Asset</span>
                <p className="mt-1 text-xs font-black text-slate-900">{selectedItem.asset}</p>
                <p className="text-[0.65rem] font-bold text-slate-500">{selectedItem.code} · {selectedItem.category}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Returned By</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedItem.returnedBy}</p>
                <p className="text-[0.65rem] font-medium text-slate-500">{selectedItem.department}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Condition &amp; Return Date</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedItem.returnCondition} · {selectedItem.returnedDate}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Reason for Return</span>
                <p className="mt-1 text-xs text-slate-700">{selectedItem.reason}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Current Status</span>
                <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${selectedItem.statusTone}`}>{selectedItem.status}</span>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700">Done</button>
            </div>
          </section>
        </div>
      )}
    </GsoPageFrame>
  )
}
