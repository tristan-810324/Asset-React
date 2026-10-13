import { useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'

const initialDepartments = [
  'Registrar Office',
  'IT Services',
  'Science Department',
  'Finance Office',
  'Property & Supply',
  'Academic Affairs',
  'Human Resources',
]

const sampleMainIssuances = [
  {
    code: 'AST-LTP-0142',
    asset: 'Lenovo ThinkPad E14',
    category: 'Office Equipment',
    employee: 'Ana Santos',
    department: 'Registrar Office',
    position: 'Records Officer',
    date: 'Oct 08, 2026',
    time: '9:20 AM',
    condition: 'Good',
    conditionTone: 'bg-emerald-50 text-emerald-700',
    acknowledgment: 'Confirmed',
    acknowledgmentTone: 'bg-emerald-50 text-emerald-700',
    notes: 'Issued directly to Registrar department records officer.',
  },
  {
    code: 'AST-PRJ-0031',
    asset: 'Epson EB-X06 Projector',
    category: 'Office Equipment',
    employee: 'Marco Villanueva',
    department: 'IT Services',
    position: 'Support Technician',
    date: 'Oct 07, 2026',
    time: '2:15 PM',
    condition: 'Fair',
    conditionTone: 'bg-amber-50 text-amber-700',
    acknowledgment: 'Pending',
    acknowledgmentTone: 'bg-amber-50 text-amber-700',
    notes: 'Awaiting digital signature from recipient.',
  },
  {
    code: 'AST-MON-0084',
    asset: 'Dell 24-inch Monitor',
    category: 'Office Equipment',
    employee: 'Liza Mendoza',
    department: 'Science Department',
    position: 'Lab Coordinator',
    date: 'Oct 06, 2026',
    time: '10:45 AM',
    condition: 'New',
    conditionTone: 'bg-sky-50 text-sky-700',
    acknowledgment: 'Confirmed',
    acknowledgmentTone: 'bg-emerald-50 text-emerald-700',
    notes: 'Deployed for science lab station.',
  },
]

const sampleSurrenderItems = [
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

export default function IssuanceRecord() {
  // Navigation tab state: 'main', 'surrender', or 'repair'
  const [activeTab, setActiveTab] = useState<'main' | 'surrender' | 'repair'>('main')

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all')
  const [selectedAckFilter, setSelectedAckFilter] = useState('all')

  // Row Details Modal States
  const [selectedMainItem, setSelectedMainItem] = useState<typeof sampleMainIssuances[0] | null>(null)
  const [selectedSurrenderItem, setSelectedSurrenderItem] = useState<typeof sampleSurrenderItems[0] | null>(null)
  const [selectedRepairItem, setSelectedRepairItem] = useState<typeof sampleToBeRepairedItems[0] | null>(null)

  // CSV Generator Helper
  const handleGenerateCSV = (tableName: string, data: unknown[]) => {
    if (data.length === 0) {
      alert('Walang data na mai-export sa CSV.')
      return
    }
    const headers = Object.keys(data[0] as Record<string, unknown>).join(',')
    const rows = data.map((row) =>
      Object.values(row as Record<string, unknown>).map((val) => `"${val}"`).join(','),
    )
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${tableName}_Report_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Word Document Generator Helper
  const handleGenerateWord = (tableName: string, data: unknown[]) => {
    if (data.length === 0) {
      alert('Walang data na mai-export sa Word.')
      return
    }
    let htmlTable = `<table border="1" style="border-collapse:collapse;width:100%;"><thead><tr>`
    const firstRow = data[0] as Record<string, unknown>
    Object.keys(firstRow).forEach((key) => {
      htmlTable += `<th style="background:#09244a;color:white;padding:8px;">${key.toUpperCase()}</th>`
    })
    htmlTable += `</tr></thead><tbody>`
    data.forEach((row) => {
      htmlTable += `<tr>`
      Object.values(row as Record<string, unknown>).forEach((val) => {
        htmlTable += `<style="padding:8px;">${val}</td>`
      })
      htmlTable += `</tr>`
    })
    htmlTable += `</tbody></table>`

    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
      "xmlns:w='urn:schemas-microsoft-com:office:word' "+
      "xmlns='http://www.w3.org/TR/REC-html40'>"+
      "<head><meta charset='utf-8'><title>GSO Report</title></head><body>"+
      `<h2>${tableName} Summary Report</h2><p>Generated on: ${new Date().toLocaleString()}</p>`
    const footer = '</body></html>'
    const sourceHTML = header + htmlTable + footer

    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML)
    const fileDownload = document.createElement('a')
    document.body.appendChild(fileDownload)
    fileDownload.href = source
    fileDownload.download = `${tableName}_Report_${new Date().toISOString().slice(0, 10)}.doc`
    fileDownload.click()
    document.body.removeChild(fileDownload)
  }

  // Main Issuance Filter
  const filteredMainIssuances = sampleMainIssuances.filter((record) => {
    const matchesSearch =
      record.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.employee.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesDept = selectedDeptFilter === 'all' || record.department === selectedDeptFilter
    const matchesAck = selectedAckFilter === 'all' || record.acknowledgment === selectedAckFilter

    return matchesSearch && matchesDept && matchesAck
  })

  // Surrender Items Filter
  const filteredSurrenders = sampleSurrenderItems.filter((item) => {
    const matchesSearch =
      item.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.returnedBy.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesDept = selectedDeptFilter === 'all' || item.department === selectedDeptFilter

    return matchesSearch && matchesDept
  })

  // To Be Repaired Filter
  const filteredRepairs = sampleToBeRepairedItems.filter((item) => {
    return (
      item.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.reportedBy.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  return (
    <GsoPageFrame activePage="Issuance Records" searchPlaceholder="Search item code, employee, or department...">
      {/* HEADER SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              Asset Custody &amp; Tracking
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Issuance Records</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Review assigned active assets, surrender logs, acknowledgments, and items flagged for repair.
            </p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">
            Custody · Surrender · Maintenance
          </span>
        </div>

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="relative mt-6 flex flex-wrap gap-2 border-t border-blue-400/20 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('main')}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'main'
                ? 'bg-white text-blue-950 shadow-md'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            📋 Main Issuances ({sampleMainIssuances.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('surrender')}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'surrender'
                ? 'bg-white text-blue-950 shadow-md'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            🔄 Surrendered Items ({sampleSurrenderItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('repair')}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'repair'
                ? 'bg-white text-blue-950 shadow-md'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            🛠️ To Be Repaired ({sampleToBeRepairedItems.length})
          </button>
        </div>
      </section>

      {/* SEARCH AND FILTER CONTROL SECTION */}
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Search Bar
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search asset, code, or recipient..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Filter by Department
            </span>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Departments</option>
              {initialDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </label>

          {activeTab === 'main' && (
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
                Acknowledgment Status
              </span>
              <select
                value={selectedAckFilter}
                onChange={(e) => setSelectedAckFilter(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">All Acknowledgment Statuses</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Pending">Pending</option>
              </select>
            </label>
          )}
        </div>
      </section>

      {/* TAB 1: MAIN ISSUANCES TABLE */}
      {activeTab === 'main' && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900">Recent &amp; Main Issuances</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Click any row to inspect complete details. Export report using CSV or Word buttons.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleGenerateCSV('Main_Issuances', filteredMainIssuances)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                📄 Generate CSV
              </button>
              <button
                type="button"
                onClick={() => handleGenerateWord('Main_Issuances', filteredMainIssuances)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                📝 Generate Word
              </button>
              <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700">
                {filteredMainIssuances.length} record(s)
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border-t border-slate-100">
            <table className="min-w-235 w-full text-left">
              <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 sm:px-6">Asset / Item</th>
                  <th className="px-5 py-3.5">Recipient</th>
                  <th className="px-5 py-3.5">Issued On</th>
                  <th className="px-5 py-3.5">Condition</th>
                  <th className="px-5 py-3.5 sm:px-6">Acknowledgment</th>
                </tr>
              </thead>
              <tbody>
                {filteredMainIssuances.map((record) => (
                  <tr
                    key={record.code}
                    onClick={() => setSelectedMainItem(record)}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/40"
                  >
                    <td className="px-5 py-4 sm:px-6">
                      <span className="block text-xs font-extrabold text-slate-800">{record.asset}</span>
                      <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">
                        {record.code} · {record.category}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="block text-xs font-bold text-slate-700">{record.employee}</span>
                      <span className="mt-1 block text-[0.62rem] text-slate-400">
                        {record.department} · {record.position}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">
                      {record.date}
                      <span className="mt-1 block text-[0.65rem] font-medium text-slate-400">{record.time}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${record.conditionTone}`}>
                        {record.condition}
                      </span>
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${record.acknowledgmentTone}`}>
                        {record.acknowledgment === 'Confirmed' ? '✓ Confirmed' : '⏳ Pending Acknowledgment'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredMainIssuances.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                      Walang issuance record na tumutugma sa iyong pinalabas na pamantayan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: SURRENDERED ITEMS TABLE */}
      {activeTab === 'surrender' && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900">Surrendered &amp; Returned Items</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Log of items returned by personnel upon transfer, clearance, or replacement.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleGenerateCSV('Surrendered_Items', filteredSurrenders)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                📄 Generate CSV
              </button>
              <button
                type="button"
                onClick={() => handleGenerateWord('Surrendered_Items', filteredSurrenders)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                📝 Generate Word
              </button>
              <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700">
                {filteredSurrenders.length} surrender record(s)
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
                {filteredSurrenders.map((item) => (
                  <tr
                    key={item.code}
                    onClick={() => setSelectedSurrenderItem(item)}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/60"
                  >
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
                      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-amber-700">
                        {item.returnCondition}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600 max-w-xs">{item.reason}</td>
                    <td className="px-5 py-4 sm:px-6">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.statusTone}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredSurrenders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                      Walang surrendered item na tumutugma sa search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: TO BE REPAIRED TABLE */}
      {activeTab === 'repair' && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900">Items To Be Repaired</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Defective equipment flagged for maintenance, vendor servicing, or GSO technical repair.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleGenerateCSV('Items_To_Be_Repaired', filteredRepairs)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                📄 Generate CSV
              </button>
              <button
                type="button"
                onClick={() => handleGenerateWord('Items_To_Be_Repaired', filteredRepairs)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                📝 Generate Word
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
                    <td className="px-5 py-4 text-xs text-slate-600 max-w-xs">{item.issue}</td>
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
                      Walang item para sa repair na tumutugma sa search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL VIEW 1: MAIN ISSUANCE POP-UP DETAILS */}
      {selectedMainItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Main Issuance Details</h3>
              <button
                type="button"
                onClick={() => setSelectedMainItem(null)}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕ Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5">
                <span className="block text-[0.6rem] font-black uppercase text-blue-800">Asset Information</span>
                <p className="mt-1 text-xs font-black text-slate-900">{selectedMainItem.asset}</p>
                <p className="text-[0.65rem] font-bold text-slate-500">{selectedMainItem.code} · {selectedMainItem.category}</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Recipient Details</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedMainItem.employee}</p>
                <p className="text-[0.65rem] font-medium text-slate-500">{selectedMainItem.department} ({selectedMainItem.position})</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Date Issued</span>
                  <p className="mt-1 text-xs font-bold text-slate-800">{selectedMainItem.date} · {selectedMainItem.time}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Condition</span>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold ${selectedMainItem.conditionTone}`}>
                    {selectedMainItem.condition}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Acknowledgment State</span>
                <p className="mt-1 text-xs font-bold text-emerald-700">{selectedMainItem.acknowledgment}</p>
                <p className="mt-0.5 text-[0.65rem] text-slate-500">{selectedMainItem.notes}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMainItem(null)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VIEW 2: SURRENDER ITEM POP-UP DETAILS */}
      {selectedSurrenderItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Surrender Item Log</h3>
              <button
                type="button"
                onClick={() => setSelectedSurrenderItem(null)}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕ Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Returned Asset</span>
                <p className="mt-1 text-xs font-black text-slate-900">{selectedSurrenderItem.asset}</p>
                <p className="text-[0.65rem] font-bold text-slate-500">{selectedSurrenderItem.code} · {selectedSurrenderItem.category}</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Returned By</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedSurrenderItem.returnedBy}</p>
                <p className="text-[0.65rem] font-medium text-slate-500">{selectedSurrenderItem.department}</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Reason for Return</span>
                <p className="mt-1 text-xs text-slate-700">{selectedSurrenderItem.reason}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSurrenderItem(null)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VIEW 3: REPAIR ITEM POP-UP DETAILS */}
      {selectedRepairItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Repair Ticket Details</h3>
              <button
                type="button"
                onClick={() => setSelectedRepairItem(null)}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕ Close
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