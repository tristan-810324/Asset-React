import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'

// Photos on a job / service request. They are sent as small JPEG data URLs (see the backend photo limits).
export type ServicePhoto = {
  id: string
  source: string
  dataUrl: string
  addedBy?: string | null
  createdAt?: string
}

export const MAX_SERVICE_PHOTOS = 3
const MAX_EDGE_PX = 1024
const MAX_DATA_URL_CHARS = 600000

// Resizes a photo before upload, so a phone picture fits the request size limit.
export function compressServicePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, MAX_EDGE_PX / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      if (dataUrl.length > MAX_DATA_URL_CHARS) reject(new Error('One photo is still too large. Try a smaller or closer photo.'))
      else resolve(dataUrl)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('One file is not a readable image. Use a JPG, PNG, or WebP photo.'))
    }
    image.src = url
  })
}

export function PhotoPicker({ photos, onChange, onError, disabled = false }: {
  photos: string[]
  onChange: (photos: string[]) => void
  onError?: (message: string) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(false)
  const remaining = MAX_SERVICE_PHOTOS - photos.length

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, remaining)
    event.target.value = ''
    if (files.length === 0) return
    setAdding(true)
    try {
      const added: string[] = []
      for (const file of files) added.push(await compressServicePhoto(file))
      onChange([...photos, ...added])
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'The photo could not be added.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {photos.map((photo, index) => (
          <div key={`${index}-${photo.length}`} className="relative h-24 w-24 overflow-hidden rounded-xl border-2 border-slate-300 bg-slate-100">
            <img src={photo} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              disabled={disabled || adding}
              onClick={() => onChange(photos.filter((_, photoIndex) => photoIndex !== index))}
              aria-label={`Remove photo ${index + 1}`}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-slate-950/80 text-sm font-black text-white transition hover:bg-slate-950 disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            disabled={disabled || adding}
            onClick={() => inputRef.current?.click()}
            className="grid h-24 w-24 place-items-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50 text-sm font-extrabold text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
          >
            {adding ? 'Adding...' : '+ Add photo'}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      <p className="mt-2 text-sm font-medium text-slate-600">
        Up to {MAX_SERVICE_PHOTOS} photos. Large photos are made smaller automatically.
      </p>
    </div>
  )
}

const SOURCE_LABELS: Record<string, string> = {
  REQUEST: 'Sent with the request',
  REQUESTER_UPDATE: 'Added by the requester',
  STAFF_PROGRESS: 'Staff progress',
  STAFF_COMPLETION: 'Staff at completion',
}

// Photos sit side by side. Pressing one opens it larger in a pop-up.
export function PhotoGallery({ photos }: { photos: ServicePhoto[] }) {
  const [enlarged, setEnlarged] = useState<ServicePhoto | null>(null)
  if (photos.length === 0) return null
  return (
    <>
      <div className="flex flex-wrap gap-3">
        {photos.map((photo, index) => {
          const label = SOURCE_LABELS[photo.source] ?? `Photo ${index + 1}`
          return (
            <figure key={photo.id} className="w-36 overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm sm:w-44">
              <button type="button" onClick={() => setEnlarged(photo)} aria-label={`Open photo: ${label}`} className="block w-full bg-slate-100 outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue-500">
                <img src={photo.dataUrl} alt={label} className="h-32 w-full object-contain sm:h-36" />
              </button>
              <figcaption className="truncate px-2.5 py-2 text-xs font-bold text-slate-800">{label}</figcaption>
            </figure>
          )
        })}
      </div>
      {enlarged && <PhotoPopup photo={enlarged} onClose={() => setEnlarged(null)} />}
    </>
  )
}

// The enlarged photo. Escape, the Close button, or a press outside the picture closes it.
function PhotoPopup({ photo, onClose }: { photo: ServicePhoto; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const label = SOURCE_LABELS[photo.source] ?? 'Photo'
  const when = photo.createdAt ? new Date(photo.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''
  const details = [photo.addedBy, when].filter(Boolean).join(' · ')
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <figure role="dialog" aria-modal="true" aria-label={label} onClick={(event) => event.stopPropagation()} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <img src={photo.dataUrl} alt={label} className="max-h-[70vh] w-full bg-slate-100 object-contain" />
        <figcaption className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-800">{label}</span>
            {details && <span className="block text-xs font-medium text-slate-500">{details}</span>}
          </span>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Close</button>
        </figcaption>
      </figure>
    </div>,
    document.body,
  )
}
