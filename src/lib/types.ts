export type ImageSource = 'upload' | 'generated' | 'mask' | 'markup'

/** Persisted image. `label` is the handle the agent uses (img_1, img_2…). */
export interface ImageRecord {
  id: string
  conversationId: string
  label: string
  source: ImageSource
  mediaType: string
  dataUrl: string
  width: number
  height: number
  name?: string
  /** For masks/markups: the image they were painted on. */
  targetId?: string
  /** For generated images: how they were made. */
  generation?: {
    toolCallId: string
    endpoint: 'generations' | 'edits'
    prompt: string
    params: Record<string, unknown>
  }
  createdAt: number
}

export interface Attachment {
  imageId: string
}

export interface UserMessage {
  id: string
  parentId: string | null
  role: 'user'
  text: string
  attachments: Attachment[]
  createdAt: number
}

export interface ImagesUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  input_tokens_details?: { image_tokens?: number; text_tokens?: number }
  output_tokens_details?: { image_tokens?: number; text_tokens?: number }
}

export interface ImageToolOutput {
  images: string[]
  model: string
  usage?: ImagesUsage
  size?: string
  quality?: string
  background?: string
  outputFormat?: string
  durationMs: number
}

export type ToolState = 'input' | 'running' | 'done' | 'error'

export interface TextPart {
  type: 'text'
  step: number
  text: string
}

export interface ReasoningPart {
  type: 'reasoning'
  step: number
  text: string
}

export interface ToolPart {
  type: 'tool'
  step: number
  toolCallId: string
  toolName: string
  state: ToolState
  inputText: string
  input?: Record<string, unknown>
  /** Fully resolved request body sent to the Images API (minus image payloads). */
  request?: Record<string, unknown>
  output?: ImageToolOutput
  error?: string
  /** Latest streamed partial preview (not persisted). */
  partial?: string | null
  startedAt: number
  endedAt?: number
}

export type AssistantPart = TextPart | ReasoningPart | ToolPart

export type AssistantStatus = 'running' | 'done' | 'error' | 'aborted'

export interface ChatUsage {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  totalTokens?: number
}

export interface AssistantMessage {
  id: string
  parentId: string
  role: 'assistant'
  parts: AssistantPart[]
  status: AssistantStatus
  error?: string
  model: string
  usage?: ChatUsage
  steps: number
  createdAt: number
  finishedAt?: number
}

export type Message = UserMessage | AssistantMessage

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Record<string, Message>
  /** Last message of the visible branch. null = empty conversation. */
  leafId: string | null
  /** Remembers which child is selected for each parent ('root' for top level). */
  activeChild: Record<string, string>
  imageCounter: number
  /** Every image belonging to this conversation, in creation order. */
  imageIds: string[]
}

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: number
}
