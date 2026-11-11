import React, { useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { ApiError } from '../auth/authApi'
import {
  createDepartment,
  createEmployee,
  createEmployeePosition,
  deleteDepartment,
  deleteEmployeePosition,
  listDepartments,
  listEmployeePositions,
  listEmployees,
  renameDepartment,
  renameEmployeePosition,
  updateEmployee,
  type EmployeePositionProfile,
  type EmployeeProfile,
  type EmployeeProfileInput,
} from './employeesApi'
import { listEmployeeIssuances, type EmployeeIssuanceRecord } from './issuancesApi'

interface DepartmentItem {
  id: string
  name: string
}

type MasterDataKind = 'department' | 'position'

type MasterDataEdit = {
  kind: MasterDataKind
  id: string
  name: string
  reason: string
}

type MasterDataDeleteTarget = {
  kind: MasterDataKind
  id: string
  name: string
}

const initialDepartments: DepartmentItem[] = [
  { id: 'dept-1', name: 'Registrar Office' },
  { id: 'dept-2', name: 'IT Services' },
  { id: 'dept-3', name: 'Science Department' },
  { id: 'dept-4', name: 'Finance Office' },
  { id: 'dept-5', name: 'Property & Supply' },
  { id: 'dept-6', name: 'Academic Affairs' },
  { id: 'dept-7', name: 'Human Resources' },
]

interface EmployeeHistoryLog {
  date: string
  event: string
  item: string
  code: string
  assetTagCode?: string | null
  quantity: number
  unitOfMeasure: string
  note: string
  returnId?: string | null
  returnCondition?: string | null
  returnedByName?: string | null
  confirmationMethod?: string | null
}

interface ChangeHistoryRecord {
  changedAt: string
  changedBy: string | null
  reason: string
}

interface EmployeeRecord {
  id: string
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  initials: string
  department: string
  position: string
  email: string
  assigned: number
  emailLocked?: boolean
  status: string
  statusTone: string
  assignedItems: Array<{
    id: string
    code: string
    name: string
    condition: string
    tone: string
    quantity: number
    unitOfMeasure: string
    assignedOn: string
    assetTagCodes: string[]
  }>
  history: EmployeeHistoryLog[]
  changeHistory?: ChangeHistoryRecord[]
}

function employeeRecordFromProfile(profile: EmployeeProfile, existing?: EmployeeRecord): EmployeeRecord {
  const firstName = profile.firstName
  const lastName = profile.lastName
  return {
    id: profile.id,
    firstName,
    middleName: profile.middleName,
    lastName,
    suffix: profile.suffix,
    initials: `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'EM',
    department: profile.department,
    position: profile.position,
    email: profile.email,
    assigned: profile.assignedCount,
    emailLocked: profile.emailLocked,
    status: profile.status,
    statusTone: profile.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
    assignedItems: existing?.assignedItems ?? [],
    history: existing?.history ?? [],
    changeHistory: profile.changeHistory.map((change) => ({
      changedAt: new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(change.changedAt)),
      changedBy: change.changedBy,
      reason: change.reason,
    })),
  }
}

function employeeRecordWithIssuance(
  employee: EmployeeRecord,
  issuance: EmployeeIssuanceRecord,
): EmployeeRecord {
  return {
    ...employee,
    assigned: issuance.assignedItems.reduce((total, item) => total + item.quantity, 0),
    assignedItems: issuance.assignedItems.map((item) => ({
      ...item,
      assetTagCodes: item.assetTagCodes ?? [],
      tone: item.condition === 'Good' || item.condition === 'New'
        ? 'bg-emerald-50 text-emerald-700'
        : item.condition === 'Fair'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-rose-50 text-rose-700',
    })),
    history: issuance.history,
  }
}

function employeeProfileInput(employee: EmployeeRecord): EmployeeProfileInput {
  return {
    employeeCode: employee.id,
    firstName: employee.firstName,
    middleName: employee.middleName,
    lastName: employee.lastName,
    suffix: employee.suffix,
    department: employee.department,
    position: employee.position,
    email: employee.email,
    status: employee.status as 'Active' | 'Inactive',
  }
}

export default function EmployeeMasterData() {
  const [employeeDeepLink] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return { employeeCode: params.get('employeeCode'), showHistory: params.get('view') === 'history' }
  })
  // Department and position records are managed by GSO.
  const [departments, setDepartments] = useState<DepartmentItem[]>(initialDepartments)
  const [positions, setPositions] = useState<EmployeePositionProfile[]>([])
  const [showDepartmentModal, setShowDepartmentModal] = useState(false)
  const [masterDataTab, setMasterDataTab] = useState<'departments' | 'positions'>('departments')
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [newPositionName, setNewPositionName] = useState('')
  const [editingMasterEntry, setEditingMasterEntry] = useState<MasterDataEdit | null>(null)
  const [masterEntryToDelete, setMasterEntryToDelete] = useState<MasterDataDeleteTarget | null>(null)
  const [replacementEntryId, setReplacementEntryId] = useState('')
  const [deletionReason, setDeletionReason] = useState('')
  const [masterDataError, setMasterDataError] = useState('')
  const [masterDataNotice, setMasterDataNotice] = useState('')
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(true)
  const [isSavingMasterData, setIsSavingMasterData] = useState(false)
  const [isDeletingMasterData, setIsDeletingMasterData] = useState(false)

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all')

  // Employees data list
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [persistedEmployeeIds, setPersistedEmployeeIds] = useState<Set<string>>(() => new Set())
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true)
  const [employeeDataError, setEmployeeDataError] = useState('')
  const [showAllIssuedItems, setShowAllIssuedItems] = useState(false)
  const [showEmployeeHistoryModal, setShowEmployeeHistoryModal] = useState(false)
  const [historyDialogTab, setHistoryDialogTab] = useState<'issuance' | 'profile'>('issuance')
  const [employeeIssuanceLoadError, setEmployeeIssuanceLoadError] = useState('')

  // Selected employee modal state
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null)
  const [openEmployeeMenuId, setOpenEmployeeMenuId] = useState<string | null>(null)

  // Edit Employee Modal state
  const [showEmployeeEditModal, setShowEmployeeEditModal] = useState(false)
  const [employeeEditError, setEmployeeEditError] = useState('')
  const [editEmployeeData, setEditEmployeeData] = useState({
    empCode: '',
    department: 'Registrar Office',
    lastName: '',
    middleName: '',
    firstName: '',
    suffix: '',
    position: '',
    email: '',
    status: 'Active',
    reason: '',
  })

  useEffect(() => {
    let active = true

    void Promise.all([listDepartments(), listEmployeePositions()])
      .then(([departmentResult, positionResult]) => {
        if (!active) return
        if (departmentResult.departments.length > 0) {
          setDepartments(departmentResult.departments.map((department) => ({ id: department.id, name: department.name })))
        }
        setPositions(positionResult.positions)
        setMasterDataError('')
      })
      .catch((error: unknown) => {
        if (active) setMasterDataError(error instanceof Error ? error.message : 'Unable to load department and position master data.')
      })
      .finally(() => { if (active) setIsLoadingMasterData(false) })

    void listEmployees()
      .then(({ employees: profiles }) => {
        if (!active) return
        const mappedEmployees = profiles.map((profile) => employeeRecordFromProfile(profile))
        setEmployees(mappedEmployees)
        setPersistedEmployeeIds(new Set(profiles.map((profile) => profile.id)))
        setEmployeeDataError('')
        const linkedEmployee = employeeDeepLink.employeeCode
          ? mappedEmployees.find((employee) => employee.id.toLowerCase() === employeeDeepLink.employeeCode?.toLowerCase())
          : undefined
        if (linkedEmployee) {
          setSelectedEmployee(linkedEmployee)
          setShowEmployeeHistoryModal(employeeDeepLink.showHistory)
          void listEmployeeIssuances(linkedEmployee.id)
            .then((issuance) => {
              if (!active) return
              const updatedEmployee = employeeRecordWithIssuance(linkedEmployee, issuance)
              setEmployees((current) => current.map((employee) => employee.id === linkedEmployee.id ? updatedEmployee : employee))
              setSelectedEmployee((current) => current?.id === linkedEmployee.id ? updatedEmployee : current)
            })
            .catch((error: unknown) => {
              if (active) setEmployeeIssuanceLoadError(error instanceof Error ? error.message : 'Unable to load issuance history for this employee.')
            })
        }
      })
      .catch((error: unknown) => {
        if (active) setEmployeeDataError(error instanceof Error ? error.message : 'Unable to load employee profiles.')
      })
      .finally(() => {
        if (active) setIsLoadingEmployees(false)
      })

    return () => { active = false }
  }, [employeeDeepLink])

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newDepartmentName.trim()
    if (!trimmed) {
      setMasterDataError('Please enter a department name.')
      setMasterDataNotice('')
      return
    }
    const existing = departments.find((department) => department.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      setMasterDataError('That department already exists.')
      setMasterDataNotice('')
      return
    }
    setIsSavingMasterData(true)
    setMasterDataError('')
    setMasterDataNotice('')
    try {
      const { department } = await createDepartment(trimmed)
      const newDepartment = { id: department.id, name: department.name }
      setDepartments((current) => {
        const alreadyAdded = current.some((item) => item.name.toLowerCase() === department.name.toLowerCase())
        return alreadyAdded ? current : [...current, newDepartment].sort((left, right) => left.name.localeCompare(right.name))
      })
      setNewDepartmentName('')
      setMasterDataNotice('Department "' + department.name + '" was added. It is now available in employee profiles and filters.')
    } catch (error) {
      setMasterDataError(error instanceof Error ? error.message : 'Unable to save the department.')
    } finally {
      setIsSavingMasterData(false)
    }
  }

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newPositionName.trim()
    if (!trimmed) {
      setMasterDataError('Please enter a position name.')
      setMasterDataNotice('')
      return
    }
    if (positions.some((position) => position.name.toLowerCase() === trimmed.toLowerCase())) {
      setMasterDataError('That position already exists.')
      setMasterDataNotice('')
      return
    }
    setIsSavingMasterData(true)
    setMasterDataError('')
    setMasterDataNotice('')
    try {
      const { position } = await createEmployeePosition(trimmed)
      setPositions((current) => current.some((entry) => entry.id === position.id)
        ? current
        : [...current, position].sort((left, right) => left.name.localeCompare(right.name)))
      setNewPositionName('')
      setMasterDataNotice('Position "' + position.name + '" was added. It is now available when editing employee profiles.')
    } catch (error) {
      setMasterDataError(error instanceof Error ? error.message : 'Unable to save the position.')
    } finally {
      setIsSavingMasterData(false)
    }
  }

  const updateLocalMasterDataReferences = (kind: MasterDataKind, currentName: string, nextName: string) => {
    if (kind === 'department') {
      setEmployees((current) => current.map((employee) => employee.department === currentName ? { ...employee, department: nextName } : employee))
      setSelectedEmployee((current) => current?.department === currentName ? { ...current, department: nextName } : current)
      setEditEmployeeData((current) => current.department === currentName ? { ...current, department: nextName } : current)
      setSelectedDeptFilter((current) => current === currentName ? nextName : current)
      return
    }
    setEmployees((current) => current.map((employee) => employee.position === currentName ? { ...employee, position: nextName } : employee))
    setSelectedEmployee((current) => current?.position === currentName ? { ...current, position: nextName } : current)
    setEditEmployeeData((current) => current.position === currentName ? { ...current, position: nextName } : current)
  }

  const beginRenameMasterEntry = (kind: MasterDataKind, entry: { id: string; name: string }) => {
    setEditingMasterEntry({ kind, id: entry.id, name: entry.name, reason: '' })
    setMasterDataError('')
    setMasterDataNotice('')
  }

  const handleRenameMasterEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMasterEntry) return
    const name = editingMasterEntry.name.trim()
    const reason = editingMasterEntry.reason.trim()
    if (!name || !reason) {
      setMasterDataError('Enter a name and the reason for this change.')
      return
    }
    const existing = editingMasterEntry.kind === 'department' ? departments : positions
    if (existing.some((entry) => entry.id !== editingMasterEntry.id && entry.name.toLowerCase() === name.toLowerCase())) {
      setMasterDataError('That ' + editingMasterEntry.kind + ' already exists.')
      return
    }
    const previousName = (existing.find((entry) => entry.id === editingMasterEntry.id)?.name || '').trim()
    if (!previousName) {
      setMasterDataError('This ' + editingMasterEntry.kind + ' no longer exists. Refresh the page and try again.')
      return
    }
    setIsSavingMasterData(true)
    setMasterDataError('')
    setMasterDataNotice('')
    try {
      if (editingMasterEntry.kind === 'department') {
        const result = await renameDepartment(editingMasterEntry.id, { name, reason })
        setDepartments((current) => current.map((entry) => entry.id === result.department.id ? result.department : entry).sort((left, right) => left.name.localeCompare(right.name)))
        updateLocalMasterDataReferences('department', previousName, result.department.name)
        setMasterDataNotice('Department renamed to "' + result.department.name + '". ' + result.renamedEmployeeCount + ' employee profile' + (result.renamedEmployeeCount === 1 ? '' : 's') + ' updated.')
      } else {
        const result = await renameEmployeePosition(editingMasterEntry.id, { name, reason })
        setPositions((current) => current.map((entry) => entry.id === result.position.id ? result.position : entry).sort((left, right) => left.name.localeCompare(right.name)))
        updateLocalMasterDataReferences('position', previousName, result.position.name)
        setMasterDataNotice('Position renamed to "' + result.position.name + '". ' + result.renamedEmployeeCount + ' employee profile' + (result.renamedEmployeeCount === 1 ? '' : 's') + ' updated.')
      }
      setEditingMasterEntry(null)
    } catch (error) {
      setMasterDataError(error instanceof Error ? error.message : 'Unable to rename the ' + editingMasterEntry.kind + '.')
    } finally {
      setIsSavingMasterData(false)
    }
  }

  const beginDeleteMasterEntry = (kind: MasterDataKind, entry: { id: string; name: string }) => {
    setMasterEntryToDelete({ kind, id: entry.id, name: entry.name })
    setReplacementEntryId('')
    setDeletionReason('')
    setMasterDataError('')
    setMasterDataNotice('')
  }

  const handleDeleteMasterEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!masterEntryToDelete || !replacementEntryId) {
      setMasterDataError('Choose a replacement before removing this entry.')
      return
    }
    if (replacementEntryId === masterEntryToDelete.id) {
      setMasterDataError('Choose a different replacement.')
      return
    }
    const reason = deletionReason.trim()
    if (!reason) {
      setMasterDataError('Enter the reason for removing this entry.')
      return
    }
    setIsDeletingMasterData(true)
    setMasterDataError('')
    setMasterDataNotice('')
    try {
      if (masterEntryToDelete.kind === 'department') {
        const result = await deleteDepartment(masterEntryToDelete.id, { replacementDepartmentId: replacementEntryId, reason })
        setDepartments((current) => current.filter((entry) => entry.id !== masterEntryToDelete.id))
        updateLocalMasterDataReferences('department', masterEntryToDelete.name, result.replacementDepartment.name)
        setMasterDataNotice('Department removed. ' + result.reassignedEmployeeCount + ' employee profile' + (result.reassignedEmployeeCount === 1 ? '' : 's') + ' reassigned to "' + result.replacementDepartment.name + '".')
      } else {
        const result = await deleteEmployeePosition(masterEntryToDelete.id, { replacementPositionId: replacementEntryId, reason })
        setPositions((current) => current.filter((entry) => entry.id !== masterEntryToDelete.id))
        updateLocalMasterDataReferences('position', masterEntryToDelete.name, result.replacementPosition.name)
        setMasterDataNotice('Position removed. ' + result.reassignedEmployeeCount + ' employee profile' + (result.reassignedEmployeeCount === 1 ? '' : 's') + ' reassigned to "' + result.replacementPosition.name + '".')
      }
      setMasterEntryToDelete(null)
      setReplacementEntryId('')
      setDeletionReason('')
    } catch (error) {
      setMasterDataError(error instanceof Error ? error.message : 'Unable to remove the ' + masterEntryToDelete.kind + '.')
    } finally {
      setIsDeletingMasterData(false)
    }
  }

  // Open Edit Employee Modal
  const beginEditSelectedEmployee = (employee: EmployeeRecord | null = selectedEmployee) => {
    if (!employee) return
    setSelectedEmployee(employee)
    setEditEmployeeData({
      empCode: employee.id,
      department: employee.department,
      lastName: employee.lastName,
      middleName: employee.middleName,
      firstName: employee.firstName,
      suffix: employee.suffix,
      position: employee.position,
      email: employee.email,
      status: employee.status,
      reason: '',
    })
    setEmployeeEditError('')
    setShowEmployeeEditModal(true)
  }

  const handleEditEmployeeInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setEditEmployeeData((prev) => ({ ...prev, [name]: value }))
  }

  const handleUpdateSelectedEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployee) return

    if (!editEmployeeData.empCode.trim() || !editEmployeeData.firstName.trim() || !editEmployeeData.lastName.trim() || !editEmployeeData.position.trim() || !editEmployeeData.reason.trim()) {
      setEmployeeEditError('Please enter the employee code, first name, last name, position, and reason for changing this information.')
      return
    }

    const now = new Date()
    const formattedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(now)
    const formattedTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(now)

    const changeRecord: ChangeHistoryRecord = {
      changedAt: `${formattedDate} · ${formattedTime}`,
      changedBy: 'GSO Admin',
      reason: editEmployeeData.reason.trim(),
    }

    const updatedEmp: EmployeeRecord = {
      ...selectedEmployee,
      id: editEmployeeData.empCode.trim(),
      firstName: editEmployeeData.firstName.trim(),
      middleName: editEmployeeData.middleName.trim(),
      lastName: editEmployeeData.lastName.trim(),
      suffix: editEmployeeData.suffix.trim(),
      initials: `${editEmployeeData.firstName[0] || ''}${editEmployeeData.lastName[0] || ''}`.toUpperCase() || 'EM',
      department: editEmployeeData.department,
      position: editEmployeeData.position.trim(),
      email: editEmployeeData.email.trim(),
      status: editEmployeeData.status,
      statusTone: editEmployeeData.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
      changeHistory: [changeRecord, ...(selectedEmployee.changeHistory || [])],
    }

    try {
      if (!persistedEmployeeIds.has(selectedEmployee.id)) {
        try {
          await createEmployee(employeeProfileInput(selectedEmployee))
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error
        }
      }

      const { employee } = await updateEmployee(selectedEmployee.id, {
        ...employeeProfileInput(updatedEmp),
        reason: editEmployeeData.reason.trim(),
      })
      const savedEmployee = employeeRecordFromProfile(employee, updatedEmp)
      setEmployees((current) => current.map((emp) => (emp.id === selectedEmployee.id ? savedEmployee : emp)))
      setSelectedEmployee(savedEmployee)
      setPersistedEmployeeIds((current) => {
        const updated = new Set(current)
        updated.delete(selectedEmployee.id)
        updated.add(savedEmployee.id)
        return updated
      })
      setEmployeeDataError('')
      setEmployeeEditError('')
      setShowEmployeeEditModal(false)
    } catch (error) {
      setEmployeeEditError(error instanceof Error ? error.message : 'Unable to update the employee profile.')
    }
  }

  const handleOpenEmployeeProfile = (employee: EmployeeRecord) => {
    setSelectedEmployee(employee)
    setShowAllIssuedItems(false)
    setShowEmployeeHistoryModal(false)
    setHistoryDialogTab('issuance')
    setEmployeeIssuanceLoadError('')

    if (!persistedEmployeeIds.has(employee.id)) return

    void listEmployeeIssuances(employee.id)
      .then((issuance) => {
        const updatedEmployee = employeeRecordWithIssuance(employee, issuance)
        setEmployees((current) => current.map((item) => item.id === employee.id ? updatedEmployee : item))
        setSelectedEmployee((current) => current?.id === employee.id ? updatedEmployee : current)
      })
      .catch((error: unknown) => {
        setEmployeeIssuanceLoadError(error instanceof Error ? error.message : 'Unable to load issuance history for this employee.')
      })
  }

  const editablePositionOptions = useMemo(() => {
    const legacyPosition = editEmployeeData.position.trim()
    if (!legacyPosition || positions.some((position) => position.name === legacyPosition)) return positions
    return [{ id: `legacy-${legacyPosition}`, name: legacyPosition }, ...positions]
  }, [editEmployeeData.position, positions])

  const activeMasterEntries = masterDataTab === 'departments' ? departments : positions
  const replacementEntries = masterEntryToDelete
    ? (masterEntryToDelete.kind === 'department' ? departments : positions).filter((entry) => entry.id !== masterEntryToDelete.id)
    : []

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
    <GsoPageFrame activePage="Employees & Requesters" searchPlaceholder="Search employees...">
      {/* HEADER SECTION */}
      <section className="rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <span className="inline-flex rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
          People Directory Workspace
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Employees &amp; Requesters</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
          Manage profiles, assignments, and custody history. GSO-approved requesters appear here.
        </p>
        <nav className="mt-6 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="Employees and requester pages">
            <a
              href="#employee-directory"
              aria-current="page"
              className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#123c70]"
            >
              View Employees
            </a>
            <a
              href="/gso/requester-verification"
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-50 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Requestors Verification
            </a>
        </nav>
      </section>

      {employeeDataError && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {employeeDataError}
        </p>
      )}

      {/* EMPLOYEE MASTER DATA MANAGER */}
      {showDepartmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="people-master-data-title" className="flex max-h-[94vh] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
              <div>
                <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Employee master data</p>
                <h2 id="people-master-data-title" className="mt-1 text-base font-black text-slate-900 sm:text-lg">Manage Departments, Offices &amp; Positions</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Keep the choices in employee profiles clear, current, and consistent.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDepartmentModal(false)
                  setEditingMasterEntry(null)
                  setMasterDataError('')
                  setMasterDataNotice('')
                }}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
              >
                Close
              </button>
            </header>

            <div role="tablist" aria-label="Employee master data sections" className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3 sm:px-7">
              <button
                type="button"
                role="tab"
                aria-selected={masterDataTab === 'departments'}
                onClick={() => { setMasterDataTab('departments'); setEditingMasterEntry(null); setMasterDataError(''); setMasterDataNotice('') }}
                className={masterDataTab === 'departments' ? 'rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition' : 'rounded-xl px-4 py-2.5 text-xs font-extrabold text-slate-600 transition hover:bg-white hover:text-blue-700'}
              >
                Departments
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={masterDataTab === 'positions'}
                onClick={() => { setMasterDataTab('positions'); setEditingMasterEntry(null); setMasterDataError(''); setMasterDataNotice('') }}
                className={masterDataTab === 'positions' ? 'rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition' : 'rounded-xl px-4 py-2.5 text-xs font-extrabold text-slate-600 transition hover:bg-white hover:text-blue-700'}
              >
                Positions
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-7">
              <div role="tabpanel" className="mx-auto max-w-3xl space-y-5">
                <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Add a {masterDataTab === 'departments' ? 'department' : 'position'}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{masterDataTab === 'departments' ? 'New departments appear in employee profiles and directory filters.' : 'New positions appear in the employee profile editor.'}</p>
                  </div>
                  <form onSubmit={masterDataTab === 'departments' ? handleAddDepartment : handleAddPosition} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">{masterDataTab === 'departments' ? 'Department' : 'Position'} name</span>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={masterDataTab === 'departments' ? newDepartmentName : newPositionName}
                        onChange={(event) => {
                          if (masterDataTab === 'departments') setNewDepartmentName(event.target.value)
                          else setNewPositionName(event.target.value)
                        }}
                        placeholder={masterDataTab === 'departments' ? 'e.g. Guidance & Counseling' : 'e.g. Administrative Assistant'}
                        className="h-11 w-full rounded-xl border-2 border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                    <button type="submit" disabled={isSavingMasterData || isLoadingMasterData} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-wait disabled:opacity-60">
                      {isSavingMasterData ? 'Saving...' : 'Add ' + (masterDataTab === 'departments' ? 'department' : 'position')}
                    </button>
                  </form>
                  {masterDataError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{masterDataError}</p>}
                  {masterDataNotice && <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">{masterDataNotice}</p>}
                </section>

                <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">Saved {masterDataTab === 'departments' ? 'departments' : 'positions'}</h3>
                      <p className="mt-1 text-sm text-slate-600">{activeMasterEntries.length} option{activeMasterEntries.length === 1 ? '' : 's'} available.</p>
                    </div>
                  </div>

                  <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-3 pr-3.5">
                    {isLoadingMasterData ? <p className="grid min-h-32 place-items-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-sm font-semibold text-slate-500">Loading master data...</p>
                      : activeMasterEntries.length === 0 ? <p className="grid min-h-32 place-items-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm font-semibold text-slate-500">No {masterDataTab === 'departments' ? 'departments' : 'positions'} saved yet.</p>
                        : activeMasterEntries.map((entry) => {
                          const editing = editingMasterEntry?.kind === (masterDataTab === 'departments' ? 'department' : 'position') && editingMasterEntry.id === entry.id
                          const assignedEmployeeCount = masterDataTab === 'departments'
                            ? employees.filter((employee) => employee.department === entry.name).length
                            : employees.filter((employee) => employee.position === entry.name).length
                          return <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
                            {editing && editingMasterEntry ? <form onSubmit={handleRenameMasterEntry} className="space-y-3">
                              <label className="block">
                                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">Updated {editingMasterEntry.kind} name</span>
                                <input type="text" required maxLength={120} value={editingMasterEntry.name} onChange={(event) => setEditingMasterEntry((current) => current ? { ...current, name: event.target.value } : current)} className="h-11 w-full rounded-xl border-2 border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                              </label>
                              <label className="block">
                                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">Reason for renaming</span>
                                <textarea required maxLength={1000} value={editingMasterEntry.reason} onChange={(event) => setEditingMasterEntry((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="Explain why this label needs to change." className="min-h-24 w-full rounded-xl border-2 border-slate-300 bg-white p-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                              </label>
                              <div className="flex flex-wrap justify-end gap-2">
                                <button type="button" onClick={() => { setEditingMasterEntry(null); setMasterDataError('') }} disabled={isSavingMasterData} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                                <button type="submit" disabled={isSavingMasterData} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{isSavingMasterData ? 'Saving...' : 'Save name'}</button>
                              </div>
                            </form> : <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold text-slate-800">{entry.name}</p>
                                <p className="mt-1 text-[0.68rem] font-semibold text-slate-500">{assignedEmployeeCount} employee profile{assignedEmployeeCount === 1 ? '' : 's'} using this {masterDataTab === 'departments' ? 'department' : 'position'}</p>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <button type="button" onClick={() => beginRenameMasterEntry(masterDataTab === 'departments' ? 'department' : 'position', entry)} className="rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-bold text-blue-800 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">Rename</button>
                                <button type="button" disabled={activeMasterEntries.length <= 1} onClick={() => beginDeleteMasterEntry(masterDataTab === 'departments' ? 'department' : 'position', entry)} className="rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50">Remove</button>
                              </div>
                            </div>}
                          </div>
                        })}
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>
      )}

      {masterEntryToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleDeleteMasterEntry} className="w-full max-w-lg rounded-2xl border border-white/70 bg-white p-5 shadow-2xl sm:p-6">
            <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-rose-600">Confirm removal</p>
            <h3 className="mt-1 text-base font-black text-slate-900">Remove {masterEntryToDelete.name}?</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">Choose the replacement that should receive every employee profile using this {masterEntryToDelete.kind}.</p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">Replacement {masterEntryToDelete.kind}</span>
              <select required value={replacementEntryId} onChange={(event) => setReplacementEntryId(event.target.value)} className="h-11 w-full rounded-xl border-2 border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                <option value="" disabled>Select replacement</option>
                {replacementEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">Reason for removing</span>
              <textarea required maxLength={1000} value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} placeholder="Explain why this label needs to be removed." className="min-h-24 w-full rounded-xl border-2 border-slate-300 bg-white p-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
            </label>
            {masterDataError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{masterDataError}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={isDeletingMasterData} onClick={() => { setMasterEntryToDelete(null); setReplacementEntryId(''); setDeletionReason(''); setMasterDataError('') }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isDeletingMasterData || replacementEntries.length === 0} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50">{isDeletingMasterData ? 'Removing...' : 'Remove and reassign'}</button>
            </div>
          </form>
        </div>
      )}

      {/* EMPLOYEE CARD DIRECTORY */}
      <section id="employee-directory" className="mt-6 scroll-mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-col items-start justify-between gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Employee Directory</h2>
            <p className="mt-1 text-xs font-medium text-slate-600">
              Select an employee profile to review assigned items and history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">
              {isLoadingEmployees ? 'Loading employee directory…' : `${filteredEmployees.length} employee(s) found`}
            </span>
            <button
              type="button"
              onClick={() => {
                setMasterDataTab('departments')
                setMasterDataError('')
                setMasterDataNotice('')
                setShowDepartmentModal(true)
              }}
              className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-extrabold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
            >
              Manage departments, offices &amp; positions
            </button>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:grid-cols-2 sm:px-6">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">
                Filter (by Department)
              </span>
              <button
                type="button"
                onClick={() => {
                  setMasterDataTab('departments')
                  setMasterDataError('')
                  setMasterDataNotice('')
                  setShowDepartmentModal(true)
                }}
                className="text-[0.65rem] font-extrabold text-blue-600 hover:underline"
              >
                Manage list
              </button>
            </div>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              aria-label="Filter employees by department"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">
              Search Bar
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, code, or email..."
              aria-label="Search employee name, code, or email"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
          {filteredEmployees.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {filteredEmployees.map((emp, index) => (
                <article
                  key={emp.id}
                  className="relative rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/5 transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="absolute right-2 top-2 z-10">
                    <button
                      type="button"
                      aria-label={`Actions for ${emp.firstName} ${emp.lastName}`}
                      aria-expanded={openEmployeeMenuId === emp.id}
                      onClick={() => setOpenEmployeeMenuId((current) => current === emp.id ? null : emp.id)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-lg leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      ⋮
                    </button>
                    {openEmployeeMenuId === emp.id && (
                      <div role="menu" className="absolute right-0 top-8 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenEmployeeMenuId(null)
                            handleOpenEmployeeProfile(emp)
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                        >
                          View profile
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenEmployeeMenuId(null)
                            beginEditSelectedEmployee(emp)
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                        >
                          Edit information
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenEmployeeMenuId(null)
                      handleOpenEmployeeProfile(emp)
                    }}
                    aria-label={`Open ${emp.firstName} ${emp.lastName}'s employee profile`}
                    className="w-full rounded-lg px-1 pb-1 pt-4 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <span
                      className={`mx-auto grid h-16 w-16 place-items-center rounded-full border-2 text-xl font-semibold shadow-sm ${
                        index % 2 === 0
                          ? 'border-[#d6b333] bg-[#17377f] text-white'
                          : 'border-[#17377f] bg-[#d6b333] text-[#17377f]'
                      }`}
                    >
                      {emp.initials}
                    </span>
                    <span className="mt-3 block truncate text-xs font-bold text-slate-900" title={`${emp.firstName} ${emp.middleName} ${emp.lastName} ${emp.suffix}`.trim()}>
                      {emp.firstName} {emp.lastName}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.6rem] font-medium text-slate-400" title={emp.id}>
                      Employee · {emp.id}
                    </span>
                    <span className="mx-auto mt-3 flex min-h-7 max-w-full items-center justify-center rounded-full bg-[#17377f] px-3 text-[0.58rem] font-semibold text-white" title={emp.position}>
                      <span className="truncate">{emp.position || 'Employee'}</span>
                    </span>
                    <span className="mt-2 block truncate text-[0.62rem] font-semibold text-slate-500" title={emp.department}>
                      {emp.department}
                    </span>
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 px-1 pt-3">
                    <span className="truncate text-[0.6rem] font-semibold text-slate-500">
                      {emp.assigned} assigned item{emp.assigned === 1 ? '' : 's'}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[0.55rem] font-extrabold ${emp.statusTone}`}>
                      {emp.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-xs font-semibold text-slate-400">
              {isLoadingEmployees ? 'Loading employee profiles…' : 'No employees match the selected filters.'}
            </p>
          )}
        </div>
      </section>

      {/* POP-UP MODAL FOR ISSUED ITEMS AND EMPLOYEE PROFILE HISTORY */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-details-title"
            className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30"
          >
            {/* Modal Header */}
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-blue-100 bg-blue-50 text-sm font-black text-blue-700 shadow-sm">
                  {selectedEmployee.initials}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Employee management</p>
                  <h2 id="employee-details-title" className="mt-0.5 truncate text-base font-black text-slate-900 sm:text-lg">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </h2>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                    {selectedEmployee.id} <span className="px-1 text-slate-300">/</span> {selectedEmployee.department} <span className="px-1 text-slate-300">/</span> {selectedEmployee.position}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                Close
              </button>
            </header>

            {/* Employee Quick Info Cards */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100/80 px-4 py-5 sm:px-8 sm:py-6">
              <div className="mx-auto max-w-4xl space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="min-w-0 rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                    <span className="block text-xs font-extrabold uppercase tracking-wide text-slate-600">School email</span>
                    <p className="mt-2 wrap-break-word text-sm font-bold text-slate-900">{selectedEmployee.email}</p>
                  </div>
                  <div className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                    <span className="block text-xs font-extrabold uppercase tracking-wide text-slate-600">Total issued items</span>
                    <p className="mt-2 text-sm font-extrabold text-blue-700">{selectedEmployee.assigned} unit(s) active</p>
                  </div>
                  <div className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                    <span className="block text-xs font-extrabold uppercase tracking-wide text-slate-600">Employment status</span>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${selectedEmployee.statusTone}`}>
                      {selectedEmployee.status}
                    </span>
                  </div>
                </div>

                {employeeIssuanceLoadError && (
                  <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {employeeIssuanceLoadError}
                  </p>
                )}

                {/* CURRENTLY ISSUED ITEMS SECTION */}
                <div className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                  <div className="mb-4 flex flex-col gap-3 border-b-2 border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        Currently Issued Items
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">List of equipment and assets assigned to this employee.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setShowAllIssuedItems(true)}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-extrabold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                      >
                        View All Issued Items
                      </button>
                      <a
                        href={`/gso/main-issuance?employeeCode=${encodeURIComponent(selectedEmployee.id)}`}
                        className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                      >
                        + Add New Issuance
                      </a>
                    </div>
                  </div>

                  {/* Table of Issued Items */}
                  <div className="mt-4 overflow-x-auto rounded-xl border-2 border-slate-300 shadow-sm">
                    <table className="w-full min-w-190 text-left text-sm">
                      <thead className="bg-slate-100 text-xs font-extrabold uppercase tracking-wide text-slate-700">
                        <tr className="divide-x divide-slate-300 border-b-2 border-slate-300">
                          <th className="whitespace-nowrap px-4 py-3.5">Asset code</th>
                          <th className="px-4 py-3.5">Item name</th>
                          <th className="whitespace-nowrap px-4 py-3.5">Quantity</th>
                          <th className="whitespace-nowrap px-4 py-3.5">Condition</th>
                          <th className="whitespace-nowrap px-4 py-3.5">Assigned date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedEmployee.assignedItems.slice(0, 2).map((item) => (
                          <tr key={item.id} className="divide-x divide-slate-200 bg-white transition-colors hover:bg-blue-50/50">
                            <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-600">{item.code}</td>
                            <td className="px-4 py-3 font-extrabold text-slate-900">{item.name}</td>
                            <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{item.quantity} {item.unitOfMeasure}</td>
                            <td className="whitespace-nowrap px-4 py-3 align-middle">
                              <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold ${item.tone}`}>
                                {item.condition}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-600">{item.assignedOn}</td>
                          </tr>
                        ))}
                        {selectedEmployee.assignedItems.length === 0 && (
                          <tr>
                            <td colSpan={5} className="bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-600">
                              No items currently issued to this employee.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ISSUANCE & RETURN HISTORY AUDIT LOGS */}
                <div className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Employee History
                    </h3>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => {
                        setHistoryDialogTab('issuance')
                        setShowEmployeeHistoryModal(true)
                      }}
                      className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                    >
                      View History
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">View issuance, return, and profile change records.</p>

                  <div className="hidden mt-3 space-y-2 pr-1">
                    {selectedEmployee.history.slice(0, 2).map((log, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-md px-2 py-0.5 text-[0.58rem] font-extrabold ${
                              log.event === 'Issued' || log.event === 'Returned'
                                ? 'bg-emerald-50 text-emerald-700'
                                : log.event === 'Pending Approval' || log.event === 'Return Pending Approval'
                                  ? 'bg-blue-50 text-blue-700'
                                  : log.event === 'Rejected' || log.event === 'Expired' || log.event === 'Email Failed' || log.event === 'Return Rejected' || log.event === 'Return Expired' || log.event === 'Return Email Failed'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-amber-50 text-amber-700'
                            }`}>
                              {log.event}
                            </span>
                            <span className="text-xs font-bold text-slate-700">{log.item}</span>
                            <span className="text-[0.62rem] text-slate-400">({log.code})</span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[0.58rem] font-bold text-slate-600">{log.quantity} {log.unitOfMeasure}</span>
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

                {/* PROFILE CHANGE HISTORY AUDIT LOGS */}
                {selectedEmployee.changeHistory && selectedEmployee.changeHistory.length > 0 && (
                  <div className="hidden mt-5 border-t border-slate-100 pt-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Profile Change History
                    </h4>
                    <p className="mt-0.5 text-[0.68rem] text-slate-400">Recorded reasons for edits to this employee profile.</p>
                    <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
                      {selectedEmployee.changeHistory.map((change, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                          <p className="text-xs font-semibold text-slate-700">{change.reason}</p>
                          <p className="mt-1 text-[0.62rem] font-bold text-slate-400">
                            By {change.changedBy || 'Unknown user'} · {change.changedAt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Modal footer with employee profile actions */}
            <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => beginEditSelectedEmployee()}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-extrabold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                >
                  Edit Profile
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 sm:min-w-24"
              >
                Done
              </button>
            </footer>
          </section>
        </div>
      )}

      {showAllIssuedItems && selectedEmployee && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="issued-items-dialog-title"
            className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
              <div className="min-w-0">
                <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Employee inventory</p>
                <h2 id="issued-items-dialog-title" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
                  Issued Items
                </h2>
                <p className="mt-2 text-base font-bold text-slate-800">
                  {selectedEmployee.firstName} {selectedEmployee.lastName} · {selectedEmployee.id}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {selectedEmployee.assigned} active unit(s) assigned to this employee.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllIssuedItems(false)}
                className="shrink-0 rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100/80 px-4 py-5 sm:px-8 sm:py-6">
              {selectedEmployee.assignedItems.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border-2 border-slate-400 bg-white shadow-md">
                  <table className="w-full min-w-200 text-left text-base">
                    <thead className="bg-slate-100 text-sm font-extrabold uppercase tracking-wide text-slate-800">
                      <tr className="divide-x divide-slate-300 border-b-2 border-slate-300">
                        <th className="whitespace-nowrap px-5 py-4">Asset code</th>
                        <th className="px-5 py-4">Item name</th>
                        <th className="whitespace-nowrap px-5 py-4">Quantity</th>
                        <th className="whitespace-nowrap px-5 py-4">Condition</th>
                        <th className="whitespace-nowrap px-5 py-4">Assigned date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedEmployee.assignedItems.map((item) => (
                        <tr key={item.id} className="divide-x divide-slate-200 bg-white transition-colors hover:bg-blue-50/50">
                          <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-800">
                            {item.code}
                            {item.assetTagCodes.length > 0 && (
                              <span className="mt-1 block whitespace-normal text-[0.65rem] font-semibold leading-relaxed text-blue-700">
                                {item.assetTagCodes.join(' · ')}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 font-extrabold text-slate-950">{item.name}</td>
                          <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-800">{item.quantity} {item.unitOfMeasure}</td>
                          <td className="whitespace-nowrap px-5 py-4 align-middle">
                            <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-extrabold ${item.tone}`}>
                              {item.condition}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-800">{item.assignedOn}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-400 bg-white px-5 py-10 text-center text-base font-semibold text-slate-700">
                  No items currently issued to this employee.
                </p>
              )}
              {selectedEmployee.history.some((log) => log.event === 'Returned' || log.event === 'Reported Lost') && (
                <section className="mt-5 rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="issued-item-return-history-title">
                  <div className="border-b border-slate-200 pb-3">
                    <h3 id="issued-item-return-history-title" className="text-base font-black text-slate-900">Returned Item History</h3>
                    <p className="mt-1 text-sm text-slate-600">Returned or lost units are no longer listed as active assignments.</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {selectedEmployee.history.filter((log) => log.event === 'Returned' || log.event === 'Reported Lost').map((log, index) => (
                      <article key={log.returnId || `${log.code}-${log.date}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${log.event === 'Reported Lost' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{log.event}</span>
                            <h4 className="mt-2 text-sm font-extrabold text-slate-900">{log.item} <span className="font-semibold text-slate-600">({log.code})</span></h4>
                            {log.assetTagCode && <p className="mt-1 font-mono text-xs font-bold text-blue-700">Unit barcode: {log.assetTagCode}</p>}
                          </div>
                          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700">{log.date}</span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                          {log.returnCondition && <p><span className="font-bold text-slate-500">Condition:</span> <span className="font-extrabold text-slate-800">{log.returnCondition}</span></p>}
                          {log.returnedByName && <p><span className="font-bold text-slate-500">Brought in by:</span> <span className="font-semibold text-slate-800">{log.returnedByName}</span></p>}
                          {log.confirmationMethod && <p><span className="font-bold text-slate-500">Verified by:</span> <span className="font-semibold text-slate-800">{log.confirmationMethod.replaceAll('_', ' ')}</span></p>}
                        </div>
                        <p className="mt-3 wrap-break-word text-sm leading-relaxed text-slate-700">{log.note}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      )}

      {showEmployeeHistoryModal && selectedEmployee && (
        <div className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-history-dialog-title"
            className="flex max-h-[90vh] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
              <div className="min-w-0">
                <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Employee management</p>
                <h2 id="employee-history-dialog-title" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
                  Employee History
                </h2>
                <p className="mt-2 text-base font-bold text-slate-800">
                  {selectedEmployee.firstName} {selectedEmployee.lastName} · {selectedEmployee.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEmployeeHistoryModal(false)}
                className="shrink-0 rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                Close
              </button>
            </header>

            <div className="flex shrink-0 flex-wrap gap-2 border-b-2 border-slate-300 bg-white px-5 py-3.5 sm:px-8">
              <button
                type="button"
                aria-pressed={historyDialogTab === 'issuance'}
                onClick={() => setHistoryDialogTab('issuance')}
                className={`rounded-xl px-4 py-3 text-base font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${historyDialogTab === 'issuance' ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'border-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
              >
                Issuance & Return History
              </button>
              <button
                type="button"
                aria-pressed={historyDialogTab === 'profile'}
                onClick={() => setHistoryDialogTab('profile')}
                className={`rounded-xl px-4 py-3 text-base font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${historyDialogTab === 'profile' ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'border-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
              >
                Profile Change History
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100/80 px-4 py-5 sm:px-8 sm:py-6">
              {historyDialogTab === 'issuance' ? (
                selectedEmployee.history.length > 0 ? (
                  <div className="space-y-3">
                    {selectedEmployee.history.map((log, idx) => (
                      <div key={`${log.code}-${log.date}-${idx}`} className="flex flex-col items-start justify-between gap-3 rounded-2xl border-2 border-slate-300/80 bg-white p-5 sm:flex-row sm:gap-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
                              log.event === 'Issued' || log.event === 'Returned'
                                ? 'bg-emerald-50 text-emerald-700'
                                : log.event === 'Pending Approval' || log.event === 'Return Pending Approval'
                                  ? 'bg-blue-50 text-blue-700'
                                  : log.event === 'Rejected' || log.event === 'Expired' || log.event === 'Email Failed' || log.event === 'Return Rejected' || log.event === 'Return Expired' || log.event === 'Return Email Failed'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-amber-50 text-amber-700'
                            }`}>
                              {log.event}
                            </span>
                            <span className="text-base font-extrabold text-slate-950">{log.item}</span>
                            <span className="text-sm font-semibold text-slate-700">({log.code})</span>
                            <span className="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-800">{log.quantity} {log.unitOfMeasure}</span>
                          </div>
                          {log.assetTagCode && <p className="mt-2 font-mono text-sm font-extrabold text-blue-700">Unit barcode: {log.assetTagCode}</p>}
                          {(log.returnCondition || log.returnedByName || log.confirmationMethod) && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                              {log.returnCondition && <span><strong>Return condition:</strong> {log.returnCondition}</span>}
                              {log.returnedByName && <span><strong>Brought in by:</strong> {log.returnedByName}</span>}
                              {log.confirmationMethod && <span><strong>Verified by:</strong> {log.confirmationMethod.replaceAll('_', ' ')}</span>}
                            </div>
                          )}
                          <p className="mt-3 text-base leading-relaxed text-slate-800">{log.note}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-800">{log.date}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-400 bg-white px-5 py-10 text-center text-base font-semibold text-slate-700">
                    No transaction history recorded yet.
                  </p>
                )
              ) : selectedEmployee.changeHistory && selectedEmployee.changeHistory.length > 0 ? (
                <div className="space-y-3">
                  {selectedEmployee.changeHistory.map((change, idx) => (
                    <div key={`${change.changedAt}-${idx}`} className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                      <p className="text-base font-semibold leading-relaxed text-slate-950">{change.reason}</p>
                      <p className="mt-3 text-sm font-bold text-slate-700">
                        By {change.changedBy || 'Unknown user'} · {change.changedAt}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-400 bg-white px-5 py-10 text-center text-base font-semibold text-slate-700">
                  No profile changes recorded yet.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* EDIT EMPLOYEE PROFILE MODAL */}
      {showEmployeeEditModal && selectedEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <form
            onSubmit={handleUpdateSelectedEmployee}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-employee-profile-title"
            className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-blue-100 bg-blue-50 text-sm font-black text-blue-700 shadow-sm">
                  {selectedEmployee.initials}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Employee management</p>
                  <h2 id="edit-employee-profile-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">Edit Employee Profile</h2>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                    {selectedEmployee.id} <span className="px-1 text-slate-300">/</span> {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEmployeeEditModal(false)
                  setEmployeeEditError('')
                }}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-8 sm:py-6">
              <div className="mx-auto max-w-4xl space-y-4">
                {employeeEditError && (
                  <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {employeeEditError}
                  </p>
                )}

                <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Employee details</h3>
                    <p className="mt-1 text-sm text-slate-600">Fields marked <span className="font-extrabold text-rose-600">*</span> are required.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-800">Employee Code <span className="text-rose-600">*</span></span>
                      <input
                        type="text"
                        name="empCode"
                        required
                        value={editEmployeeData.empCode}
                        onChange={handleEditEmployeeInputChange}
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-800">Department</span>
                      <select
                        name="department"
                        value={editEmployeeData.department}
                        onChange={handleEditEmployeeInputChange}
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      >
                        {departments.map((dept) => (
                          <option key={dept.id} value={dept.name}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-800">First Name <span className="text-rose-600">*</span></span>
                      <input
                        type="text"
                        name="firstName"
                        required
                        value={editEmployeeData.firstName}
                        onChange={handleEditEmployeeInputChange}
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-800">Middle Name</span>
                      <input
                        type="text"
                        name="middleName"
                        value={editEmployeeData.middleName}
                        onChange={handleEditEmployeeInputChange}
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-800">Last Name <span className="text-rose-600">*</span></span>
                      <input
                        type="text"
                        name="lastName"
                        required
                        value={editEmployeeData.lastName}
                        onChange={handleEditEmployeeInputChange}
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-800">Suffix</span>
                      <input
                        type="text"
                        name="suffix"
                        value={editEmployeeData.suffix}
                        onChange={handleEditEmployeeInputChange}
                        placeholder="e.g. Jr., III"
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-800">Position <span className="text-rose-600">*</span></span>
                      <select
                        name="position"
                        required
                        value={editEmployeeData.position}
                        onChange={handleEditEmployeeInputChange}
                        disabled={isLoadingMasterData || editablePositionOptions.length === 0}
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="" disabled>{isLoadingMasterData ? 'Loading positions...' : editablePositionOptions.length ? 'Select a position' : 'No managed positions available'}</option>
                        {editablePositionOptions.map((position) => <option key={position.id} value={position.name}>{position.name}{position.id.startsWith('legacy-') ? ' (current legacy value)' : ''}</option>)}
                      </select>
                      <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">Manage position choices from the Employee Directory header.</span>
                    </label>

                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-800">
                        Email
                        {selectedEmployee?.emailLocked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                            Locked
                          </span>
                        )}
                      </span>
                      <input
                        type="email"
                        name="email"
                        value={editEmployeeData.email}
                        onChange={handleEditEmployeeInputChange}
                        readOnly={selectedEmployee?.emailLocked}
                        aria-describedby="employee-email-help"
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 read-only:cursor-not-allowed read-only:border-slate-200 read-only:bg-slate-50 read-only:text-slate-500 read-only:hover:border-slate-200"
                      />
                      <span id="employee-email-help" className="mt-1.5 block text-xs leading-relaxed text-slate-500">
                        {selectedEmployee?.emailLocked
                          ? 'Return codes and receipts go to this address, so it cannot change while the employee has items out, a pending issuance or return, or an unsettled lost item.'
                          : 'Return codes and receipts go to this address. If you change it, the old address gets a notice.'}
                      </span>
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="mb-2 block text-sm font-extrabold text-slate-800">Status</span>
                      <select
                        name="status"
                        value={editEmployeeData.status}
                        onChange={handleEditEmployeeInputChange}
                        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </label>

                  </div>
                </section>

                <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
                  <label className="block">
                    <span className="mb-2 flex flex-wrap items-center gap-2 text-sm font-extrabold text-slate-900">
                      Why are you changing this information?
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-amber-900">Required</span>
                    </span>
                    <span className="mb-2 block text-sm leading-relaxed text-slate-600">This reason will be saved in the employee profile history.</span>
                    <textarea
                      name="reason"
                      required
                      value={editEmployeeData.reason}
                      onChange={handleEditEmployeeInputChange}
                      placeholder="For example: Employee transferred to another department."
                      className="min-h-32 w-full rounded-xl border-2 border-amber-300 bg-white p-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-amber-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </section>
              </div>
            </div>

            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-8">
              <button
                type="button"
                onClick={() => {
                  setShowEmployeeEditModal(false)
                  setEmployeeEditError('')
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
              >
                Save Changes
              </button>
            </footer>
          </form>
        </div>
      )}

    </GsoPageFrame>
  )
}
