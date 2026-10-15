import { useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'

const sampleToBeRepairedItems = [
  {
    code: 'AST-CHR-0208',
    asset: 'Ergonomic Office Chair',
    category: 'Office Equipment',
    reportedBy: 'Maria Santos (IT Dept)',
    dateReported: 'Oct 10, 2026',
    issue: 'Wheel assembly broken, requires hydraulic cylinder replace',
    priority: 'High',
    priorityTone: 'bg-rose-50 text-rose-700',
    repairStatus: 'Under Maintenance',
    repairStatusTone: 'bg-amber-50 text-amber-700',
  },
  {
    code: 'AST-PRJ-0031',
    asset: 'Epson EB-X06 Projector',
    category: 'Office Equipment',
    reportedBy: 'Marco Villanueva (IT Services)',
    dateReported: 'Oct 11, 2026',
    issue: 'Intermittent bulb flickering during prolonged usage',
    priority: 'Medium',
    priorityTone: 'bg-amber-50 text-amber-700',
    repairStatus: 'Pending Inspection',
    repairStatusTone: 'bg-slate-100 text-slate-700',
  },
]

export default function ToRepaired() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRepairItem, setSelectedRepairItem] = useState<typeof sampleToBeRepairedItems[number] | null>(null)

  const filteredRepairs = sampleToBeRepairedItems.filter((item) =>
    item.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.reportedBy.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleGenerateCSV = () => {
    if (filteredRepairs.length === 0) {
      alert('There is no data to export to CSV.')
      return
    }

    const headers = Object.keys(filteredRepairs[0]).join(',')
    const rows = filteredRepairs.map((item) =>
      Object.values(item).map((value) => `"${value}"`).join(','),
    )
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n')
    const link = document.createElement('a')
    link.setAttribute('href', encodeURI(csvContent))
    link.setAttribute('download', `Items_To_Be_Repaired_Report_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleGenerateWord = () => {
    if (filteredRepairs.length === 0) {
      alert('There is no data to export to Word.')
      return
    }

    const headers = Object.keys(filteredRepairs[0])
    const htmlTable = `<table border="1" style="border-collapse:collapse;width:100%;"><thead><tr>${headers
      .map((header) => `<th style="background:#09244a;color:white;padding:8px;">${header.toUpperCase()}</th>`)
      .join('')}</tr></thead><tbody>${filteredRepairs
      .map((item) => `<tr>${Object.values(item).map((value) => `<td style="padding:8px;">${value}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`
    const sourceHTML = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>GSO Report</title></head><body><h2>Items To Be Repaired Summary Report</h2><p>Generated on: ${new Date().toLocaleString()}</p>${htmlTable}</body></html>`
    const fileDownload = document.createElement('a')
    fileDownload.href = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML)
    fileDownload.download = `Items_To_Be_Repaired_Report_${new Date().toISOString().slice(0, 10)}.doc`
    document.body.appendChild(fileDownload)
    fileDownload.click()
    document.body.removeChild(fileDownload)
  }

  return (
    <GsoPageFrame activePage="To Be Repaired" searchPlaceholder="Search asset, code, or reporter...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              Asset Maintenance
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">To Be Repaired</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Review equipment reported for inspection, maintenance, or repair.
            </p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">
            {sampleToBeRepairedItems.length} item(s) in queue
          </span>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <label className="block max-w-xl">
          <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Search repair items</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search asset, code, or reporter..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Items To Be Repaired</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Defective equipment flagged for maintenance, vendor servicing, or GSO technical repair.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateCSV}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Generate CSV
            </button>
            <button
              type="button"
              onClick={handleGenerateWord}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-blue-700"
            >
              Generate Word
            </button>
            <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700">
              {filteredRepairs.length} item(s) in queue
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-220 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Asset / Item</th>
                <th className="px-5 py-3.5">Reported By</th>
                <th className="px-5 py-3.5">Date Reported</th>
                <th className="px-5 py-3.5">Issue / Damage Description</th>
                <th className="px-5 py-3.5">Priority</th>
                <th className="px-5 py-3.5 sm:px-6">Repair Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRepairs.map((item) => (
                <tr
                  key={item.code}
                  onClick={() => setSelectedRepairItem(item)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/60"
                >
                  <td className="px-5 py-4 sm:px-6">
                    <span className="block text-xs font-extrabold text-slate-800">{item.asset}</span>
                    <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code} · {item.category}</span>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.reportedBy}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-600">{item.dateReported}</td>
                  <td className="max-w-xs px-5 py-4 text-xs text-slate-600">{item.issue}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.priorityTone}`}>
                      {item.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4 sm:px-6">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.repairStatusTone}`}>
                      {item.repairStatus}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRepairs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                    No items marked for repair match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRepairItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Repair Ticket Details</h3>
              <button
                type="button"
                onClick={() => setSelectedRepairItem(null)}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-3.5">
                <span className="block text-[0.6rem] font-black uppercase text-rose-800">Defective Asset</span>
                <p className="mt-1 text-xs font-black text-slate-900">{selectedRepairItem.asset}</p>
                <p className="text-[0.65rem] font-bold text-slate-500">{selectedRepairItem.code}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Damage / Issue Report</span>
                <p className="mt-1 text-xs font-semibold text-slate-800">{selectedRepairItem.issue}</p>
                <p className="mt-1 text-[0.65rem] text-slate-400">Reported by: {selectedRepairItem.reportedBy} on {selectedRepairItem.dateReported}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRepairItem(null)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </GsoPageFrame>
  )
}
