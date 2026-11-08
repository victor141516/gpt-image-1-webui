import { createOpenAI, type OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai'
import {
  isStepCount,
  tool,
  ToolLoopAgent,
  type ModelMessage,
  type ToolResultPart,
  type ToolSet,
  type UserContent,
} from 'ai'
import { z } from 'zod'
import { callImagesApi } from './images-api'
import { FORMAT_MEDIA_TYPES, toApiInput, toVisionInput } from './image-utils'
import { AGENT, DEFAULT, type Settings } from './settings'
import { addImage, assistantById, imageByLabel, images, persist } from './store'
import type {
  AssistantMessage,
  ImageRecord,
  ImageToolOutput,
  Message,
  ToolPart,
  UserMessage,
} from './types'

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

// ---------------------------------------------------------------- Images API parameters

/** Request parameters shared by both tools: user-fixed values plus whatever the agent may choose. */
function imageParams(settings: Settings, input: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = { model: settings.imageModel }
  const pick = (key: string, setting: string) => {
    if (setting === AGENT) {
      if (input[key] !== undefined) params[key] = input[key]
    } else if (setting !== DEFAULT) {
      params[key] = setting
    }
  }
  pick('size', settings.size)
  pick('quality', settings.quality)
  pick('background', settings.background)
  if (settings.n === AGENT) {
    if (typeof input.n === 'number' && input.n > 1) params.n = input.n
  } else if (settings.n !== '1') {
    params.n = Number(settings.n)
  }
  if (settings.moderation !== DEFAULT) params.moderation = settings.moderation
  if (settings.complexity !== DEFAULT) params.complexity = settings.complexity
  if (settings.safetyIdentifier.trim()) params.safety_identifier = settings.safetyIdentifier.trim()

  const format = settings.outputFormat
  params.output_format = format
  if ((format === 'jpeg' || format === 'webp') && settings.outputCompression !== 100) {
    params.output_compression = settings.outputCompression
  }
  if (format === 'gif') {
    params.frame_count = settings.frameCount
    params.frame_duration_ms = settings.frameDurationMs
  }
  if (format === 'svg') {
    delete params.n
    if (settings.svgModel.trim()) {
      params.svg = {
        model: settings.svgModel.trim(),
        ...(settings.svgReasoningEffort !== DEFAULT && { reasoning: { effort: settings.svgReasoningEffort } }),
      }
    }
  }
  if (settings.partialImages > 0 && format !== 'gif' && format !== 'svg') {
    params.stream = true
    params.partial_images = settings.partialImages
  }
  return params
}

/** Schema fields for parameters the user delegated to the agent. */
function delegatedFields(settings: Settings) {
  return {
    ...(settings.size === AGENT && {
      size: z
        .string()
        .optional()
        .describe(
          "Output size: 'auto' or 'WIDTHxHEIGHT'. Standard: 1024x1024, 1536x1024 (landscape), 1024x1536 (portrait). " +
            'Newer models accept any size with both edges multiples of 16, aspect ratio between 1:3 and 3:1, up to 3840x2160 ' +
            '(above 2560x1440 is experimental). Omit for auto.',
        ),
    }),
    ...(settings.quality === AGENT && {
      quality: z
        .enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
        .optional()
        .describe('Rendering quality. low = fast drafts; xhigh/max only on GPT Image 2.5. Omit for auto.'),
    }),
    ...(settings.background === AGENT && {
      background: z
        .enum(['auto', 'opaque', 'transparent'])
        .optional()
        .describe('Use transparent for stickers, logos, cut-outs and assets (PNG/WebP only). Omit for auto.'),
    }),
    ...(settings.n === AGENT &&
      settings.outputFormat !== 'svg' && {
        n: z.number().int().min(1).max(10).optional().describe('Number of images to produce in this call (1-10).'),
      }),
  }
}

function describeFixedParams(settings: Settings) {
  const fixed: string[] = [`model ${settings.imageModel}`, `output format ${settings.outputFormat}`]
  const delegated: string[] = []
  const describe = (name: string, value: string) => {
    if (value === AGENT) delegated.push(name)
    else if (value !== DEFAULT) fixed.push(`${name} ${value}`)
  }
  describe('size', settings.size)
  describe('quality', settings.quality)
  describe('background', settings.background)
  if (settings.outputFormat !== 'svg') describe('n', settings.n === AGENT ? AGENT : settings.n)
  return { fixed, delegated }
}

function instructions(settings: Settings) {
  const { fixed, delegated } = describeFixedParams(settings)
  return `You are the art director of "Image Studio", a chat app whose only output medium is pictures made by OpenAI image models. You cannot draw yourself: every image must come from the generate_image or edit_image tools. The image model only sees the prompt and input images you pass to it, never this conversation.

Images
- Every image has a label such as img_3. User attachments arrive as "[Attached img_3 …]" followed by the picture; tool results list the labels they created. Always refer to images by label.
- Use edit_image whenever the request depends on existing images: modifying, restyling, extending, combining, keeping a character or product consistent, or using a picture as reference. Put the image being modified first; up to 16 inputs.
- Use generate_image only for brand-new images.
- A "mask" attachment marks (with transparent pixels) the region of its target image to repaint: call edit_image with the target first and pass the mask label as mask.
- A "markup" attachment is a transparent overlay of sketches/annotations drawn on its target: call edit_image with the target first and pass it as markup (GPT Image 2.5+). Never combine mask and markup.

Prompts
- Write complete, self-contained prompts: subject, composition, style, lighting, colours, camera/lens when useful, exact text to render in quotes, and what must stay unchanged when editing.
- If the user already wrote a detailed prompt, keep it nearly verbatim.

Behaviour
- Act right away; ask a question only when the request is genuinely ambiguous.
- For alternatives or variations, issue several tool calls in the same step (they run in parallel) or use n when available.
${settings.agentSeesResults ? '- You can see every result. Check it against the request; if something is clearly wrong (misspelled text, missing element) fix it with one targeted edit, but do not loop.\n' : ''}- Answer briefly in the user's language: what you made (by label) and, if useful, one or two next-step ideas. Never output image markdown or base64; the app shows the images automatically.
- If a tool fails, read the error, adjust the parameters or prompt, and retry once if it makes sense; otherwise explain the problem.

Fixed by the user (you cannot change them): ${fixed.join(', ')}.
${delegated.length ? `You choose per call: ${delegated.join(', ')}.` : 'No image parameters are delegated to you.'}${
    settings.customInstructions.trim() ? `\n\nUser instructions:\n${settings.customInstructions.trim()}` : ''
  }`
}

// ---------------------------------------------------------------- history → model messages

const visionOptions = (settings: Settings) =>
  settings.visionDetail === DEFAULT ? undefined : { openai: { imageDetail: settings.visionDetail } }

function describeImage(record: ImageRecord) {
  const target = record.targetId ? images.get(record.targetId) : undefined
  if (record.source === 'mask') {
    return `[Attached ${record.label}: mask for ${target?.label ?? 'an image'} (transparent = area to repaint)]`
  }
  if (record.source === 'markup') {
    return `[Attached ${record.label}: markup overlay drawn on ${target?.label ?? 'an image'}]`
  }
  const name = record.name ? `, "${record.name}"` : ''
  return `[Attached ${record.label}: ${record.width}x${record.height}${name}]`
}

async function userContent(message: UserMessage, settings: Settings): Promise<UserContent> {
  const content: Exclude<UserContent, string> = []
  if (message.text.trim()) content.push({ type: 'text', text: message.text })
  for (const attachment of message.attachments) {
    const record = images.get(attachment.imageId)
    if (!record) continue
    content.push({ type: 'text', text: describeImage(record) })
    if (record.source === 'mask') continue
    const { mediaType, base64 } = await toVisionInput(record.dataUrl, record.mediaType)
    content.push({
      type: 'file',
      mediaType,
      data: { type: 'data', data: base64 },
      providerOptions: visionOptions(settings),
    })
  }
  if (!content.length) content.push({ type: 'text', text: '(empty message)' })
  return content
}

async function toolResultOutput(part: ToolPart, settings: Settings): Promise<ToolResultPart['output']> {
  if (part.state !== 'done' || !part.output) {
    return { type: 'error-text', value: part.error ?? 'The tool call did not finish.' }
  }
  const records = part.output.images.map((id) => images.get(id)).filter((r): r is ImageRecord => !!r)
  const summary = {
    created: records.map((r) => ({ label: r.label, width: r.width, height: r.height })),
    model: part.output.model,
    size: part.output.size,
    quality: part.output.quality,
    background: part.output.background,
    output_format: part.output.outputFormat,
  }
  const value: Extract<ToolResultPart['output'], { type: 'content' }>['value'] = [
    { type: 'text', text: JSON.stringify(summary) },
  ]
  if (settings.agentSeesResults) {
    for (const record of records) {
      const { mediaType, base64 } = await toVisionInput(record.dataUrl, record.mediaType)
      value.push({ type: 'text', text: record.label })
      value.push({
        type: 'file',
        mediaType,
        data: { type: 'data', data: base64 },
        providerOptions: visionOptions(settings),
      })
    }
  }
  return { type: 'content', value }
}

async function assistantMessages(message: AssistantMessage, settings: Settings): Promise<ModelMessage[]> {
  const result: ModelMessage[] = []
  const steps = [...new Set(message.parts.map((p) => p.step))].sort((a, b) => a - b)
  for (const step of steps) {
    const parts = message.parts.filter((p) => p.step === step)
    const content: Exclude<Extract<ModelMessage, { role: 'assistant' }>['content'], string> = []
    const tools = parts.filter((p): p is ToolPart => p.type === 'tool')
    for (const part of parts) {
      if (part.type === 'text' && part.text.trim()) content.push({ type: 'text', text: part.text })
      if (part.type === 'tool') {
        content.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input ?? {},
        })
      }
    }
    if (!content.length) continue
    result.push({ role: 'assistant', content })
    if (tools.length) {
      result.push({
        role: 'tool',
        content: await Promise.all(
          tools.map(async (part) => ({
            type: 'tool-result' as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: await toolResultOutput(part, settings),
          })),
        ),
      })
    }
  }
  if (message.status === 'aborted' && result.length) {
    result.push({ role: 'assistant', content: '(Stopped by the user before finishing.)' })
  }
  return result
}

export async function toModelMessages(path: Message[], settings: Settings): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = []
  for (const message of path) {
    if (message.role === 'user') messages.push({ role: 'user', content: await userContent(message, settings) })
    else messages.push(...(await assistantMessages(message, settings)))
  }
  return messages
}

// ---------------------------------------------------------------- tools

interface RunContext {
  settings: Settings
  apiKey: string
  assistantId: string
  step: () => number
}

function toolPart(ctx: RunContext, toolCallId: string, toolName: string): ToolPart {
  const assistant = assistantById(ctx.assistantId)!
  let part = assistant.parts.find((p): p is ToolPart => p.type === 'tool' && p.toolCallId === toolCallId)
  if (!part) {
    assistant.parts.push({
      type: 'tool',
      step: ctx.step(),
      toolCallId,
      toolName,
      state: 'input',
      inputText: '',
      startedAt: Date.now(),
    })
    part = assistant.parts[assistant.parts.length - 1] as ToolPart
  }
  return part
}

function resolveLabel(label: string, role: string): ImageRecord {
  const record = imageByLabel(label)
  if (!record) {
    const known = [...images.values()].map((r) => r.label).join(', ') || 'none'
    throw new Error(`Unknown ${role} image "${label}". Known labels: ${known}.`)
  }
  return record
}

async function runImageTool(
  ctx: RunContext,
  endpoint: 'generations' | 'edits',
  input: Record<string, unknown>,
  toolCallId: string,
  abortSignal: AbortSignal | undefined,
): Promise<ImageToolOutput> {
  const part = toolPart(ctx, toolCallId, endpoint === 'edits' ? 'edit_image' : 'generate_image')
  part.state = 'running'
  part.input = input
  const started = Date.now()

  const params = imageParams(ctx.settings, input)
  const body: Record<string, unknown> = { ...params, prompt: String(input.prompt ?? '') }
  const shownRequest: Record<string, unknown> = { endpoint: `/images/${endpoint}`, ...body }

  if (endpoint === 'edits') {
    const labels = (input.images as string[] | undefined) ?? []
    if (!labels.length) throw new Error('edit_image needs at least one input image label.')
    const inputs = labels.map((label) => resolveLabel(label, 'input'))
    body.images = await Promise.all(
      inputs.map(async (r) => ({ image_url: await toApiInput(r.dataUrl, r.mediaType) })),
    )
    shownRequest.images = inputs.map((r) => r.label)
    for (const key of ['mask', 'markup'] as const) {
      const label = input[key]
      if (typeof label !== 'string' || !label.trim()) continue
      const record = resolveLabel(label, key)
      body[key] = { image_url: await toApiInput(record.dataUrl, record.mediaType) }
      shownRequest[key] = record.label
    }
    if (ctx.settings.inputFidelity !== DEFAULT) {
      body.input_fidelity = ctx.settings.inputFidelity
      shownRequest.input_fidelity = ctx.settings.inputFidelity
    }
  }
  part.request = shownRequest
  void persist()

  const result = await callImagesApi({
    endpoint,
    body,
    apiKey: ctx.apiKey,
    baseURL: ctx.settings.baseURL,
    organization: ctx.settings.organization,
    project: ctx.settings.project,
    signal: abortSignal,
    onPartial: (b64) => {
      part.partial = `data:${FORMAT_MEDIA_TYPES[ctx.settings.outputFormat] ?? 'image/png'};base64,${b64}`
    },
  })

  const format = result.outputFormat ?? ctx.settings.outputFormat
  const mediaType = FORMAT_MEDIA_TYPES[format] ?? 'image/png'
  const ids: string[] = []
  for (const b64 of result.images) {
    const record = await addImage({
      dataUrl: `data:${mediaType};base64,${b64}`,
      mediaType,
      source: 'generated',
      generation: { toolCallId, endpoint, prompt: String(input.prompt ?? ''), params: shownRequest },
    })
    ids.push(record.id)
  }
  const output: ImageToolOutput = {
    images: ids,
    model: ctx.settings.imageModel,
    usage: result.usage,
    size: result.size,
    quality: result.quality,
    background: result.background,
    outputFormat: format,
    durationMs: Date.now() - started,
  }
  part.output = output
  part.partial = null
  return output
}

function buildTools(ctx: RunContext): ToolSet {
  const delegated = delegatedFields(ctx.settings)
  const toModelOutput = async ({ toolCallId }: { toolCallId: string }) =>
    toolResultOutput(toolPart(ctx, toolCallId, ''), ctx.settings)

  return {
    generate_image: tool({
      description:
        'Create brand-new images from a text prompt with the configured image model. Returns the labels of the new images.',
      inputSchema: z.object({
        prompt: z.string().min(1).max(32000).describe('Complete, self-contained description of the image to create.'),
        ...delegated,
      }),
      execute: (input, { toolCallId, abortSignal }) =>
        runImageTool(ctx, 'generations', input, toolCallId, abortSignal),
      toModelOutput,
    }),
    edit_image: tool({
      description:
        'Edit, extend, restyle or combine existing images (by label) following a prompt. The first image is the main one being edited; extra images act as references. Returns the labels of the new images.',
      inputSchema: z.object({
        prompt: z.string().min(1).max(32000).describe('Complete instruction: what to change and what must stay the same.'),
        images: z.array(z.string()).min(1).max(16).describe('Input image labels, e.g. ["img_2", "img_5"]. Main image first.'),
        mask: z
          .string()
          .optional()
          .describe('Label of a mask image (transparent pixels = area to repaint) for the first image.'),
        markup: z
          .string()
          .optional()
          .describe('Label of a markup overlay drawn on the first image (GPT Image 2.5+). Cannot be used with mask.'),
        ...delegated,
      }),
      execute: (input, { toolCallId, abortSignal }) => runImageTool(ctx, 'edits', input, toolCallId, abortSignal),
      toModelOutput,
    }),
  }
}

// ---------------------------------------------------------------- run

export async function runAgent(options: {
  assistantId: string
  history: Message[]
  settings: Settings
  apiKey: string
  signal: AbortSignal
}) {
  const { assistantId, settings, apiKey, signal } = options
  const assistant = assistantById(assistantId)!
  let step = -1
  const ctx: RunContext = { settings, apiKey, assistantId, step: () => Math.max(step, 0) }

  const provider = createOpenAI({
    apiKey,
    baseURL: settings.baseURL.replace(/\/$/, ''),
    organization: settings.organization || undefined,
    project: settings.project || undefined,
  })

  const openaiOptions: OpenAILanguageModelResponsesOptions = {
    parallelToolCalls: settings.parallelToolCalls,
  }
  if (settings.reasoningEffort !== DEFAULT) openaiOptions.reasoningEffort = settings.reasoningEffort
  if (settings.reasoningSummary !== 'off') openaiOptions.reasoningSummary = settings.reasoningSummary
  if (settings.textVerbosity !== DEFAULT) {
    openaiOptions.textVerbosity = settings.textVerbosity as OpenAILanguageModelResponsesOptions['textVerbosity']
  }
  if (settings.serviceTier !== DEFAULT) {
    openaiOptions.serviceTier = settings.serviceTier as OpenAILanguageModelResponsesOptions['serviceTier']
  }
  if (settings.safetyIdentifier.trim()) openaiOptions.safetyIdentifier = settings.safetyIdentifier.trim()

  const agent = new ToolLoopAgent({
    model: provider.responses(settings.chatModel),
    instructions: instructions(settings),
    tools: buildTools(ctx),
    stopWhen: isStepCount(Math.max(1, settings.maxSteps)),
    providerOptions: { openai: openaiOptions },
  })

  const textParts = new Map<string, { text: string }>()
  const streamedPart = (kind: 'text' | 'reasoning', id: string) => {
    const key = `${step}:${kind}:${id}`
    let part = textParts.get(key)
    if (!part) {
      assistant.parts.push({ type: kind, step: Math.max(step, 0), text: '' })
      part = assistant.parts[assistant.parts.length - 1] as { text: string }
      textParts.set(key, part)
    }
    return part
  }

  try {
    const messages = await toModelMessages(options.history, settings)
    const result = await agent.stream({ messages, abortSignal: signal })
    for await (const chunk of result.stream) {
      switch (chunk.type) {
        case 'start-step':
          step += 1
          assistant.steps = step + 1
          break
        case 'reasoning-delta':
          streamedPart('reasoning', chunk.id).text += chunk.text
          break
        case 'text-delta':
          streamedPart('text', chunk.id).text += chunk.text
          break
        case 'tool-input-start':
          toolPart(ctx, chunk.id, chunk.toolName)
          break
        case 'tool-input-delta':
          toolPart(ctx, chunk.id, '').inputText += chunk.delta
          break
        case 'tool-call': {
          const part = toolPart(ctx, chunk.toolCallId, chunk.toolName)
          part.input = (chunk.input ?? {}) as Record<string, unknown>
          if (chunk.invalid) {
            part.state = 'error'
            part.error = `Invalid tool call: ${errorText(chunk.error)}`
            part.endedAt = Date.now()
          } else if (part.state === 'input') {
            part.state = 'running'
          }
          break
        }
        case 'tool-result':
          if (!chunk.preliminary) {
            const part = toolPart(ctx, chunk.toolCallId, chunk.toolName)
            part.state = 'done'
            part.endedAt = Date.now()
          }
          break
        case 'tool-error': {
          const part = toolPart(ctx, chunk.toolCallId, chunk.toolName)
          part.state = 'error'
          part.error = errorText(chunk.error)
          part.partial = null
          part.endedAt = Date.now()
          break
        }
        case 'finish':
          assistant.usage = {
            inputTokens: chunk.totalUsage.inputTokens,
            outputTokens: chunk.totalUsage.outputTokens,
            reasoningTokens: chunk.totalUsage.outputTokenDetails.reasoningTokens,
            cachedInputTokens: chunk.totalUsage.inputTokenDetails.cacheReadTokens,
            totalTokens: chunk.totalUsage.totalTokens,
          }
          break
        case 'abort':
          assistant.status = 'aborted'
          break
        case 'error':
          throw chunk.error
      }
      void persist()
    }
    if (assistant.status === 'running') assistant.status = signal.aborted ? 'aborted' : 'done'
  } catch (error) {
    if (signal.aborted) {
      assistant.status = 'aborted'
    } else {
      assistant.status = 'error'
      assistant.error = errorText(error)
    }
  } finally {
    for (const part of assistant.parts) {
      if (part.type === 'tool' && (part.state === 'running' || part.state === 'input')) {
        part.state = 'error'
        part.error = assistant.status === 'aborted' ? 'Cancelled by the user.' : 'The run ended before this call finished.'
        part.partial = null
        part.endedAt = Date.now()
      }
    }
    assistant.finishedAt = Date.now()
    await persist(true)
  }
}
