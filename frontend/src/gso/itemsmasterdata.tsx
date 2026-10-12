import { GsoPageFrame } from '../components/navbars/gsonavbar'

const categories = [
  'Office Supplies',
  'Office Equipment',
  'Machinery/ Parts',
  'Computer Parts/ Peripherals',
  'Tools/ Equipment',
  'Publications',
  'Electrical Supplies',
  'Other Consumables',
  'Others',
]

const conditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']

const sampleItems = [
  { code: 'AST-LTP-0142', name: 'Lenovo ThinkPad E14', initials: 'LT', category: 'Office Equipment', acquired: 'Oct 08, 2026', time: '9:20 AM', unitCost: 'PHP 58,500', acquisitionCost: 'PHP 58,500', currentValue: 'PHP 48,000', condition: 'Good', conditionTone: 'bg-emerald-50 text-emerald-700', quantity: '1', unit: 'unit', location: 'Registrar Office', status: 'Issued', statusTone: 'bg-blue-50 text-blue-700' },
  { code: 'AST-PRJ-0031', name: 'Epson EB-X06 Projector', initials: 'PJ', category: 'Office Equipment', acquired: 'Jul 22, 2026', time: '2:15 PM', unitCost: 'PHP 37,900', acquisitionCost: 'PHP 37,900', currentValue: 'PHP 34,000', condition: 'Fair', conditionTone: 'bg-amber-50 text-amber-700', quantity: '1', unit: 'unit', location: 'Conference Room', status: 'Available', statusTone: 'bg-emerald-50 text-emerald-700' },
  { code: 'CSM-INK-0124', name: 'Printer Ink Cartridge', initials: 'IN', category: 'Other Consumables', acquired: 'Aug 05, 2026', time: '10:00 AM', unitCost: 'PHP 1,250', acquisitionCost: 'PHP 5,000', currentValue: '—', condition: 'New', conditionTone: 'bg-sky-50 text-sky-700', quantity: '4', unit: 'cartridges', location: 'Property Storage', status: 'Available', statusTone: 'bg-emerald-50 text-emerald-700' },
  { code: 'AST-CHR-0208', name: 'Ergonomic Office Chair', initials: 'CH', category: 'Office Equipment', acquired: 'Nov 09, 2025', time: '11:30 AM', unitCost: 'PHP 8,700', acquisitionCost: 'PHP 8,700', currentValue: 'PHP 6,500', condition: 'Needs Repair', conditionTone: 'bg-rose-50 text-rose-700', quantity: '1', unit: 'unit', location: 'IT Office', status: 'Reserved', statusTone: 'bg-violet-50 text-violet-700' },
]

const sampleConditionHistory = [
  { item: 'Epson EB-X06 Projector', code: 'AST-PRJ-0031', previous: 'Good', next: 'Fair', changedAt: 'Oct 11, 2026 · 10:15 AM', by: 'Marco Villanueva', note: 'Image flicker noted during inspection', tone: 'bg-amber-50 text-amber-700' },
  { item: 'Ergonomic Office Chair', code: 'AST-CHR-0208', previous: 'Good', next: 'Needs Repair', changedAt: 'Oct 10, 2026 · 3:40 PM', by: 'Liza Mendoza', note: 'Wheel assembly requires service', tone: 'bg-rose-50 text-rose-700' },
]

export default function ItemsMasterData() {
  return (
    <GsoPageFrame activePage="Item Master Data" searchPlaceholder="Search item name, code, or location...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Inventory workspace</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Item Master Data</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Catalog assets and consumable stock with their condition, quantity, and current location.</p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">Catalog · Assets · Stock</span>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_0.85fr_0.85fr]">
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Search inventory</span>
              <input type="search" placeholder="Item name, code, or location" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Category</span>
              <select defaultValue="all" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Acquired from</span>
              <input type="date" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Acquired to</span>
              <input type="date" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            </label>
          </div>

          <details className="group xl:relative">
            <summary className="flex h-11 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 marker:content-none sm:w-fit">
              <span className="text-base leading-none">+</span> Add Item
            </summary>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5 xl:absolute xl:right-0 xl:z-10 xl:w-[min(54rem,calc(100vw-3rem))] xl:bg-white xl:shadow-xl">
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-900">Add an inventory item</h2>
                <p className="mt-1 text-xs text-slate-500">Record catalog details, acquisition, condition, quantity, and location.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Item code</span><input type="text" placeholder="e.g. AST-EQP-0001" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Category</span><select defaultValue="" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="" disabled>Select category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Item description</span><input type="text" placeholder="Item name or description" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Date of acquisition</span><input type="date" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Time of acquisition</span><input type="time" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Cost per unit</span><input type="number" min="0" step="0.01" placeholder="0.00" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Acquisition cost</span><input type="number" min="0" step="0.01" placeholder="Historical total cost" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Current assessed value (optional)</span><input type="number" min="0" step="0.01" placeholder="Current value" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Quantity</span><input type="number" min="0" step="1" placeholder="Enter quantity" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Unit of measure</span><input type="text" placeholder="Piece, box, ream, set..." className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Condition</span><select defaultValue="" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="" disabled>Select condition</option>{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Current location</span><input type="text" placeholder="Building, room, or storage area" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Inventory status</span><select defaultValue="Available" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option>Available</option><option>Issued</option><option>Reserved</option><option>Borrowed</option></select></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Picture (optional)</span><input type="file" accept="image/*" className="block h-10 w-full rounded-lg border border-slate-200 bg-white text-[0.65rem] text-slate-600 file:mr-3 file:h-full file:border-0 file:bg-slate-50 file:px-3 file:text-[0.65rem] file:font-bold" /></label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="reset" className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600">Clear form</button>
                <button type="button" className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white">Save item</button>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Inventory list</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Asset condition and inventory status are tracked separately.</p>
          </div>
          <span className="rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">Sample data · UI preview</span>
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-245 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Item</th>
                <th className="px-5 py-3.5">Acquired</th>
                <th className="px-5 py-3.5">Value</th>
                <th className="px-5 py-3.5">Stock / condition</th>
                <th className="px-5 py-3.5">Location</th>
                <th className="px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {sampleItems.map((item) => (
                <tr key={item.code} className="border-t border-slate-100 transition hover:bg-blue-50/35">
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex min-w-52 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[0.65rem] font-black text-blue-700">{item.initials}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-extrabold text-slate-800">{item.name}</span>
                        <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code}</span>
                        <span className="mt-1 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-bold text-slate-500">{item.category}</span>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">
                    {item.acquired}<span className="mt-1 block text-[0.65rem] font-medium text-slate-400">{item.time}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <span className="block text-xs font-bold text-slate-700">Unit {item.unitCost}</span>
                    <span className="mt-1 block text-[0.65rem] text-slate-500">Acquired {item.acquisitionCost}</span>
                    <span className="mt-1 block text-[0.62rem] text-slate-400">Assessed {item.currentValue}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="block whitespace-nowrap text-xs font-extrabold text-slate-700">{item.quantity} <span className="font-medium text-slate-500">{item.unit}</span></span>
                    <span className={`mt-1.5 inline-flex rounded-full px-2 py-1 text-[0.6rem] font-extrabold ${item.conditionTone}`}>{item.condition}</span>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-600">{item.location}</td>
                  <td className="px-5 py-4 sm:px-6"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.statusTone}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="px-5 py-5 sm:px-6">
          <h2 className="text-base font-black tracking-tight text-slate-900">Item condition history</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">Keep condition changes as dated history instead of overwriting the previous value.</p>
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-225 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Item / code</th>
                <th className="px-5 py-3.5">Previous condition</th>
                <th className="px-5 py-3.5">New condition</th>
                <th className="px-5 py-3.5">Changed date / time</th>
                <th className="px-5 py-3.5">Staff responsible</th>
                <th className="px-5 py-3.5 sm:px-6">Notes / evidence</th>
              </tr>
            </thead>
            <tbody>
              {sampleConditionHistory.map((change) => (
                <tr key={`${change.code}-${change.changedAt}`} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 sm:px-6"><span className="block text-xs font-extrabold text-slate-800">{change.item}</span><span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{change.code}</span></td>
                  <td className="px-5 py-3.5"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.62rem] font-bold text-slate-600">{change.previous}</span></td>
                  <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${change.tone}`}>{change.next}</span></td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-600">{change.changedAt}</td>
                  <td className="px-5 py-3.5"><span className="block text-xs font-bold text-slate-700">{change.by}</span><span className="mt-1 block max-w-56 text-[0.62rem] leading-relaxed text-slate-400">{change.note}</span></td>
                  <td className="px-5 py-3.5 sm:px-6"><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[0.62rem] font-bold text-blue-700">Evidence attached</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </GsoPageFrame>
  )
}
