import React, { useEffect, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { ApiError } from '../auth/authApi'
import { createDepartment, createEmployee, listDepartments, listEmployees, updateEmployee, type EmployeeProfile, type EmployeeProfileInput } from './employeesApi'
import { createEmployeeIssuanceBatch, createEmployeeReturn, listEmployeeIssuances } from './issuancesApi'
import { listInventoryItems, type InventoryItemRecord } from './inventoryApi'

interface DepartmentItem {
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

const returnConditionOptions = ['New', 'Good', 'Fair', 'Needs Repair', 'Unserviceable', 'Retired']

function returnConditionForInspection(condition?: string) {
  if (!condition) return 'Good'
  if (returnConditionOptions.includes(condition)) return condition
  return condition === 'Under Maintenance' ? 'Needs Repair' : 'Good'
}

interface EmployeeHistoryLog {
  date: string
  event: string
  item: string
  code: string
  quantity: number
  unitOfMeasure: string
  note: string
}

interface ChangeHistoryRecord {
  changedAt: string
  changedBy: string | null
  reason: string
}

interface EmployeeRecord {
  id: string
  firstName: string
  lastName: string
  initials: string
  department: string
  position: string
  email: string
  assigned: number
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
    lastName,
    initials: `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'EM',
    department: profile.department,
    position: profile.position,
    email: profile.email,
    assigned: profile.assignedCount,
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

function employeeProfileInput(employee: EmployeeRecord): EmployeeProfileInput {
  return {
    employeeCode: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    department: employee.department,
    position: employee.position,
    email: employee.email,
    status: employee.status as 'Active' | 'Inactive',
  }
}

export default function EmployeeMasterData() {
  // Navigation tab state: 'directory' or 'add_employee'
  const [activeTab, setActiveTab] = useState<'directory' | 'add_employee'>('directory')

  // Dynamic departments state
  const [departments, setDepartments] = useState<DepartmentItem[]>(initialDepartments)
  const [showDepartmentModal, setShowDepartmentModal] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [editingDeptName, setEditingDeptName] = useState('')
  const [editingDeptReason, setEditingDeptReason] = useState('')
  const [deptToDelete, setDeptToDelete] = useState<DepartmentItem | null>(null)
  const [deptDeleteReason, setDeptDeleteReason] = useState('')
  const [departmentManagerError, setDepartmentManagerError] = useState('')

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all')

  // Employees data list
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [persistedEmployeeIds, setPersistedEmployeeIds] = useState<Set<string>>(() => new Set())
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true)
  const [employeeDataError, setEmployeeDataError] = useState('')
  const [employeeSaveError, setEmployeeSaveError] = useState('')
  const [showAllIssuedItems, setShowAllIssuedItems] = useState(false)
  const [showEmployeeHistoryModal, setShowEmployeeHistoryModal] = useState(false)
  const [historyDialogTab, setHistoryDialogTab] = useState<'issuance' | 'profile'>('issuance')
  const [employeeIssuanceLoadError, setEmployeeIssuanceLoadError] = useState('')

  // Selected employee modal state
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null)
  const [availableInventoryStock, setAvailableInventoryStock] = useState<InventoryItemRecord[]>([])
  const [isLoadingInventory, setIsLoadingInventory] = useState(true)
  const [inventoryLoadError, setInventoryLoadError] = useState('')

  // Edit Employee Modal state
  const [showEmployeeEditModal, setShowEmployeeEditModal] = useState(false)
  const [employeeEditError, setEmployeeEditError] = useState('')
  const [editEmployeeData, setEditEmployeeData] = useState({
    empCode: '',
    department: 'Registrar Office',
    lastName: '',
    firstName: '',
    position: '',
    email: '',
    status: 'Active',
    reason: '',
  })

  useEffect(() => {
    let active = true

    void listDepartments()
      .then(({ departments: records }) => {
        if (!active || records.length === 0) return
        setDepartments(records.map((department) => ({ id: department.id, name: department.name })))
      })
      .catch((error: unknown) => {
        if (active) setDepartmentManagerError(error instanceof Error ? error.message : 'Unable to load departments.')
      })

    void listEmployees()
      .then(({ employees: profiles }) => {
        if (!active) return
        const mappedEmployees = profiles.map((profile) => employeeRecordFromProfile(profile))
        setEmployees(mappedEmployees)
        setPersistedEmployeeIds(new Set(profiles.map((profile) => profile.id)))
        setEmployeeDataError('')
      })
      .catch((error: unknown) => {
        if (active) setEmployeeDataError(error instanceof Error ? error.message : 'Unable to load employee profiles.')
      })
      .finally(() => {
        if (active) setIsLoadingEmployees(false)
      })

    void listInventoryItems()
      .then((items) => {
        if (!active) return
        setAvailableInventoryStock(items.filter((item) => item.status.toLowerCase() === 'available' && item.availableQuantity > 0))
        setInventoryLoadError('')
      })
      .catch((error: unknown) => {
        if (active) setInventoryLoadError(error instanceof Error ? error.message : 'Unable to load available inventory items.')
      })
      .finally(() => {
        if (active) setIsLoadingInventory(false)
      })

    return () => { active = false }
  }, [])

  // Handle Surrender/Return Issuance Modal state
  const [showHandleIssuanceModal, setShowHandleIssuanceModal] = useState(false)
  const [selectedReturnIssuanceId, setSelectedReturnIssuanceId] = useState('')
  const [returnQuantity, setReturnQuantity] = useState('1')
  const [returnCondition, setReturnCondition] = useState('Good')
  const [returnPriority, setReturnPriority] = useState<'High' | 'Medium'>('High')
  const [surrenderReason, setSurrenderReason] = useState('')
  const [returnSubmitError, setReturnSubmitError] = useState('')
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false)

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
  const [issuanceSelectionMode, setIssuanceSelectionMode] = useState<'single' | 'multiple'>('single')
  const [selectedAssetCodes, setSelectedAssetCodes] = useState<string[]>([])
  const [selectedAssetQuantities, setSelectedAssetQuantities] = useState<Record<string, string>>({})
  const [inventorySearchQuery, setInventorySearchQuery] = useState('')
  const [isInventoryDropdownOpen, setIsInventoryDropdownOpen] = useState(false)
  const [isSubmittingIssuance, setIsSubmittingIssuance] = useState(false)
  const [issuanceSubmitError, setIssuanceSubmitError] = useState('')
  const [issuanceNotes, setIssuanceNotes] = useState('Acknowledged by employee')

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
      department: departments[0]?.name || 'Registrar Office',
      lastName: '',
      firstName: '',
      position: '',
      email: '',
      picture: null,
      status: 'Active',
    })
  }

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newDepartmentName.trim()
    if (!trimmed) {
      setDepartmentManagerError('Please enter a department name.')
      return
    }

    const existing = departments.find((department) => department.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      setFormData((prev) => ({ ...prev, department: existing.name }))
      setDepartmentManagerError('That department already exists and has been selected.')
      return
    }

    setDepartmentManagerError('')
    try {
      const { department } = await createDepartment(trimmed)
      const newDepartment = { id: department.id, name: department.name }
      setDepartments((current) => {
        const alreadyAdded = current.some((item) => item.name.toLowerCase() === department.name.toLowerCase())
        return alreadyAdded ? current : [...current, newDepartment]
      })
      setFormData((prev) => ({ ...prev, department: department.name }))
      setNewDepartmentName('')
      alert('The new department was added successfully!')
    } catch (error) {
      setDepartmentManagerError(error instanceof Error ? error.message : 'Unable to save the department.')
    }
  }

  const handleRenameDepartment = (e: React.FormEvent, dept: DepartmentItem) => {
    e.preventDefault()
    const name = editingDeptName.trim()
    const reason = editingDeptReason.trim()
    if (!name || !reason) {
      setDepartmentManagerError('Please enter a new name and the reason for changing it.')
      return
    }

    setDepartments((current) =>
      current.map((item) => (item.id === dept.id ? { ...item, name } : item))
    )
    setEmployees((current) =>
      current.map((emp) => (emp.department === dept.name ? { ...emp, department: name } : emp))
    )
    setSelectedEmployee((current) =>
      current?.department === dept.name ? { ...current, department: name } : current
    )
    setFormData((current) => (current.department === dept.name ? { ...current, department: name } : current))
    setSelectedDeptFilter((current) => (current === dept.name ? name : current))

    setEditingDeptId(null)
    setEditingDeptName('')
    setEditingDeptReason('')
    setDepartmentManagerError('')
  }

  const handleDeleteDepartment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!deptToDelete || !deptDeleteReason.trim()) {
      setDepartmentManagerError('Please specify the reason for deleting this department.')
      return
    }

    const remaining = departments.filter((d) => d.id !== deptToDelete.id)
    const fallbackDept = remaining[0]?.name || 'General'

    setDepartments(remaining)
    setEmployees((current) =>
      current.map((emp) =>
        emp.department === deptToDelete.name ? { ...emp, department: fallbackDept } : emp
      )
    )
    setSelectedEmployee((current) =>
      current?.department === deptToDelete.name ? { ...current, department: fallbackDept } : current
    )
    setFormData((current) =>
      current.department === deptToDelete.name ? { ...current, department: fallbackDept } : current
    )
    setSelectedDeptFilter((current) => (current === deptToDelete.name ? 'all' : current))

    setDeptToDelete(null)
    setDeptDeleteReason('')
    setDepartmentManagerError('')
  }

  const handleSaveEmployee = async () => {
    setEmployeeSaveError('')
    const employeeCode = formData.empCode.trim()
    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()
    if (!employeeCode || !firstName || !lastName) {
      setEmployeeSaveError('Enter the employee code, first name, and last name.')
      return
    }

    const email = formData.email.trim() || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@dyci.edu.ph`
    if (employees.some((employee) => employee.id.toLowerCase() === employeeCode.toLowerCase())) {
      setEmployeeSaveError('May employee profile na gumagamit ng Employee Code na iyan.')
      return
    }
    if (employees.some((employee) => employee.email.toLowerCase() === email.toLowerCase())) {
      setEmployeeSaveError('May employee profile na gumagamit ng email address na iyan.')
      return
    }

    const newEmp: EmployeeRecord = {
      id: employeeCode,
      firstName,
      lastName,
      initials: `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'EM',
      department: formData.department,
      position: formData.position.trim() || 'Employee',
      email,
      assigned: 0,
      status: formData.status,
      statusTone: formData.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
      assignedItems: [],
      history: [],
      changeHistory: [],
    }

    try {
      const { employee } = await createEmployee(employeeProfileInput(newEmp))
      const savedEmployee = employeeRecordFromProfile(employee)
      setEmployees((current) => [savedEmployee, ...current])
      setPersistedEmployeeIds((current) => new Set(current).add(savedEmployee.id))
      setEmployeeDataError('')
      handleClearForm()
      setActiveTab('directory')
      alert('The new employee was added successfully!')
    } catch (error) {
      setEmployeeSaveError(error instanceof Error ? error.message : 'Unable to save the employee profile.')
    }
  }

  // Open Edit Employee Modal
  const beginEditSelectedEmployee = () => {
    if (!selectedEmployee) return
    setEditEmployeeData({
      empCode: selectedEmployee.id,
      department: selectedEmployee.department,
      lastName: selectedEmployee.lastName,
      firstName: selectedEmployee.firstName,
      position: selectedEmployee.position,
      email: selectedEmployee.email,
      status: selectedEmployee.status,
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

    if (!editEmployeeData.empCode.trim() || !editEmployeeData.firstName.trim() || !editEmployeeData.lastName.trim() || !editEmployeeData.reason.trim()) {
      setEmployeeEditError('Please enter the employee code, first name, last name, and reason for changing this information.')
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
      lastName: editEmployeeData.lastName.trim(),
      initials: `${editEmployeeData.firstName[0] || ''}${editEmployeeData.lastName[0] || ''}`.toUpperCase() || 'EM',
      department: editEmployeeData.department,
      position: editEmployeeData.position.trim() || 'Employee',
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

  // Handle Surrender/Return Form Submission
  const handleConfirmSurrender = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployee || !selectedReturnIssuanceId) {
      alert('Select an issued item to process surrender.')
      return
    }

    const targetItem = selectedEmployee.assignedItems.find((item) => item.id === selectedReturnIssuanceId)
    if (!targetItem) return
    const requestedQuantity = Number(returnQuantity)
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > targetItem.quantity) {
      setReturnSubmitError(`Enter a whole number from 1 to ${targetItem.quantity} ${targetItem.unitOfMeasure}.`)
      return
    }
    if (!surrenderReason.trim()) {
      setReturnSubmitError('Please enter a surrender or return reason in the notes field.')
      return
    }
    setReturnSubmitError('')
    setIsSubmittingReturn(true)
    const returnReason = returnCondition === 'Needs Repair'
      ? `${surrenderReason.trim()}\nRepair priority: ${returnPriority}`
      : surrenderReason.trim()
    try {
      const request = await createEmployeeReturn(
        selectedEmployee.id,
        targetItem.code,
        returnCondition,
        returnReason,
        targetItem.id,
        requestedQuantity,
      )
      const requestedAt = new Date(request.requestedAt)
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }).format(Number.isNaN(requestedAt.getTime()) ? new Date() : requestedAt)
      const remainingQuantity = Math.max(0, request.remainingQuantity ?? (targetItem.quantity - request.quantity))
      const assignedItems = selectedEmployee.assignedItems
        .map((item) => item.id === targetItem.id ? { ...item, quantity: remainingQuantity } : item)
        .filter((item) => item.quantity > 0)
      const newHistoryEntry: EmployeeHistoryLog = {
        date: formattedDate,
        event: 'Returned',
        item: targetItem.name,
        code: targetItem.code,
        quantity: request.quantity,
        unitOfMeasure: targetItem.unitOfMeasure,
        note: `Returned ${request.quantity} ${targetItem.unitOfMeasure}. ${remainingQuantity > 0 ? `${remainingQuantity} ${targetItem.unitOfMeasure} remain assigned. ` : ''}Condition after GSO inspection: ${returnCondition}. GSO notes: ${returnReason}`,
      }
      const updatedEmp: EmployeeRecord = {
        ...selectedEmployee,
        assigned: assignedItems.reduce((total, item) => total + item.quantity, 0),
        assignedItems,
        history: [newHistoryEntry, ...selectedEmployee.history],
      }
      setEmployees((current) => current.map((emp) => (emp.id === selectedEmployee.id ? updatedEmp : emp)))
      setSelectedEmployee(updatedEmp)
      setSurrenderReason('')
      setReturnQuantity('1')
      setReturnPriority('High')
      setShowHandleIssuanceModal(false)
      void listInventoryItems()
        .then((items) => setAvailableInventoryStock(items.filter((item) => item.status.toLowerCase() === 'available' && item.availableQuantity > 0)))
        .catch((error: unknown) => setInventoryLoadError(error instanceof Error ? error.message : 'Unable to refresh inventory availability.'))
      alert(`Processed return of ${request.quantity} ${targetItem.unitOfMeasure} for ${targetItem.code}. ${remainingQuantity > 0 ? `${remainingQuantity} ${targetItem.unitOfMeasure} remain assigned to ${selectedEmployee.firstName}.` : 'No units remain assigned to this employee.'} ${request.emailSent ? `A confirmation email was sent to ${selectedEmployee.email}.` : 'The return was recorded, but the confirmation email could not be sent.'}`)
    } catch (error) {
      setReturnSubmitError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Unable to process item return.')
    } finally {
      setIsSubmittingReturn(false)
    }
  }

  // Toggle an inventory item in the issuance batch.
  const handleSelectInventoryItem = (code: string) => {
    if (issuanceSelectionMode === 'single') {
      if (selectedAssetCodes.includes(code)) {
        setSelectedAssetCodes([])
        setSelectedAssetQuantities({})
      } else {
        setSelectedAssetCodes([code])
        setSelectedAssetQuantities({ [code]: '1' })
      }
      setIssuanceSubmitError('')
      setIsInventoryDropdownOpen(false)
      setInventorySearchQuery('')
      return
    }
    if (selectedAssetCodes.includes(code)) {
      setSelectedAssetCodes((current) => current.filter((itemCode) => itemCode !== code))
      setSelectedAssetQuantities((current) => {
        const next = { ...current }
        delete next[code]
        return next
      })
      setIssuanceSubmitError('')
      return
    }
    if (selectedAssetCodes.length >= 100) {
      setIssuanceSubmitError('Select up to 100 items for one approval email.')
      return
    }
    setSelectedAssetCodes((current) => [...current, code])
    setSelectedAssetQuantities((current) => ({ ...current, [code]: '1' }))
    setIssuanceSubmitError('')
  }

  const resetIssuanceForm = () => {
    setIssuanceSelectionMode('single')
    setSelectedAssetCodes([])
    setSelectedAssetQuantities({})
    setInventorySearchQuery('')
    setIsInventoryDropdownOpen(false)
    setIssuanceNotes('Acknowledged by employee')
    setIssuanceSubmitError('')
  }

  const handleOpenEmployeeProfile = (employee: EmployeeRecord) => {
    setSelectedEmployee(employee)
    setShowAllIssuedItems(false)
    setShowEmployeeHistoryModal(false)
    setHistoryDialogTab('issuance')
    setEmployeeIssuanceLoadError('')

    if (!persistedEmployeeIds.has(employee.id)) return

    void listEmployeeIssuances(employee.id)
      .then(({ assignedItems, history }) => {
        const updatedEmployee: EmployeeRecord = {
          ...employee,
          assigned: assignedItems.reduce((total, item) => total + item.quantity, 0),
          assignedItems: assignedItems.map((item) => ({
            ...item,
            tone: item.condition === 'Good' || item.condition === 'New'
              ? 'bg-emerald-50 text-emerald-700'
              : item.condition === 'Fair'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700',
          })),
          history,
        }
        setEmployees((current) => current.map((item) => item.id === employee.id ? updatedEmployee : item))
        setSelectedEmployee((current) => current?.id === employee.id ? updatedEmployee : current)
      })
      .catch((error: unknown) => {
        setEmployeeIssuanceLoadError(error instanceof Error ? error.message : 'Unable to load issuance history for this employee.')
      })
  }

  const handleAddIssuanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployee) return
    if (selectedAssetCodes.length === 0) {
      setIssuanceSubmitError('Select at least one available inventory item first.')
      return
    }

    const selectedStocks = selectedAssetCodes.map((code) =>
      availableInventoryStock.find((item) => item.itemCode === code)
    )
    if (selectedStocks.some((item) => !item)) {
      setIssuanceSubmitError('One or more selected items are no longer available. Refresh the inventory and select them again.')
      return
    }
    const validStocks = selectedStocks.filter((item): item is InventoryItemRecord => Boolean(item))
    const requestedItems = validStocks.map((stock) => ({
      stock,
      quantity: Number(selectedAssetQuantities[stock.itemCode] || 0),
    }))
    const invalidQuantity = requestedItems.find(({ stock, quantity }) =>
      !Number.isInteger(quantity) || quantity < 1 || quantity > stock.availableQuantity
    )
    if (invalidQuantity) {
      setIssuanceSubmitError(`Enter a whole quantity from 1 to ${invalidQuantity.stock.availableQuantity} for ${invalidQuantity.stock.itemCode}.`)
      return
    }

    setIsSubmittingIssuance(true)
    setIssuanceSubmitError('')
    try {
      const batch = await createEmployeeIssuanceBatch(
        selectedEmployee.id,
        requestedItems.map(({ stock, quantity }) => ({ itemId: stock.id, quantity })),
        issuanceNotes,
      )
      const requestedAt = new Date(batch.requestedAt)
      const requestDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
        .format(Number.isNaN(requestedAt.getTime()) ? new Date() : requestedAt)
      const newHistoryEntries: EmployeeHistoryLog[] = batch.items.map((item) => ({
        date: requestDate,
        event: 'Pending Approval',
        item: item.itemName,
        code: item.itemCode,
        quantity: item.quantity,
        unitOfMeasure: item.unitOfMeasure,
        note: `Batch approval request sent to ${batch.employeeEmail}.`,
      }))
      const batchItemsById = new Map(batch.items.map((item) => [item.itemId, item]))

      setEmployees((current) => current.map((employee) => employee.id === selectedEmployee.id
        ? { ...employee, history: [...newHistoryEntries, ...employee.history] }
        : employee
      ))
      setSelectedEmployee((current) => current?.id === selectedEmployee.id
        ? { ...current, history: [...newHistoryEntries, ...current.history] }
        : current
      )
      setAvailableInventoryStock((current) => current.flatMap((item) => {
        const requested = batchItemsById.get(item.id)
        if (!requested) return [item]
        return requested.availableQuantity > 0
          ? [{ ...item, availableQuantity: requested.availableQuantity, status: 'Available' }]
          : []
      }))
      resetIssuanceForm()
      setShowIssuanceModal(false)
      alert(`One approval email listing all ${batch.items.length} selected item${batch.items.length === 1 ? '' : 's'} (${selectedUnitCount} unit${selectedUnitCount === 1 ? '' : 's'}) was sent to ${batch.employeeEmail}. All requested quantities remain pending until the employee approves or rejects the batch.`)
    } catch (error) {
      setIssuanceSubmitError(error instanceof Error ? error.message : 'Unable to send the issuance batch approval request.')
    } finally {
      setIsSubmittingIssuance(false)
    }
  }

  const filteredAvailableInventoryStock = availableInventoryStock.filter((item) => {
    const query = inventorySearchQuery.trim().toLowerCase()
    return !query || `${item.itemCode} ${item.description}`.toLowerCase().includes(query)
  })
  const selectedInventoryItems = selectedAssetCodes.flatMap((code) => {
    const item = availableInventoryStock.find((stock) => stock.itemCode === code)
    return item ? [item] : []
  })
  const selectedUnitCount = selectedInventoryItems.reduce(
    (total, item) => total + (Number(selectedAssetQuantities[item.itemCode]) || 0),
    0,
  )

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

        {/* WORKSPACE NAVIGATION TABS - SWAPPED POSITION */}
        <div className="relative mt-6 flex gap-2 border-t border-blue-400/20 pt-4">
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
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'directory'
                ? 'bg-white text-blue-950 shadow-md'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            + Master Employee Directory ({employees.length})
          </button>
        </div>
      </section>

      {employeeDataError && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {employeeDataError}
        </p>
      )}

      {/* TAB 1: ADD EMPLOYEE FORM SECTION (SWAPPED CONTAINER POSITION TO TOP) */}
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

          {employeeSaveError && (
            <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {employeeSaveError}
            </p>
          )}

          {/* FIELDS IN REVERSE ORDER */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Department</span>
              <select
                name="department"
                value={formData.department}
                onChange={handleInputChange}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>

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
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={handleSaveEmployee}
              className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700 shadow-sm shadow-blue-600/20"
            >
              Save Employee
            </button>
            <button
              type="button"
              onClick={handleClearForm}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Clear form
            </button>
          </div>
        </section>
      )}

      {/* SEARCH AND FILTER CONTROL SECTION (SWAPPED CONTAINER POSITION TO BOTTOM) */}
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
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
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

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

      {/* MODAL FOR CREATING & MANAGING DEPARTMENTS (EDITABLE LIKE ITEMS MASTER DATA) */}
      {showDepartmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Manage Departments</h3>
            <p className="mt-1 text-xs text-slate-500">
              Add new department profiles, rename existing ones with a reason, or delete unused entries.
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
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
                >
                  Add Department
                </button>
              </div>
            </form>

            {departmentManagerError && (
              <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {departmentManagerError}
              </p>
            )}

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Existing Departments</h4>
              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                {departments.map((dept) => (
                  <div key={dept.id} className="rounded-xl border border-slate-100 p-3">
                    {editingDeptId === dept.id ? (
                      <form onSubmit={(e) => handleRenameDepartment(e, dept)} className="space-y-2">
                        <label className="block">
                          <span className="mb-1 block text-[0.62rem] font-bold text-slate-500">Updated department name</span>
                          <input
                            type="text"
                            required
                            value={editingDeptName}
                            onChange={(e) => setEditingDeptName(e.target.value)}
                            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[0.62rem] font-bold text-slate-500">
                            Why are you changing this information? (Required)
                          </span>
                          <textarea
                            required
                            value={editingDeptReason}
                            onChange={(e) => setEditingDeptReason(e.target.value)}
                            placeholder="Why does this department name need to change?"
                            className="min-h-16 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeptId(null)
                              setDepartmentManagerError('')
                            }}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white"
                          >
                            Save Name
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">{dept.name}</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeptId(dept.id)
                              setEditingDeptName(dept.name)
                              setEditingDeptReason('')
                              setDepartmentManagerError('')
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[0.65rem] font-bold text-blue-700"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            disabled={departments.length <= 1}
                            onClick={() => {
                              setDeptToDelete(dept)
                              setDeptDeleteReason('')
                              setDepartmentManagerError('')
                            }}
                            className="rounded-lg border border-rose-100 px-2.5 py-1.5 text-[0.65rem] font-bold text-rose-600 disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDepartmentModal(false)
                  setDepartmentManagerError('')
                  setEditingDeptId(null)
                }}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR CONFIRMING DEPARTMENT DELETION */}
      {deptToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleDeleteDepartment} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Delete “{deptToDelete.name}”?</h3>
            <p className="mt-1 text-xs text-slate-500">
              Employees assigned to this department will be moved to a default department profile.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">
                Why are you changing this information? (Required)
              </span>
              <textarea
                required
                value={deptDeleteReason}
                onChange={(e) => setDeptDeleteReason(e.target.value)}
                placeholder="Reason for deleting this department"
                className="min-h-20 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            {departmentManagerError && (
              <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {departmentManagerError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeptToDelete(null)
                  setDepartmentManagerError('')
                }}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-extrabold text-white"
              >
                Delete Department
              </button>
            </div>
          </form>
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
            {isLoadingEmployees ? 'Loading employee directory…' : `${filteredEmployees.length} employee(s) found`}
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
                  onClick={() => handleOpenEmployeeProfile(emp)}
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
                    No employees match the selected filters.
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
                <p className="mt-1 text-xs font-bold text-blue-700">{selectedEmployee.assigned} unit(s) active</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Employment Status</span>
                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold ${selectedEmployee.statusTone}`}>
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
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Currently Issued Items
                  </h4>
                  <p className="text-[0.68rem] text-slate-400">List of equipment and assets assigned to this employee.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setShowAllIssuedItems(true)}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-100"
                  >
                    View All Issued Items
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetIssuanceForm()
                      setInventoryLoadError('')
                      setShowIssuanceModal(true)
                      setIsLoadingInventory(true)
                      void listInventoryItems()
                        .then((items) => {
                          setAvailableInventoryStock(items.filter((item) => item.status.toLowerCase() === 'available' && item.availableQuantity > 0))
                          setInventoryLoadError('')
                        })
                        .catch((error: unknown) => {
                          setInventoryLoadError(error instanceof Error ? error.message : 'Unable to load available inventory items.')
                        })
                        .finally(() => setIsLoadingInventory(false))
                    }}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
                  >
                    + Add New Issuance
                  </button>
                </div>
              </div>

              {/* Table of Issued Items */}
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[0.6rem] font-extrabold uppercase text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5">Asset Code</th>
                      <th className="px-3.5 py-2.5">Item Name</th>
                      <th className="px-3.5 py-2.5">Quantity</th>
                      <th className="px-3.5 py-2.5">Condition</th>
                      <th className="px-3.5 py-2.5">Assigned Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEmployee.assignedItems.slice(0, 2).map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-3.5 py-2.5 font-bold text-slate-500">{item.code}</td>
                        <td className="px-3.5 py-2.5 font-extrabold text-slate-800">{item.name}</td>
                        <td className="px-3.5 py-2.5 font-bold text-slate-600">{item.quantity} {item.unitOfMeasure}</td>
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
                        <td colSpan={5} className="px-3.5 py-4 text-center text-slate-400 italic">
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
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Employee History
                </h4>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => {
                    setHistoryDialogTab('issuance')
                    setShowEmployeeHistoryModal(true)
                  }}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[0.65rem] font-extrabold text-slate-600 transition hover:bg-slate-50"
                >
                  View History
                </button>
              </div>
              <p className="mt-0.5 text-[0.68rem] text-slate-400">View issuance, return, and profile change records.</p>

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

            {/* Modal Footer with Edit Profile and Handle Issuance */}
            <div className="mt-6 flex justify-between items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={beginEditSelectedEmployee}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-100"
                >
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const firstIssuedItem = selectedEmployee.assignedItems[0]
                    setSelectedReturnIssuanceId(firstIssuedItem?.id || '')
                    setReturnQuantity(String(firstIssuedItem?.quantity || 1))
                    setReturnCondition(returnConditionForInspection(firstIssuedItem?.condition))
                    setReturnPriority('High')
                    setSurrenderReason('')
                    setReturnSubmitError('')
                    setShowHandleIssuanceModal(true)
                  }}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-extrabold text-amber-800 hover:bg-amber-100"
                >
                  Handle Issuance (Surrender/Return)
                </button>
              </div>
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

      {showAllIssuedItems && selectedEmployee && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="issued-items-dialog-title"
            className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
              <div>
                <h3 id="issued-items-dialog-title" className="text-base font-black text-slate-900">
                  Issued Items
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedEmployee.firstName} {selectedEmployee.lastName} · {selectedEmployee.id}
                </p>
                <p className="mt-1 text-[0.68rem] text-slate-400">
                  {selectedEmployee.assigned} active unit(s) assigned to this employee.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllIssuedItems(false)}
                className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-6">
              {selectedEmployee.assignedItems.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full min-w-155 text-left text-xs">
                    <thead className="bg-slate-50 text-[0.6rem] font-extrabold uppercase text-slate-400">
                      <tr>
                        <th className="px-3.5 py-3">Asset Code</th>
                        <th className="px-3.5 py-3">Item Name</th>
                        <th className="px-3.5 py-3">Quantity</th>
                        <th className="px-3.5 py-3">Condition</th>
                        <th className="px-3.5 py-3">Assigned Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEmployee.assignedItems.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-3.5 py-3 font-bold text-slate-600">{item.code}</td>
                          <td className="px-3.5 py-3 font-extrabold text-slate-800">{item.name}</td>
                          <td className="px-3.5 py-3 font-bold text-slate-600">{item.quantity} {item.unitOfMeasure}</td>
                          <td className="px-3.5 py-3">
                            <span className={`rounded-md px-2 py-0.5 text-[0.6rem] font-extrabold ${item.tone}`}>
                              {item.condition}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 font-medium text-slate-500">{item.assignedOn}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs font-medium text-slate-400">
                  No items currently issued to this employee.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {showEmployeeHistoryModal && selectedEmployee && (
        <div className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-history-dialog-title"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
              <div>
                <h3 id="employee-history-dialog-title" className="text-base font-black text-slate-900">
                  Employee History
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedEmployee.firstName} {selectedEmployee.lastName} · {selectedEmployee.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEmployeeHistoryModal(false)}
                className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 sm:px-6">
              <button
                type="button"
                aria-pressed={historyDialogTab === 'issuance'}
                onClick={() => setHistoryDialogTab('issuance')}
                className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${historyDialogTab === 'issuance' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Issuance & Return History
              </button>
              <button
                type="button"
                aria-pressed={historyDialogTab === 'profile'}
                onClick={() => setHistoryDialogTab('profile')}
                className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${historyDialogTab === 'profile' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Profile Change History
              </button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-6">
              {historyDialogTab === 'issuance' ? (
                selectedEmployee.history.length > 0 ? (
                  <div className="space-y-2">
                    {selectedEmployee.history.map((log, idx) => (
                      <div key={`${log.code}-${log.date}-${idx}`} className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
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
                          <p className="mt-1 text-[0.68rem] text-slate-500">{log.note}</p>
                        </div>
                        <span className="shrink-0 text-[0.62rem] font-bold text-slate-400">{log.date}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs font-medium text-slate-400">
                    No transaction history recorded yet.
                  </p>
                )
              ) : selectedEmployee.changeHistory && selectedEmployee.changeHistory.length > 0 ? (
                <div className="space-y-2">
                  {selectedEmployee.changeHistory.map((change, idx) => (
                    <div key={`${change.changedAt}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                      <p className="text-xs font-semibold text-slate-700">{change.reason}</p>
                      <p className="mt-1 text-[0.62rem] font-bold text-slate-400">
                        By {change.changedBy || 'Unknown user'} · {change.changedAt}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs font-medium text-slate-400">
                  No profile changes recorded yet.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* HANDLE ISSUANCE / SURRENDER MODAL */}
      {showHandleIssuanceModal && selectedEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Handle Issuance Surrender / Return</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Process item return for <span className="font-bold text-blue-700">{selectedEmployee.firstName} {selectedEmployee.lastName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHandleIssuanceModal(false)}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmSurrender} className="mt-4 space-y-3">
              {selectedEmployee.assignedItems.length > 0 ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">
                      Select Currently Issued Item to Return
                    </span>
                    <select
                      required
                      value={selectedReturnIssuanceId}
                      onChange={(e) => {
                        const nextId = e.target.value
                        setSelectedReturnIssuanceId(nextId)
                        const nextItem = selectedEmployee.assignedItems.find((item) => item.id === nextId)
                        if (nextItem) {
                          setReturnQuantity(String(nextItem.quantity))
                          setReturnCondition(returnConditionForInspection(nextItem.condition))
                        }
                        setReturnPriority('High')
                      }}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    >
                      {selectedEmployee.assignedItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} — {item.name} · {item.quantity} {item.unitOfMeasure} ({item.condition})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">
                      Quantity to Surrender / Return
                    </span>
                    <input
                      type="number"
                      required
                      min={1}
                      max={selectedEmployee.assignedItems.find((item) => item.id === selectedReturnIssuanceId)?.quantity ?? 1}
                      step={1}
                      value={returnQuantity}
                      onChange={(e) => setReturnQuantity(e.target.value)}
                      disabled={isSubmittingReturn}
                      aria-label="Quantity to surrender or return"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
                    />
                    <span className="mt-1 block text-[0.62rem] font-medium text-slate-400">
                      Enter a whole number up to the currently assigned quantity.
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">
                      Condition After GSO Inspection
                    </span>
                    <select
                      required
                      value={returnCondition}
                      onChange={(e) => {
                        const nextCondition = e.target.value
                        setReturnCondition(nextCondition)
                        if (nextCondition !== 'Needs Repair') setReturnPriority('High')
                      }}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    >
                      {returnConditionOptions.map((condition) => (
                        <option key={condition} value={condition}>{condition}</option>
                      ))}
                    </select>
                  </label>

                  {returnCondition === 'Needs Repair' && (
                    <label className="block">
                      <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">
                        Repair Priority
                      </span>
                      <select
                        required
                        value={returnPriority}
                        onChange={(e) => setReturnPriority(e.target.value as 'High' | 'Medium')}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="High">High Priority</option>
                        <option value="Medium">Medium Priority</option>
                      </select>
                    </label>
                  )}

                  <label className="block">
                    <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">
                      Surrender / Return Reason or Notes
                    </span>
                    <textarea
                      required
                      maxLength={returnCondition === 'Needs Repair' ? 976 : 1000}
                      value={surrenderReason}
                      onChange={(e) => setSurrenderReason(e.target.value)}
                      placeholder="e.g. Returned item due to clearance or department transfer."
                      className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>

                  {returnSubmitError && (
                    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      {returnSubmitError}
                    </p>
                  )}

                  <div className="mt-5 flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowHandleIssuanceModal(false)}
                      disabled={isSubmittingReturn}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingReturn}
                      className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-extrabold text-white transition hover:bg-amber-700 shadow-md shadow-amber-600/20 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isSubmittingReturn ? 'Processing Return…' : 'Confirm Return'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-xs font-semibold text-slate-500">
                    This employee currently has no active issued items to surrender.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowHandleIssuanceModal(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* EDIT EMPLOYEE PROFILE MODAL */}
      {showEmployeeEditModal && selectedEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleUpdateSelectedEmployee}
            className="my-6 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">Edit Employee Profile</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedEmployee.id} · {selectedEmployee.firstName} {selectedEmployee.lastName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEmployeeEditModal(false)
                  setEmployeeEditError('')
                }}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {employeeEditError && (
              <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {employeeEditError}
              </p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Employee Code</span>
                <input
                  type="text"
                  name="empCode"
                  required
                  value={editEmployeeData.empCode}
                  onChange={handleEditEmployeeInputChange}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Department</span>
                <select
                  name="department"
                  value={editEmployeeData.department}
                  onChange={handleEditEmployeeInputChange}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">First Name</span>
                <input
                  type="text"
                  name="firstName"
                  required
                  value={editEmployeeData.firstName}
                  onChange={handleEditEmployeeInputChange}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Last Name</span>
                <input
                  type="text"
                  name="lastName"
                  required
                  value={editEmployeeData.lastName}
                  onChange={handleEditEmployeeInputChange}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Position</span>
                <input
                  type="text"
                  name="position"
                  value={editEmployeeData.position}
                  onChange={handleEditEmployeeInputChange}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Email</span>
                <input
                  type="email"
                  name="email"
                  value={editEmployeeData.email}
                  onChange={handleEditEmployeeInputChange}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Status</span>
                <select
                  name="status"
                  value={editEmployeeData.status}
                  onChange={handleEditEmployeeInputChange}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">
                  Why are you changing this information? (Required)
                </span>
                <textarea
                  name="reason"
                  required
                  value={editEmployeeData.reason}
                  onChange={handleEditEmployeeInputChange}
                  placeholder="For example: Employee transferred to another department."
                  className="min-h-24 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowEmployeeEditModal(false)
                  setEmployeeEditError('')
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MULTI-ITEM ISSUANCE MODAL */}
      {showIssuanceModal && selectedEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm overscroll-contain">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">{issuanceSelectionMode === 'single' ? 'Issue One Item' : 'Issue Multiple Items'}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Issue items to <span className="font-bold text-blue-700">{selectedEmployee.firstName} {selectedEmployee.lastName}</span> ({selectedEmployee.id})
                </p>
                <p className="mt-1 text-[0.68rem] text-slate-400">
                  {issuanceSelectionMode === 'single'
                    ? 'Select one item to send an approval request.'
                    : 'All selected items will be listed in one approval email to this employee.'}
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmittingIssuance}
                onClick={() => {
                  resetIssuanceForm()
                  setShowIssuanceModal(false)
                }}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddIssuanceSubmit} className="mt-4 space-y-3">
              {issuanceSubmitError && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {issuanceSubmitError}
                </p>
              )}
              <div>
                <span className="mb-1 block text-[0.65rem] font-extrabold uppercase text-slate-600">Issuance Mode</span>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Issuance mode">
                  <button
                    type="button"
                    aria-pressed={issuanceSelectionMode === 'single'}
                    disabled={isSubmittingIssuance}
                    onClick={() => {
                      setIssuanceSelectionMode('single')
                      const firstSelected = selectedAssetCodes.slice(0, 1)
                      setSelectedAssetCodes(firstSelected)
                      setSelectedAssetQuantities((current) => firstSelected.length > 0
                        ? { [firstSelected[0]]: current[firstSelected[0]] || '1' }
                        : {}
                      )
                      setIssuanceSubmitError('')
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${issuanceSelectionMode === 'single' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    One item
                  </button>
                  <button
                    type="button"
                    aria-pressed={issuanceSelectionMode === 'multiple'}
                    disabled={isSubmittingIssuance}
                    onClick={() => {
                      setIssuanceSelectionMode('multiple')
                      setIssuanceSubmitError('')
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${issuanceSelectionMode === 'multiple' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    Select multiple items
                  </button>
                </div>
              </div>
              {/* SELECT AVAILABLE INVENTORY ITEM DROPDOWN */}
              <div className="block">
                <label htmlFor="available-inventory-search" className="mb-1 block text-[0.65rem] font-extrabold uppercase text-blue-700">
                  {issuanceSelectionMode === 'single' ? 'Select an Available Asset / Item from Inventory' : 'Select Available Assets / Items from Inventory'}
                </label>
                <div
                  className="relative"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setIsInventoryDropdownOpen(false)
                      setInventorySearchQuery('')
                    }
                  }}
                >
                  <input
                    id="available-inventory-search"
                    type="search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isInventoryDropdownOpen}
                    aria-controls="available-inventory-options"
                    autoComplete="off"
                    value={isInventoryDropdownOpen
                      ? inventorySearchQuery
                      : selectedAssetCodes.length > 0
                        ? `${selectedAssetCodes.length} ${selectedAssetCodes.length === 1 ? 'item' : 'items'} selected · ${selectedUnitCount} ${selectedUnitCount === 1 ? 'unit' : 'units'}`
                        : ''}
                    onFocus={() => {
                      setIsInventoryDropdownOpen(true)
                      setInventorySearchQuery('')
                    }}
                    onChange={(e) => {
                      setInventorySearchQuery(e.target.value)
                      setIsInventoryDropdownOpen(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsInventoryDropdownOpen(false)
                        setInventorySearchQuery('')
                      }
                    }}
                    placeholder="Search by item name or asset code"
                    className={`h-10 w-full border border-slate-200 bg-white px-3.5 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isInventoryDropdownOpen ? 'rounded-t-xl rounded-b-none border-blue-300' : 'rounded-xl'}`}
                  />
                  {isInventoryDropdownOpen && (
                    <div
                      id="available-inventory-options"
                      role="listbox"
                      aria-label="Available inventory items"
                      className="absolute z-30 max-h-64 w-full overflow-y-auto overscroll-contain rounded-b-xl border border-t-0 border-blue-300 bg-white shadow-lg"
                    >
                      {inventoryLoadError ? (
                        <p role="alert" className="px-3.5 py-3 text-xs font-semibold text-rose-600">{inventoryLoadError}</p>
                      ) : isLoadingInventory ? (
                        <p className="px-3.5 py-3 text-xs font-medium text-slate-500">Loading available inventory...</p>
                      ) : filteredAvailableInventoryStock.length > 0 ? (
                        filteredAvailableInventoryStock.map((stock) => (
                          <button
                            key={stock.id}
                            type="button"
                            role="option"
                            aria-selected={selectedAssetCodes.includes(stock.itemCode)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectInventoryItem(stock.itemCode)}
                            className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5 text-left text-xs transition last:border-b-0 hover:bg-blue-50 ${selectedAssetCodes.includes(stock.itemCode) ? 'bg-blue-50' : ''}`}
                          >
                            <span className="min-w-0 truncate font-semibold text-slate-700">
                              {stock.itemCode} — {stock.description}
                              <span className="mt-1 block text-[0.62rem] font-medium text-slate-400">Available: {stock.availableQuantity} {stock.unitOfMeasure}</span>
                            </span>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[0.62rem] font-bold text-slate-600">
                              {stock.condition}
                            </span>
                            {selectedAssetCodes.includes(stock.itemCode) && (
                              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[0.62rem] font-bold text-blue-700">Selected</span>
                            )}
                          </button>
                        ))
                      ) : availableInventoryStock.length > 0 ? (
                        <p className="px-3.5 py-3 text-xs font-medium text-slate-500">No inventory items match this search.</p>
                      ) : (
                        <p className="px-3.5 py-3 text-xs font-medium text-slate-500">No available items in inventory.</p>
                      )}
                    </div>
                  )}
                </div>
                {issuanceSelectionMode === 'multiple' && (
                  <p className="mt-1.5 text-[0.65rem] font-medium text-slate-500">
                    Click a selected item again to unselect it, or use the Unselect all button below.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3.5 py-2.5">
                  <div>
                    <span className="block text-[0.65rem] font-extrabold uppercase text-slate-700">Selected for issuance</span>
                    <span className="mt-0.5 block text-[0.62rem] font-medium text-slate-500">Review quantities and unselect items before sending.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[0.62rem] font-extrabold text-blue-700">
                      {selectedInventoryItems.length} {selectedInventoryItems.length === 1 ? 'item' : 'items'} · {selectedUnitCount} {selectedUnitCount === 1 ? 'unit' : 'units'}
                    </span>
                    {issuanceSelectionMode === 'multiple' && selectedAssetCodes.length > 0 && (
                      <button
                        type="button"
                        disabled={isSubmittingIssuance}
                        onClick={() => {
                          setSelectedAssetCodes([])
                          setSelectedAssetQuantities({})
                          setIssuanceSubmitError('')
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.62rem] font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      >
                        Unselect all
                      </button>
                    )}
                  </div>
                </div>
                {selectedInventoryItems.length > 0 ? (
                  <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                    {selectedInventoryItems.map((item) => (
                      <li key={item.id} className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 sm:flex-1">
                          <p className="truncate text-xs font-bold text-slate-800">{item.description}</p>
                          <p className="mt-0.5 truncate text-[0.65rem] font-medium text-slate-500">{item.itemCode} · Available: {item.availableQuantity} {item.unitOfMeasure} · Condition: {item.condition}</p>
                        </div>
                        <div className="flex items-end gap-2">
                          <label className="block w-28 shrink-0">
                            <span className="mb-1 block text-[0.58rem] font-bold text-slate-500">Borrow quantity</span>
                            <input
                              type="number"
                              min="1"
                              max={item.availableQuantity}
                              step="1"
                              required
                              disabled={isSubmittingIssuance}
                              value={selectedAssetQuantities[item.itemCode] ?? '1'}
                              onChange={(event) => setSelectedAssetQuantities((current) => ({
                                ...current,
                                [item.itemCode]: event.target.value,
                              }))}
                              aria-label={`Borrow quantity for ${item.description}`}
                              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={isSubmittingIssuance}
                            onClick={() => handleSelectInventoryItem(item.itemCode)}
                            aria-label={`Unselect ${item.description}`}
                            className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-[0.65rem] font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                          >
                            Unselect
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3.5 py-3 text-xs font-medium text-slate-400">
                    {issuanceSelectionMode === 'single' ? 'Choose one item above.' : 'Choose one or more items above.'}
                  </p>
                )}
              </div>

              {/* ISSUANCE NOTES */}
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Issuance Notes</span>
                <input
                  type="text"
                  placeholder="e.g. Acknowledged by employee"
                  value={issuanceNotes}
                  onChange={(e) => setIssuanceNotes(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <div className="mt-5 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingIssuance}
                  onClick={() => {
                    resetIssuanceForm()
                    setShowIssuanceModal(false)
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingIssuance || selectedInventoryItems.length === 0 || selectedInventoryItems.some((item) => {
                    const quantity = Number(selectedAssetQuantities[item.itemCode])
                    return !Number.isInteger(quantity) || quantity < 1 || quantity > item.availableQuantity
                  })}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700 shadow-md shadow-blue-600/20 disabled:cursor-wait disabled:opacity-70"
                >
                  {isSubmittingIssuance
                    ? issuanceSelectionMode === 'single'
                      ? 'Sending approval request...'
                      : `Sending batch (${selectedUnitCount} unit${selectedUnitCount === 1 ? '' : 's'})...`
                    : issuanceSelectionMode === 'single'
                      ? 'Send for approval'
                      : `Send batch for approval (${selectedUnitCount} unit${selectedUnitCount === 1 ? '' : 's'})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </GsoPageFrame>
  )
}
