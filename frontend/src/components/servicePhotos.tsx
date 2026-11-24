import { useRef, useState, type ChangeEvent } from 'react'

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

export function PhotoGallery({ photos }: { photos: ServicePhoto[] }) {
  if (photos.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo, index) => (
        <figure key={photo.id} className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
          <img src={photo.dataUrl} alt={SOURCE_LABELS[photo.source] ?? `Photo ${index + 1}`} className="h-44 w-full object-cover" />
          <figcaption className="px-3 py-2 text-sm font-bold text-slate-800">
            {SOURCE_LABELS[photo.source] ?? 'Photo'}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
