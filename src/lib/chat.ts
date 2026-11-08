import { runAgent } from './agent'
import { apiKey, settings } from './settings'
import {
  activePath,
  appendMessage,
  conversation,
  newId,
  persist,
  running,
  setLeaf,
  startConversation,
} from './store'
import type { AssistantMessage, Attachment, UserMessage } from './types'

async function respond(parentId: string) {
  const assistant: AssistantMessage = {
    id: newId(),
    parentId,
    role: 'assistant',
    parts: [],
    status: 'running',
    model: settings.value.chatModel,
    steps: 0,
    createdAt: Date.now(),
  }
  appendMessage(assistant)
  const history = activePath.value.slice(0, -1)
  const controller = new AbortController()
  running.value = { assistantId: assistant.id, controller }
  await persist(true)
  try {
    await runAgent({
      assistantId: assistant.id,
      history,
      // Snapshot: changing settings mid-run must not alter the running agent.
      settings: JSON.parse(JSON.stringify(settings.value)),
      apiKey: apiKey.value.trim(),
      signal: controller.signal,
    })
  } finally {
    running.value = null
  }
}

/** Sends a user message after the current leaf and runs the agent. */
export async function send(text: string, attachments: Attachment[]) {
  if (running.value || !apiKey.value.trim()) return
  if (!conversation.value) startConversation()
  const message: UserMessage = {
    id: newId(),
    parentId: conversation.value!.leafId,
    role: 'user',
    text,
    attachments,
    createdAt: Date.now(),
  }
  appendMessage(message)
  await respond(message.id)
}

/** Runs the agent again for the same user message, as a new sibling branch. */
export async function regenerate(assistant: AssistantMessage) {
  if (running.value || !apiKey.value.trim()) return
  setLeaf(assistant.parentId)
  await respond(assistant.parentId)
}

/** Rewinds to just before `message`; the caller refills the composer with its content. */
export function rewindBefore(message: UserMessage) {
  setLeaf(message.parentId)
}

export function stop() {
  running.value?.controller.abort()
}
