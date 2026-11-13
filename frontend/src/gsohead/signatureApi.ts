import { apiRequest } from '../auth/authApi'

export type HeadSignature = {
  width: number
  height: number
  updatedAt: string
  imageDataUrl: string
}

// The signed-in GSO Head's own signature. Other accounts cannot read or change it.
export async function getMySignature() {
  const result = await apiRequest<{ signature: HeadSignature | null }>('/signatures/me')
  return result.signature
}

export async function saveMySignature(imageDataUrl: string) {
  const result = await apiRequest<{ signature: HeadSignature }>('/signatures/me', {
    method: 'PUT',
    body: JSON.stringify({ imageBase64: imageDataUrl }),
  })
  return result.signature
}
