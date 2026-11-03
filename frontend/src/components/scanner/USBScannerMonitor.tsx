import { useCallback, useEffect, useRef, useState } from 'react'
import { addGsoNotification } from '../../gso/notificationStore'

type HidDeviceLike = {
  productName: string
  vendorId: number
  productId: number
}

type HidConnectionEvent = Event & { device?: HidDeviceLike }

type HidApiLike = {
  getDevices: () => Promise<HidDeviceLike[]>
  requestDevice: (options: { filters: Array<Record<string, number>> }) => Promise<HidDeviceLike[]>
  addEventListener: (type: 'connect' | 'disconnect', listener: EventListener) => void
  removeEventListener: (type: 'connect' | 'disconnect', listener: EventListener) => void
}

type StoredScanner = {
  key: string
  name: string
  vendorId: number
  productId: number
}

type ScannerToast = {
  connected: boolean
  title: string
  message: string
}

const selectedScannerStorageKey = 'asset-usb-scanner-selected-v1'
const scannerTransitionStorageKey = 'asset-usb-scanner-transition-v1'

function scannerKey(device: HidDeviceLike) {
  return `${device.vendorId}:${device.productId}:${device.productName}`
}

function readSelectedScanner(): StoredScanner | null {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(selectedScannerStorageKey) || 'null')
    if (!stored || typeof stored !== 'object') return null
    const scanner = stored as Partial<StoredScanner>
    if (typeof scanner.key !== 'string' || typeof scanner.name !== 'string'
      || typeof scanner.vendorId !== 'number' || typeof scanner.productId !== 'number') return null
    return scanner as StoredScanner
  } catch {
    return null
  }
}

function shouldPublishConnectionNotification(connected: boolean) {
  const now = Date.now()
  try {
    const previous: unknown = JSON.parse(window.localStorage.getItem(scannerTransitionStorageKey) || 'null')
    if (previous && typeof previous === 'object') {
      const transition = previous as { connected?: unknown; at?: unknown }
      if (transition.connected === connected && typeof transition.at === 'number' && now - transition.at < 5000) {
        return false
      }
    }
    window.localStorage.setItem(scannerTransitionStorageKey, JSON.stringify({ connected, at: now }))
  } catch {
    // Keep showing the popup when storage is unavailable.
  }
  return true
}

function getHidApi() {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { hid?: HidApiLike }).hid
}

export default function USBScannerMonitor() {
  const [selectedScanner, setSelectedScanner] = useState<StoredScanner | null>(() => (
    typeof window === 'undefined' ? null : readSelectedScanner()
  ))
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown')
  const [isSelecting, setIsSelecting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<ScannerToast | null>(null)
  const selectedScannerRef = useRef<StoredScanner | null>(selectedScanner)
  const lastToastRef = useRef<{ connected: boolean; at: number } | null>(null)
  const hidAvailable = Boolean(getHidApi())
  const scannerName = selectedScanner?.name || ''

  const reportConnection = useCallback((device: HidDeviceLike, connected: boolean) => {
    const selectedScanner = selectedScannerRef.current
    if (!selectedScanner || selectedScanner.key !== scannerKey(device)) return

    const now = Date.now()
    setConnection(connected ? 'connected' : 'disconnected')
    const deviceName = device.productName || selectedScanner.name || 'USB HID scanner'
    setSelectedScanner((current) => current?.key === selectedScanner.key
      ? { ...current, name: deviceName }
      : current)

    const previousToast = lastToastRef.current
    if (!previousToast || previousToast.connected !== connected || now - previousToast.at > 1800) {
      setToast({
        connected,
        title: connected ? 'HID device connected' : 'HID device unplugged',
        message: connected
          ? `${deviceName} is connected. This does not confirm it is the barcode scanner; scan a valid asset label to verify.`
          : `${deviceName} was unplugged. Check whether this was the barcode scanner or another HID device.`,
      })
      lastToastRef.current = { connected, at: now }
    }

    if (shouldPublishConnectionNotification(connected)) {
      addGsoNotification({
        module: 'System',
        title: connected ? 'HID device connected' : 'HID device unplugged',
        message: connected
          ? `${deviceName} was connected to the GSO workstation. Scan an asset label to confirm it is the barcode scanner.`
          : `${deviceName} was disconnected from the GSO workstation. Confirm whether it was the barcode scanner.`,
        actionLabel: 'View notifications',
        href: '/gso/notifications',
      })
    }
  }, [])

  useEffect(() => {
    const hid = getHidApi()
    if (!hid) return

    let active = true
    const initialScanner = selectedScannerRef.current

    const handleConnect: EventListener = (event) => {
      const device = (event as HidConnectionEvent).device
      if (device) reportConnection(device, true)
    }
    const handleDisconnect: EventListener = (event) => {
      const device = (event as HidConnectionEvent).device
      if (device) reportConnection(device, false)
    }
    const handleSelectedScannerChange: EventListener = (event) => {
      const storageEvent = event as StorageEvent
      if (storageEvent.key !== selectedScannerStorageKey) return
      const nextScanner = readSelectedScanner()
      selectedScannerRef.current = nextScanner
      setSelectedScanner(nextScanner)
      if (!nextScanner) {
        setConnection('unknown')
        return
      }
      void hid.getDevices().then((devices) => {
        if (!active) return
        const connectedDevice = devices.find((device) => scannerKey(device) === nextScanner.key)
        setConnection(connectedDevice ? 'connected' : 'disconnected')
        if (connectedDevice?.productName && connectedDevice.productName !== nextScanner.name) {
          const refreshedScanner = { ...nextScanner, name: connectedDevice.productName }
          selectedScannerRef.current = refreshedScanner
          setSelectedScanner(refreshedScanner)
        }
      }).catch(() => {
        if (active) setConnection('disconnected')
      })
    }

    hid.addEventListener('connect', handleConnect)
    hid.addEventListener('disconnect', handleDisconnect)
    window.addEventListener('storage', handleSelectedScannerChange)

    void hid.getDevices().then((devices) => {
      if (!active || !initialScanner) return
      const connectedDevice = devices.find((device) => scannerKey(device) === initialScanner.key)
      setConnection(connectedDevice ? 'connected' : 'disconnected')
    }).catch(() => {
      if (active && initialScanner) setConnection('disconnected')
    })

    return () => {
      active = false
      hid.removeEventListener('connect', handleConnect)
      hid.removeEventListener('disconnect', handleDisconnect)
      window.removeEventListener('storage', handleSelectedScannerChange)
    }
  }, [reportConnection])

  async function selectScanner() {
    const hid = getHidApi()
    if (!hid) {
      setError('Hindi suportado ng browser na ito ang USB device monitoring. Subukan ang Chrome o Edge sa HTTPS o localhost.')
      return
    }

    setIsSelecting(true)
    setError('')
    try {
      const devices = await hid.requestDevice({ filters: [] })
      const device = devices[0]
      if (!device) {
        setError('Walang scanner na napili. Pumili ng device sa browser dialog para masimulan ang test.')
        return
      }

      const selectedScanner: StoredScanner = {
        key: scannerKey(device),
        name: device.productName || `USB scanner ${device.vendorId}:${device.productId}`,
        vendorId: device.vendorId,
        productId: device.productId,
      }
      selectedScannerRef.current = selectedScanner
      setSelectedScanner(selectedScanner)
      try {
        window.localStorage.setItem(selectedScannerStorageKey, JSON.stringify(selectedScanner))
      } catch {
        // The current page can still monitor the selected scanner without storage.
      }
      reportConnection(device, true)
    } catch (reason) {
      const errorName = reason instanceof DOMException ? reason.name : ''
      setError(errorName === 'NotFoundError'
        ? 'Walang compatible na HID scanner na nakita. Maaaring keyboard-style lang ang scanner na ito.'
        : 'Hindi napili ang scanner. Tiyaking pinayagan ito sa browser dialog at subukan ulit.')
    } finally {
      setIsSelecting(false)
    }
  }

  const connectionLabel = connection === 'connected'
    ? `HID connected${scannerName ? `: ${scannerName}` : ''}`
    : connection === 'disconnected'
      ? `HID disconnected${scannerName ? `: ${scannerName}` : ''}`
      : 'Not monitoring'

  return (
    <div className="fixed bottom-4 right-4 z-90 w-[min(22rem,calc(100vw-2rem))] space-y-3 font-['Plus_Jakarta_Sans']">
      {toast && (
        <section
          role="status"
          aria-live="assertive"
          className={`rounded-2xl border p-4 shadow-2xl ${toast.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">{toast.title}</h2>
              <p className="mt-1 text-xs leading-5">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="rounded-lg px-2 py-1 text-xs font-extrabold opacity-70 hover:bg-black/5 hover:opacity-100"
              aria-label="Close scanner notification"
            >
              Close
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black">USB HID connection test</h2>
          <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold ${connection === 'connected' ? 'bg-emerald-100 text-emerald-800' : connection === 'disconnected' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
            {hidAvailable === false ? 'Unsupported' : connection === 'connected' ? 'Connected' : connection === 'disconnected' ? 'Disconnected' : 'Not enabled'}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {!hidAvailable
            ? 'Hindi ma-e-expose ng browser na ito ang plug/unplug events. Gumagana pa rin ang pag-scan bilang keyboard input.'
            : connection === 'connected'
              ? `${connectionLabel}. Hindi pa verified na barcode scanner ito.`
              : connection === 'disconnected'
                ? `${scannerName || 'Selected HID device'} is unplugged. Isaksak ulit para makita kung ito ang scanner.`
                : 'Piliin at payagan ang compatible scanner para makita ang connect at unplug popups.'}
        </p>
        {hidAvailable && (
          <button
            type="button"
            onClick={() => void selectScanner()}
            disabled={isSelecting}
            className="mt-3 w-full rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isSelecting ? 'Waiting for browser…' : selectedScanner ? 'Change scanner' : 'Select scanner'}
          </button>
        )}
        {error && <p role="alert" className="mt-2 text-xs font-semibold leading-5 text-rose-700">{error}</p>}
        <p className="mt-2 text-[0.65rem] leading-4 text-slate-500">Para makumpirma, mag-scan ng totoong AST label sa Returned Items at tingnan kung nawawala ang device kapag tinanggal ang scanner. HID name alone is not proof. Events are saved in GSO Notifications.</p>
      </section>
    </div>
  )
}
