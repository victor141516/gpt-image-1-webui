import { useStorage } from '@vueuse/core'

/** Value meaning "let the agent decide per call". */
export const AGENT = 'agent'
/** Value meaning "omit the parameter, use the API default". */
export const DEFAULT = 'default'

export interface Settings {
  // Connection
  baseURL: string
  organization: string
  project: string
  // Agent (orchestrator LLM)
  chatModel: string
  reasoningEffort: string
  reasoningSummary: 'auto' | 'detailed' | 'concise' | 'off'
  textVerbosity: string
  serviceTier: string
  maxSteps: number
  parallelToolCalls: boolean
  agentSeesResults: boolean
  visionDetail: string
  customInstructions: string
  // Images API
  imageModel: string
  size: string
  quality: string
  background: string
  n: string
  outputFormat: string
  outputCompression: number
  moderation: string
  complexity: string
  partialImages: number
  inputFidelity: string
  frameCount: number
  frameDurationMs: number
  svgModel: string
  svgReasoningEffort: string
  safetyIdentifier: string
}

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5-sunburst'
export const DEFAULT_CHAT_MODEL = 'gpt-6.1-terra'

const defaults: Settings = {
  baseURL: 'https://api.openai.com/v1',
  organization: '',
  project: '',
  chatModel: DEFAULT_CHAT_MODEL,
  reasoningEffort: 'low',
  reasoningSummary: 'auto',
  textVerbosity: DEFAULT,
  serviceTier: DEFAULT,
  maxSteps: 12,
  parallelToolCalls: true,
  agentSeesResults: true,
  visionDetail: DEFAULT,
  customInstructions: '',
  imageModel: localStorage.getItem('image-model') ?? DEFAULT_IMAGE_MODEL,
  size: AGENT,
  quality: DEFAULT,
  background: AGENT,
  n: AGENT,
  outputFormat: 'png',
  outputCompression: 100,
  moderation: DEFAULT,
  complexity: DEFAULT,
  partialImages: 2,
  inputFidelity: DEFAULT,
  frameCount: 9,
  frameDurationMs: 200,
  svgModel: '',
  svgReasoningEffort: DEFAULT,
  safetyIdentifier: '',
}

// The API key keeps the storage key used by previous versions of the app.
export const apiKey = useStorage('openai-key', '')
export const settings = useStorage<Settings>('img-studio-settings', defaults, localStorage, {
  mergeDefaults: true,
})

export function resetSettings() {
  settings.value = { ...defaults, imageModel: DEFAULT_IMAGE_MODEL }
}

export interface Option {
  value: string
  label: string
}

const opts = (...values: string[]): Option[] => values.map((value) => ({ value, label: value }))

export const SIZE_PRESETS: Option[] = [
  { value: AGENT, label: 'Agent decides' },
  { value: 'auto', label: 'auto' },
  { value: '1024x1024', label: '1024×1024 (1:1)' },
  { value: '1536x1024', label: '1536×1024 (3:2)' },
  { value: '1024x1536', label: '1024×1536 (2:3)' },
  { value: '1536x864', label: '1536×864 (16:9)' },
  { value: '864x1536', label: '864×1536 (9:16)' },
  { value: '2048x2048', label: '2048×2048 (1:1)' },
  { value: '2560x1440', label: '2560×1440 (16:9)' },
  { value: '1440x2560', label: '1440×2560 (9:16)' },
  { value: '3840x2160', label: '3840×2160 (4K, experimental)' },
  { value: '2160x3840', label: '2160×3840 (4K portrait, experimental)' },
  { value: '256x256', label: '256×256 (legacy)' },
  { value: '512x512', label: '512×512 (legacy)' },
  { value: '1792x1024', label: '1792×1024 (legacy)' },
  { value: '1024x1792', label: '1024×1792 (legacy)' },
]

export const QUALITY_OPTIONS: Option[] = [
  { value: DEFAULT, label: 'API default (auto)' },
  { value: AGENT, label: 'Agent decides' },
  ...opts('auto', 'low', 'medium', 'high', 'xhigh', 'max'),
]

export const BACKGROUND_OPTIONS: Option[] = [
  { value: AGENT, label: 'Agent decides' },
  { value: DEFAULT, label: 'API default (auto)' },
  ...opts('auto', 'opaque', 'transparent'),
]

export const N_OPTIONS: Option[] = [
  { value: AGENT, label: 'Agent decides (1–10)' },
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
]

export const FORMAT_OPTIONS: Option[] = opts('png', 'webp', 'jpeg', 'gif', 'svg')

export const MODERATION_OPTIONS: Option[] = [
  { value: DEFAULT, label: 'API default (auto)' },
  ...opts('auto', 'low'),
]

export const COMPLEXITY_OPTIONS: Option[] = [
  { value: DEFAULT, label: 'Model default' },
  ...opts('low', 'medium', 'high'),
]

export const FIDELITY_OPTIONS: Option[] = [
  { value: DEFAULT, label: 'Omit (required for gpt-image-2+)' },
  ...opts('low', 'high'),
]

export const EFFORT_OPTIONS: Option[] = [
  { value: DEFAULT, label: 'Model default' },
  ...opts('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'),
]

export const SUMMARY_OPTIONS: Option[] = opts('auto', 'detailed', 'concise', 'off')

export const VERBOSITY_OPTIONS: Option[] = [
  { value: DEFAULT, label: 'Model default' },
  ...opts('low', 'medium', 'high'),
]

export const SERVICE_TIER_OPTIONS: Option[] = [
  { value: DEFAULT, label: 'Project default' },
  ...opts('auto', 'default', 'flex', 'priority'),
]

export const DETAIL_OPTIONS: Option[] = [
  { value: DEFAULT, label: 'API default' },
  ...opts('auto', 'low', 'high'),
]

/** Normalises a WIDTHxHEIGHT string; returns null when malformed. */
export function parseSize(value: string): { width: number; height: number } | null {
  const match = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i.exec(value.trim())
  if (!match) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}
