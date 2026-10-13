import React, { useState } from 'react'
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

// Available inventory stock items to choose from in dropdown
const availableInventoryStock = [
  { code: 'AST-PRJ-0031', name: 'Epson EB-X06 Projector', condition: 'Fair' },
  { code: 'CSM-INK-0124', name: 'Printer Ink Cartridge', condition: 'New' },
  { code: 'AST-DES-0092', name: 'Dell OptiPlex 7090 Desktop', condition: 'Good' },
  { code: 'AST-MON-0105', name: 'HP 22-inch LED Monitor', condition: 'Good' },
  { code: 'AST-CHR-0210', name: 'Ergonomic Office Chair', condition: 'Good' },
]

const sampleEmployees = [
  {
    id: 'EMP-1042',
    firstName: 'Ana',
    lastName: 'Santos',
    initials: 'AS',
    department: 'Registrar Office',
    position: 'Records Officer',
    email: 'ana.santos@dyci.edu.ph',
    assigned: 2,
    status: 'Active',
    statusTone: 'bg-emerald-50 text-emerald-700',
    assignedItems: [
      { code: 'AST-LTP-0142', name: 'Lenovo ThinkPad E14', condition: 'Good', tone: 'bg-emerald-50 text-emerald-700', assignedOn: 'Oct 08, 2026 · 10:30 AM' },
      { code: 'AST-MON-0084', name: 'Dell 24-inch Monitor', condition: 'Good', tone: 'bg-emerald-50 text-emerald-700', assignedOn: 'Sep 18, 2026 · 02:15 PM' },
    ],
    history: [
      { date: 'Oct 08, 2026', event: 'Issued', item: 'Lenovo ThinkPad E14', code: 'AST-LTP-0142', note: 'Acknowledged by employee' },
      { date: 'Sep 18, 2026', event: 'Issued', item: 'Dell 24-inch Monitor', code: 'AST-MON-0084', note: 'Acknowledged by employee' },
      { date: 'Aug 30, 2026', event: 'Returned', item: 'Ergonomic Office Chair', code: 'AST-CHR-0112', note: 'Returned due to department transfer' },
    ],
  },
  {
    id: 'EMP-1128',
    firstName: 'Marco',
    lastName: 'Villanueva',
    initials: 'MV',
    department: 'IT Services',
    position: 'Support Technician',
    email: 'marco.villanueva@dyci.edu.ph',
    assigned: 2,
    status: 'Active',
    statusTone: 'bg-emerald-50 text-emerald-700',
    assignedItems: [
      { code: 'AST-TOL-0012', name: 'Network Cable Tester', condition: 'Good', tone: 'bg-emerald-50 text-emerald-700', assignedOn: 'Jul 10, 2026 · 09:00 AM' },
      { code: 'AST-LTP-0155', name: 'ASUS ExpertBook B1', condition: 'Fair', tone: 'bg-amber-50 text-amber-700', assignedOn: 'Aug 14, 2026 · 11:20 AM' },
    ],
    history: [
      { date: 'Aug 14, 2026', event: 'Issued', item: 'ASUS ExpertBook B1', code: 'AST-LTP-0155', note: 'Field technician deployment' },
    ],
  },
  {
    id: 'EMP-1186',
    firstName: 'Liza',
    lastName: 'Mendoza',
    initials: 'LM',
    department: 'Science Department',
    position: 'Lab Coordinator',
    email: 'liza.mendoza@dyci.edu.ph',
    assigned: 1,
    status: 'Active',
    statusTone: 'bg-emerald-50 text-emerald-700',
    assignedItems: [
      { code: 'AST-PRJ-0031', name: 'Epson EB-X06 Projector', condition: 'Good', tone: 'bg-emerald-50 text-emerald-700', assignedOn: 'Sep 01, 2026 · 08:30 AM' },
    ],
    history: [
      { date: 'Sep 01, 2026', event: 'Issued', item: 'Epson EB-X06 Projector', code: 'AST-PRJ-0031', note: 'Science lab classroom setup' },
    ],
  },
  {
    id: 'EMP-1214',
    firstName: 'Rafael',
    lastName: 'Cruz',
    initials: 'RC',
    department: 'Finance Office',
    position: 'Accounting Assistant',
    email: 'rafael.cruz@dyci.edu.ph',
    assigned: 0,
    status: 'Inactive',
    statusTone: 'bg-slate-100 text-slate-600',
    assignedItems: [],
    history: [],
  },
]

export default function EmployeeMasterData() {
  // Navigation tab state: 'directory' or 'add_employee'
  const [activeTab, setActiveTab] = useState<'directory' | 'add_employee'>('directory')

  // Dynamic departments state
  const [departments, setDepartments] = useState<string[]>(initialDepartments)
  const [showDepartmentModal, setShowDepartmentModal] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState('')

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all')

  // Employees data list
  const [employees, setEmployees] = useState(sampleEmployees)

  // Selected employee modal state
  const [selectedEmployee, setSelectedEmployee] = useState<typeof sampleEmployees[0] | null>(null)

  // Form states for Add Employee
  const [formData, setFormData] = useState({
    empCode: '',
    department: 'Registrar Office',
    lastName: '',
    firstName: '',
    position: '',
    email: '',
    picture: null as File | null,
    status: 'Active',
  })

  // Separate Pop-up Modal state for Add New Issuance (with Dropdown selection)
  const [showIssuanceModal, setShowIssuanceModal] = useState(false)
  const [selectedAssetCode, setSelectedAssetCode] = useState('')
  const [issuanceData, setIssuanceData] = useState({
    itemCode: '',
    itemName: '',
    condition: 'Good',
    notes: 'Acknowledged by employee',
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData((prev) => ({ ...prev, picture: e.target.files![0] }))
    }
  }

  const handleClearForm = () => {
    setFormData({
      empCode: '',
      department: departments[0] || 'Registrar Office',
      lastName: '',
      firstName: '',
      position: '',
      email: '',
      picture: null,
      status: 'Active',
    })
  }

  const handleAddDepartment = (e: React.FormEvent) => {
    e.preventDefault()
    if (newDepartmentName.trim() && !departments.includes(newDepartmentName.trim())) {
      const updated = [...departments, newDepartmentName.trim()]
      setDepartments(updated)
      setFormData((prev) => ({ ...prev, department: newDepartmentName.trim() }))
      setNewDepartmentName('')
      setShowDepartmentModal(false)
      alert('Matagumpay na naidagdag ang bagong departamento!')
    }
  }

  const handleSaveEmployee = () => {
    if (!formData.empCode || !formData.firstName || !formData.lastName) {
      alert('Pakilagay ang Employee Code, First Name, at Last Name.')
      return
    }

    const newEmp = {
      id: formData.empCode,
      firstName: formData.firstName,
      lastName: formData.lastName,
      initials: `${formData.firstName[0] || ''}${formData.lastName[0] || ''}`.toUpperCase() || 'EM',
      department: formData.department,
      position: formData.position || 'Employee',
      email: formData.email || `${formData.firstName.toLowerCase()}.${formData.lastName.toLowerCase()}@dyci.edu.ph`,
      assigned: 0,
      status: formData.status,
      statusTone: formData.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
      assignedItems: [],
      history: [],
    }

    setEmployees([newEmp, ...employees])
    handleClearForm()
    setActiveTab('directory')
    alert('Matagumpay na naidagdag ang bagong empleyado!')
  }

  // Handle Inventory Selection Change (Auto-fills Code, Name, Condition)
  const handleSelectInventoryItem = (code: string) => {
    setSelectedAssetCode(code)
    const found = availableInventoryStock.find((item) => item.code === code)
    if (found) {
      setIssuanceData({
        itemCode: found.code,
        itemName: found.name,
        condition: found.condition,
        notes: 'Acknowledged by employee',
      })
    } else {
      setIssuanceData({
        itemCode: '',
        itemName: '',
        condition: 'Good',
        notes: 'Acknowledged by employee',
      })
    }
  }

  const handleAddIssuanceSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!issuanceData.itemCode || !issuanceData.itemName || !selectedEmployee) {
      alert('Pumili po muna ng available item sa dropdown list.')
      return
    }

    const newItem = {
      code: issuanceData.itemCode,
      name: issuanceData.itemName,
      condition: issuanceData.condition,
      tone: issuanceData.condition === 'Good' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
      assignedOn: 'Oct 13, 2026 · 02:15 PM',
    }

    const newHistoryEntry = {
      date: 'Oct 13, 2026',
      event: 'Issued',
      item: issuanceData.itemName,
      code: issuanceData.itemCode,
      note: issuanceData.notes || 'Acknowledged by employee',
    }

    const updatedEmployees = employees.map((emp) => {
      if (emp.id === selectedEmployee.id) {
        const updatedAssigned = [newItem, ...emp.assignedItems]
        const updatedHist = [newHistoryEntry, ...emp.history]
        const updatedEmp = {
          ...emp,
          assigned: updatedAssigned.length,
          assignedItems: updatedAssigned,
          history: updatedHist,
        }
        setSelectedEmployee(updatedEmp)
        return updatedEmp
      }
      return emp
    })

    setEmployees(updatedEmployees)
    setSelectedAssetCode('')
    setIssuanceData({ itemCode: '', itemName: '', condition: 'Good', notes: 'Acknowledged by employee' })
    setShowIssuanceModal(false)
    alert('Matagumpay na na-issue ang bagong gamit sa empleyado!')
  }

  // Filtered employee list
  const filteredEmployees = employees.filter((emp) => {
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase()
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      emp.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesDept = selectedDeptFilter === 'all' || emp.department === selectedDeptFilter

    return matchesSearch && matchesDept
  })

  return (
    <GsoPageFrame activePage="Employee Master Data" searchPlaceholder="Search employees...">
      {/* HEADER SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              People Directory Workspace
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Employee Master Data</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Keep employee profiles for asset assignments, issuance tracking, and complete item custody history.
            </p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">
            Personnel · Custody · Issuances
          </span>
        </div>

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="relative mt-6 flex gap-2 border-t border-blue-400/20 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'directory'
                ? 'bg-white text-blue-950 shadow-md'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            📋 Master Employee Directory ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('add_employee')}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'add_employee'
                ? 'bg-white text-blue-950 shadow-md'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            + Add Employee
          </button>
        </div>
      </section>

      {/* SEARCH AND FILTER CONTROL SECTION */}
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
                Search Bar
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, code, or email..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
                  Filter (by Department)
                </span>
                <button
                  type="button"
                  onClick={() => setShowDepartmentModal(true)}
                  className="text-[0.65rem] font-extrabold text-blue-600 hover:underline"
                >
                  + Add Department
                </button>
              </div>
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeTab === 'directory' && (
            <button
              type="button"
              onClick={() => setActiveTab('add_employee')}
              className="mt-2 self-start rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 sm:mt-5 sm:self-auto"
            >
              + Add Employee Button
            </button>
          )}
        </div>
      </section>

      {/* TAB 1: ADD EMPLOYEE FORM SECTION */}
      {activeTab === 'add_employee' && (
        <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/30 p-5 shadow-sm shadow-slate-200/55 sm:p-6">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-black text-slate-900">Add Employee Form</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Fill in the required information to register a new employee profile.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDepartmentModal(true)}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 sm:self-auto"
            >
              <span>+ Add Department</span>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Employee Code</span>
              <input
                type="text"
                name="empCode"
                value={formData.empCode}
                onChange={handleInputChange}
                placeholder="e.g. EMP-1300"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Department</span>
              <select
                name="department"
                value={formData.department}
                onChange={handleInputChange}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Last Name</span>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                placeholder="Enter last name"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">First Name</span>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                placeholder="Enter first name"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Position</span>
              <input
                type="text"
                name="position"
                value={formData.position}
                onChange={handleInputChange}
                placeholder="Job title or designation"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Email</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="name@dyci.edu.ph"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Picture</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block h-10 w-full rounded-lg border border-slate-200 bg-white text-[0.65rem] text-slate-600 file:mr-3 file:h-full file:border-0 file:bg-slate-50 file:px-3 file:text-[0.65rem] file:font-bold"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Status</span>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClearForm}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Clear form
            </button>
            <button
              type="button"
              onClick={handleSaveEmployee}
              className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700 shadow-sm shadow-blue-600/20"
            >
              Save Employee
            </button>
          </div>
        </section>
      )}

      {/* MODAL FOR CREATING NEW DEPARTMENT */}
      {showDepartmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Add New Department</h3>
            <p className="mt-1 text-xs text-slate-500">
              Create a custom department profile for school employees.
            </p>
            <form onSubmit={handleAddDepartment} className="mt-4">
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Department Name</span>
                <input
                  type="text"
                  required
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  placeholder="e.g. Guidance & Counseling"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDepartmentModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
                >
                  Add Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MASTER TABLE DIRECTORY */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Employee Directory</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Select an employee profile to review assigned items and history.
            </p>
          </div>
          <span className="rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">
            {filteredEmployees.length} employee(s) found
          </span>
        </div>

        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-220 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Employee</th>
                <th className="px-5 py-3.5">Employee Code</th>
                <th className="px-5 py-3.5">Department</th>
                <th className="px-5 py-3.5">Last Name</th>
                <th className="px-5 py-3.5">First Name</th>
                <th className="px-5 py-3.5">Position</th>
                <th className="px-5 py-3.5">School Email</th>
                <th className="px-5 py-3.5">Items</th>
                <th className="px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => setSelectedEmployee(emp)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/50"
                >
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-700">
                        {emp.initials}
                      </span>
                      <span className="text-xs font-extrabold text-slate-800">
                        {emp.firstName} {emp.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs font-bold text-slate-500">{emp.id}</td>
                  <td className="px-5 py-4 text-xs font-bold text-slate-700">{emp.department}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{emp.lastName}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{emp.firstName}</td>
                  <td className="px-5 py-4 text-xs font-medium text-slate-600">{emp.position}</td>
                  <td className="px-5 py-4 text-xs font-medium text-blue-600">{emp.email}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-blue-50 px-2 text-xs font-extrabold text-blue-700">
                      {emp.assigned}
                    </span>
                  </td>
                  <td className="px-5 py-4 sm:px-6">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${emp.statusTone}`}>
                      {emp.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                    Walang empleyado na tumutugma sa iyong pinalabas na pamantayan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* POP-UP MODAL FOR ISSUED ITEMS AND EMPLOYEE PROFILE HISTORY */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="my-8 w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3.5">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-100 text-sm font-black text-blue-700">
                  {selectedEmployee.initials}
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    {selectedEmployee.id} · {selectedEmployee.department} ({selectedEmployee.position})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕ Close
              </button>
            </div>

            {/* Employee Quick Info Cards */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">School Email</span>
                <p className="mt-1 truncate text-xs font-bold text-slate-700">{selectedEmployee.email}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Total Issued Items</span>
                <p className="mt-1 text-xs font-bold text-blue-700">{selectedEmployee.assigned} item(s) active</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Employment Status</span>
                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold ${selectedEmployee.statusTone}`}>
                  {selectedEmployee.status}
                </span>
              </div>
            </div>

            {/* CURRENTLY ISSUED ITEMS SECTION */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Currently Issued Items
                  </h4>
                  <p className="text-[0.68rem] text-slate-400">List of equipment and assets assigned to this employee.</p>
                </div>
                {/* BUTTON THAT OPENS POPUP MODAL FOR ADD ISSUANCE */}
                <button
                  type="button"
                  onClick={() => setShowIssuanceModal(true)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  + Add New Issuance
                </button>
              </div>

              {/* Table of Issued Items */}
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[0.6rem] font-extrabold uppercase text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5">Asset Code</th>
                      <th className="px-3.5 py-2.5">Item Name</th>
                      <th className="px-3.5 py-2.5">Condition</th>
                      <th className="px-3.5 py-2.5">Assigned Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEmployee.assignedItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-3.5 py-2.5 font-bold text-slate-500">{item.code}</td>
                        <td className="px-3.5 py-2.5 font-extrabold text-slate-800">{item.name}</td>
                        <td className="px-3.5 py-2.5">
                          <span className={`rounded-md px-2 py-0.5 text-[0.6rem] font-extrabold ${item.tone}`}>
                            {item.condition}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-500 font-medium">{item.assignedOn}</td>
                      </tr>
                    ))}
                    {selectedEmployee.assignedItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3.5 py-4 text-center text-slate-400 italic">
                          No items currently issued to this employee.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ISSUANCE & RETURN HISTORY AUDIT LOGS */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Issuance & Return History
              </h4>
              <p className="mt-0.5 text-[0.68rem] text-slate-400">Audit logs of all previous transactions for this employee.</p>

              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-1">
                {selectedEmployee.history.map((log, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[0.58rem] font-extrabold ${
                          log.event === 'Returned' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {log.event}
                        </span>
                        <span className="text-xs font-bold text-slate-700">{log.item}</span>
                        <span className="text-[0.62rem] text-slate-400">({log.code})</span>
                      </div>
                      <p className="mt-1 text-[0.65rem] text-slate-500">{log.note}</p>
                    </div>
                    <span className="text-[0.62rem] font-bold text-slate-400">{log.date}</span>
                  </div>
                ))}
                {selectedEmployee.history.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No transaction history recorded yet.</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EASY USER-FRIENDLY POP-UP MODAL FOR ISSUANCE (WITH INVENTORY DROPDOWN AUTO-FILL) */}
      {showIssuanceModal && selectedEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Add New Issuance</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Issue an item to <span className="font-bold text-blue-700">{selectedEmployee.firstName} {selectedEmployee.lastName}</span> ({selectedEmployee.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIssuanceModal(false)}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddIssuanceSubmit} className="mt-4 space-y-3">
              {/* SELECT AVAILABLE INVENTORY ITEM DROPDOWN */}
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-extrabold uppercase text-blue-700">
                  Select Available Asset / Item from Inventory
                </span>
                <select
                  required
                  value={selectedAssetCode}
                  onChange={(e) => handleSelectInventoryItem(e.target.value)}
                  className="h-10 w-full rounded-xl border border-blue-300 bg-blue-50/40 px-3.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">-- Select Available Item in GSO Storage --</option>
                  {availableInventoryStock.map((stock) => (
                    <option key={stock.code} value={stock.code}>
                      {stock.code} — {stock.name} ({stock.condition})
                    </option>
                  ))}
                </select>
              </label>

              {/* AUTO-FILLED ASSET CODE */}
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Asset Code (Auto-filled)</span>
                <input
                  type="text"
                  readOnly
                  placeholder="Select item above..."
                  value={issuanceData.itemCode}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-700 outline-none cursor-not-allowed"
                />
              </label>

              {/* AUTO-FILLED ITEM NAME */}
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Item Name (Auto-filled)</span>
                <input
                  type="text"
                  readOnly
                  placeholder="Select item above..."
                  value={issuanceData.itemName}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-700 outline-none cursor-not-allowed"
                />
              </label>

              {/* CONDITION UPON ISSUANCE */}
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Condition Upon Issuance</span>
                <select
                  value={issuanceData.condition}
                  onChange={(e) => setIssuanceData({ ...issuanceData, condition: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="Good">Good</option>
                  <option value="New">New</option>
                  <option value="Fair">Fair</option>
                </select>
              </label>

              {/* ISSUANCE NOTES */}
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Issuance Notes</span>
                <input
                  type="text"
                  placeholder="e.g. Acknowledged by employee"
                  value={issuanceData.notes}
                  onChange={(e) => setIssuanceData({ ...issuanceData, notes: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <div className="mt-5 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIssuanceModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700 shadow-md shadow-blue-600/20"
                >
                  Confirm & Issue Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </GsoPageFrame>
  )
}