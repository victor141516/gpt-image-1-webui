export const FORMAT_MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

export function readAsDataUrl(blob: Blob): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>()
  const reader = new FileReader()
  reader.onload = () =>
    typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read file.'))
  reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'))
  reader.readAsDataURL(blob)
  return promise
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>()
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('Could not decode image.'))
  img.src = src
  return promise
}

export async function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(dataUrl)
  return { width: img.naturalWidth, height: img.naturalHeight }
}

/** Splits a data URL into media type and base64 payload. */
export function splitDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:([^;,]+)(?:;[^,]*)?,(.*)$/s.exec(dataUrl)
  if (!match?.[1] || match[2] === undefined) throw new Error('Invalid data URL.')
  return { mediaType: match[1], base64: match[2] }
}

/** Renders any browser-decodable image (incl. SVG) to a PNG data URL. */
export async function rasterizeToPng(dataUrl: string, maxEdge = 2048): Promise<string> {
  const img = await loadImage(dataUrl)
  const width = img.naturalWidth || 1024
  const height = img.naturalHeight || 1024
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/** Raster formats both the Images API and vision models accept; GIF and SVG are converted to PNG. */
const PORTABLE_TYPES: Record<string, true> = { 'image/png': true, 'image/jpeg': true, 'image/webp': true }

export async function toApiInput(dataUrl: string, mediaType: string): Promise<string> {
  return PORTABLE_TYPES[mediaType] ? dataUrl : rasterizeToPng(dataUrl, 4096)
}

export async function toVisionInput(dataUrl: string, mediaType: string) {
  const url = PORTABLE_TYPES[mediaType] ? dataUrl : await rasterizeToPng(dataUrl)
  return splitDataUrl(url)
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function extensionFor(mediaType: string) {
  return Object.entries(FORMAT_MEDIA_TYPES).find(([, type]) => type === mediaType)?.[0] ?? 'png'
}
