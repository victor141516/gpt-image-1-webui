import { ref } from 'vue'

export interface ModelInfo {
  value: string
  label: string
  description: string
}

const IMAGE_DESCRIPTIONS: Record<string, string> = {
  'gpt-image-2.6-sunburst': 'Image generation and editing for detailed visual work.',
  'gpt-image-2.6-flare': 'Image generation and editing for fast iteration.',
  'gpt-image-2.5-sunburst':
    'Most capable model for image generation and editing. Supports xhigh/max quality and markup.',
  'gpt-image-2.5-flare': 'Fastest model for high-quality, everyday image generation.',
  'gpt-image-2': 'Fast, high-quality generation and editing with flexible image sizes.',
  'gpt-image-1.5': 'Previous image generation model. Supports input fidelity.',
  'gpt-image-1-mini': 'Cost-efficient version of GPT Image 1.',
  'chatgpt-image-latest': 'Previous image model used in ChatGPT.',
}

const FALLBACK_IMAGE_MODELS = Object.keys(IMAGE_DESCRIPTIONS)
const FALLBACK_CHAT_MODELS = [
  'gpt-6.1-terra',
  'gpt-6.1-sol',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4-mini',
]

const IMAGE_CACHE_KEY = 'image-models-cache'
const CHAT_CACHE_KEY = 'chat-models-cache'

const splitSnapshot = (id: string): [string, string] => {
  const match = /^(.+)-(\d{4}-\d{2}-\d{2})$/.exec(id)
  return match?.[1] && match[2] ? [match[1], match[2]] : [id, '']
}

const version = (id: string) => {
  const match = /(\d+(?:\.\d+)?)/.exec(id)
  return match?.[1] ? parseFloat(match[1]) : -1
}

const byVersionDesc = (a: string, b: string) => {
  const [baseA, dateA] = splitSnapshot(a)
  const [baseB, dateB] = splitSnapshot(b)
  return (
    version(baseB) - version(baseA) ||
    baseA.localeCompare(baseB) ||
    (dateA ? 1 : 0) - (dateB ? 1 : 0) ||
    dateB.localeCompare(dateA)
  )
}

function describeImageModel(id: string): ModelInfo {
  const [base, date] = splitSnapshot(id)
  const label = base
    .replace(/^gpt-image/, 'GPT Image')
    .replace(/^chatgpt-image/, 'ChatGPT Image')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return {
    value: id,
    label: date ? `${label} (${date})` : label,
    description:
      IMAGE_DESCRIPTIONS[base] ?? (date ? `Pinned ${date} snapshot of ${base}.` : 'OpenAI image model.'),
  }
}

function readCache(key: string): string[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Array.isArray(parsed?.ids) && parsed.ids.length && parsed.ids.every((x: unknown) => typeof x === 'string')) {
      return parsed.ids
    }
  } catch {
    // ignore corrupt cache
  }
  return null
}

const sortUnique = (ids: string[]) => [...new Set(ids)].sort(byVersionDesc)

export const imageModels = ref<ModelInfo[]>(sortUnique(readCache(IMAGE_CACHE_KEY) ?? FALLBACK_IMAGE_MODELS).map(describeImageModel))
export const chatModels = ref<string[]>(sortUnique(readCache(CHAT_CACHE_KEY) ?? FALLBACK_CHAT_MODELS))
export const modelsError = ref<string | null>(null)

const IMAGE_RE = /^(gpt-image|chatgpt-image)/
const NON_CHAT_RE =
  /(image|audio|realtime|transcribe|tts|embedding|moderation|whisper|live|translate|search|dall-e|babbage|davinci|instruct|sora|codex|cyber|rosalind)/

let generation = 0

export async function refreshModels(apiKey: string, baseURL: string) {
  const current = ++generation
  try {
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json()
    if (current !== generation) return
    const now = Date.now()
    const ids: string[] = (Array.isArray(body?.data) ? body.data : [])
      .filter(
        (m: { id?: unknown; shutdown_date?: string }) =>
          typeof m?.id === 'string' && !(m.shutdown_date && Date.parse(m.shutdown_date) <= now),
      )
      .map((m: { id: string }) => m.id)
    const image = ids.filter((id) => IMAGE_RE.test(id))
    const chat = ids.filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !NON_CHAT_RE.test(id))
    const fetchedAt = new Date(now).toISOString()
    if (image.length) {
      imageModels.value = sortUnique(image).map(describeImageModel)
      localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify({ fetchedAt, ids: image }))
    }
    if (chat.length) {
      chatModels.value = sortUnique(chat)
      localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify({ fetchedAt, ids: chat }))
    }
    modelsError.value = null
  } catch (error) {
    if (current === generation) modelsError.value = `Could not refresh models: ${String(error)}`
  }
}

export function imageModelInfo(id: string): ModelInfo {
  return imageModels.value.find((m) => m.value === id) ?? describeImageModel(id)
}
