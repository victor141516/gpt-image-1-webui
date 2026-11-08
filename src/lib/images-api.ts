import type { ImagesUsage } from './types'

export interface ImagesRequest {
  endpoint: 'generations' | 'edits'
  body: Record<string, unknown>
  apiKey: string
  baseURL: string
  organization?: string
  project?: string
  signal?: AbortSignal
  /** Called with each streamed partial image (base64, no data: prefix). */
  onPartial?: (b64: string, index: number) => void
}

export interface ImagesResult {
  images: string[]
  usage?: ImagesUsage
  size?: string
  quality?: string
  background?: string
  outputFormat?: string
}

interface ImagesResponseBody {
  data?: Array<{ b64_json?: string }>
  usage?: ImagesUsage
  size?: string
  quality?: string
  background?: string
  output_format?: string
}

interface StreamEvent {
  type?: string
  b64_json?: string
  partial_image_index?: number
  usage?: ImagesUsage
  size?: string
  quality?: string
  background?: string
  output_format?: string
  error?: { message?: string }
}

async function errorMessage(response: Response) {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text)
    if (parsed?.error?.message) return `${response.status}: ${parsed.error.message}`
  } catch {
    // not JSON
  }
  return `${response.status}: ${text || response.statusText}`
}

/** Calls /images/generations or /images/edits, streaming when `body.stream` is true. */
export async function callImagesApi(request: ImagesRequest): Promise<ImagesResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${request.apiKey}`,
  }
  if (request.organization) headers['OpenAI-Organization'] = request.organization
  if (request.project) headers['OpenAI-Project'] = request.project

  const response = await fetch(`${request.baseURL.replace(/\/$/, '')}/images/${request.endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request.body),
    signal: request.signal,
  })
  if (!response.ok) throw new Error(await errorMessage(response))

  if (!request.body.stream) {
    const body = (await response.json()) as ImagesResponseBody
    const images = (body.data ?? []).map((d) => d.b64_json).filter((b): b is string => !!b)
    if (!images.length) throw new Error('The Images API returned no image data.')
    return {
      images,
      usage: body.usage,
      size: body.size,
      quality: body.quality,
      background: body.background,
      outputFormat: body.output_format,
    }
  }

  const result: ImagesResult = { images: [] }
  for await (const event of readServerSentEvents(response)) {
    if (event.type?.endsWith('.partial_image') && event.b64_json) {
      request.onPartial?.(event.b64_json, event.partial_image_index ?? 0)
    } else if (event.type?.endsWith('.completed') && event.b64_json) {
      result.images.push(event.b64_json)
      result.usage = event.usage ?? result.usage
      result.size = event.size ?? result.size
      result.quality = event.quality ?? result.quality
      result.background = event.background ?? result.background
      result.outputFormat = event.output_format ?? result.outputFormat
    } else if (event.type === 'error' || event.error) {
      throw new Error(event.error?.message ?? 'The image stream reported an error.')
    }
  }
  if (!result.images.length) throw new Error('The image stream ended without a final image.')
  return result
}

async function* readServerSentEvents(response: Response): AsyncGenerator<StreamEvent> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (value) buffer += value
    const chunks = buffer.split(/\r?\n\r?\n/)
    buffer = done ? '' : (chunks.pop() ?? '')
    for (const chunk of chunks) {
      const data = chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') continue
      yield JSON.parse(data) as StreamEvent
    }
    if (done) return
  }
}
