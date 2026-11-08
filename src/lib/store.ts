import { computed, reactive, ref, shallowRef, toRaw } from 'vue'
import { createStore, del, delMany, get, getMany, set } from 'idb-keyval'
import type {
  AssistantMessage,
  Conversation,
  ConversationSummary,
  ImageRecord,
  ImageSource,
  Message,
} from './types'
import { imageDimensions } from './image-utils'

const db = createStore('img-studio', 'kv')
const INDEX_KEY = 'index'
const LAST_KEY = 'last-conversation'
const ROOT = 'root'

export const summaries = ref<ConversationSummary[]>([])
export const conversation = ref<Conversation | null>(null)
/** Images of the open conversation, by id. */
export const images = reactive(new Map<string, ImageRecord>())
export const running = shallowRef<{ assistantId: string; controller: AbortController } | null>(null)
export const ready = ref(false)

export const newId = () => crypto.randomUUID()

// ---------------------------------------------------------------- persistence

let saveTimer: number | undefined
const dropTransient = (key: string, value: unknown) => (key === 'partial' ? undefined : value)

async function writeConversation(conv: Conversation) {
  const plain = JSON.parse(JSON.stringify(toRaw(conv), dropTransient)) as Conversation
  await set(`conv:${conv.id}`, plain, db)
  const summary = { id: conv.id, title: conv.title, updatedAt: conv.updatedAt }
  summaries.value = [summary, ...summaries.value.filter((s) => s.id !== conv.id)].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  )
  await set(INDEX_KEY, JSON.parse(JSON.stringify(summaries.value)), db)
}

/** Persists the open conversation; `immediate` skips the debounce. */
export function persist(immediate = false) {
  const conv = conversation.value
  if (!conv) return Promise.resolve()
  conv.updatedAt = Date.now()
  clearTimeout(saveTimer)
  if (immediate) return writeConversation(conv)
  saveTimer = window.setTimeout(() => void writeConversation(conv), 400)
  return Promise.resolve()
}

export async function init() {
  summaries.value = (await get<ConversationSummary[]>(INDEX_KEY, db)) ?? []
  const last = (await get<string>(LAST_KEY, db)) ?? summaries.value[0]?.id
  if (last && summaries.value.some((s) => s.id === last)) await openConversation(last)
  ready.value = true
}

export async function openConversation(id: string) {
  if (running.value) return
  const conv = await get<Conversation>(`conv:${id}`, db)
  if (!conv) return
  conv.imageIds ??= []
  // A run cannot survive a reload: close whatever was in flight.
  for (const message of Object.values(conv.messages)) {
    if (message.role === 'assistant' && message.status === 'running') {
      message.status = 'aborted'
      message.error = 'Interrupted before finishing.'
      for (const part of message.parts) {
        if (part.type === 'tool' && (part.state === 'running' || part.state === 'input')) {
          part.state = 'error'
          part.error = 'Interrupted before finishing.'
        }
      }
    }
  }
  const records = await getMany<ImageRecord | undefined>(
    conv.imageIds.map((imageId) => `img:${imageId}`),
    db,
  )
  images.clear()
  for (const record of records) if (record) images.set(record.id, record)
  conversation.value = conv
  await set(LAST_KEY, id, db)
}

export function startConversation() {
  if (running.value) return
  const now = Date.now()
  conversation.value = {
    id: newId(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages: {},
    leafId: null,
    activeChild: {},
    imageCounter: 0,
    imageIds: [],
  }
  images.clear()
}

export async function deleteConversation(id: string) {
  if (running.value && conversation.value?.id === id) return
  const conv = conversation.value?.id === id ? conversation.value : await get<Conversation>(`conv:${id}`, db)
  if (conv) await delMany([...(conv.imageIds ?? []).map((imageId) => `img:${imageId}`), `conv:${id}`], db)
  summaries.value = summaries.value.filter((s) => s.id !== id)
  await set(INDEX_KEY, JSON.parse(JSON.stringify(summaries.value)), db)
  if (conversation.value?.id === id) {
    conversation.value = null
    images.clear()
    await del(LAST_KEY, db)
  }
}

export async function renameConversation(title: string) {
  if (!conversation.value) return
  conversation.value.title = title.trim() || conversation.value.title
  await persist(true)
}

// ---------------------------------------------------------------- images

export async function addImage(input: {
  dataUrl: string
  mediaType: string
  source: ImageSource
  name?: string
  targetId?: string
  generation?: ImageRecord['generation']
}): Promise<ImageRecord> {
  const conv = conversation.value
  if (!conv) throw new Error('No open conversation.')
  const { width, height } = await imageDimensions(input.dataUrl).catch(() => ({ width: 0, height: 0 }))
  conv.imageCounter += 1
  const record: ImageRecord = {
    id: newId(),
    conversationId: conv.id,
    label: `img_${conv.imageCounter}`,
    createdAt: Date.now(),
    width,
    height,
    ...input,
  }
  await set(`img:${record.id}`, record, db)
  images.set(record.id, record)
  conv.imageIds.push(record.id)
  await persist(true)
  return record
}

export const imageByLabel = (label: string) =>
  [...images.values()].find((record) => record.label === label.trim().replace(/^@/, ''))

// ---------------------------------------------------------------- message tree

const parentKey = (parentId: string | null) => parentId ?? ROOT

export function childrenOf(parentId: string | null): Message[] {
  const conv = conversation.value
  if (!conv) return []
  return Object.values(conv.messages)
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** Messages from the root to the current leaf. */
export const activePath = computed<Message[]>(() => {
  const conv = conversation.value
  if (!conv?.leafId) return []
  const path: Message[] = []
  let cursor: Message | undefined = conv.messages[conv.leafId]
  while (cursor) {
    path.unshift(cursor)
    cursor = cursor.parentId ? conv.messages[cursor.parentId] : undefined
  }
  return path
})

/** The child the branch continues with below `parentId`: the remembered one, else the newest. */
function nextOnBranch(parentId: string | null): string | null {
  const kids = childrenOf(parentId)
  const remembered = conversation.value?.activeChild[parentKey(parentId)]
  return kids.find((k) => k.id === remembered)?.id ?? kids.at(-1)?.id ?? null
}

/** Follows the remembered branch down from `id` to its leaf. */
function deepestFrom(id: string): string {
  let current = id
  for (let next = nextOnBranch(current); next; next = nextOnBranch(current)) current = next
  return current
}

/** Makes `id` the leaf of the visible branch (null = before the first message). */
export function setLeaf(id: string | null) {
  const conv = conversation.value
  if (!conv || running.value) return
  conv.leafId = id
  let cursor = id ? conv.messages[id] : undefined
  while (cursor) {
    conv.activeChild[parentKey(cursor.parentId)] = cursor.id
    cursor = cursor.parentId ? conv.messages[cursor.parentId] : undefined
  }
  void persist()
}

/** Number of messages hidden below the current leaf on the remembered branch. */
export const hiddenAfterLeaf = computed(() => {
  const conv = conversation.value
  if (!conv) return 0
  let count = 0
  for (let next = nextOnBranch(conv.leafId); next; next = nextOnBranch(next)) count += 1
  return count
})

/** Restores the branch that continues below the current leaf. */
export function fastForward() {
  const conv = conversation.value
  if (!conv) return
  const next = nextOnBranch(conv.leafId)
  if (next) setLeaf(deepestFrom(next))
}

export function siblingsOf(message: Message): Message[] {
  return childrenOf(message.parentId)
}

/** Switches to the sibling branch at `offset` (-1 / +1) and restores its remembered leaf. */
export function switchBranch(message: Message, offset: number) {
  const siblings = siblingsOf(message)
  const index = siblings.findIndex((s) => s.id === message.id)
  const target = siblings[index + offset]
  if (!target) return
  setLeaf(deepestFrom(target.id))
}

export function appendMessage(message: Message) {
  const conv = conversation.value!
  conv.messages[message.id] = message
  conv.leafId = message.id
  conv.activeChild[parentKey(message.parentId)] = message.id
  if (message.role === 'user' && conv.title === 'New conversation' && message.text.trim()) {
    conv.title = message.text.trim().replace(/\s+/g, ' ').slice(0, 60)
  }
}

/** Deletes a message and its whole subtree, keeping the leaf valid. */
export function deleteBranch(id: string) {
  const conv = conversation.value
  if (!conv || running.value) return
  const doomed = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const message of Object.values(conv.messages)) {
      if (message.parentId && doomed.has(message.parentId) && !doomed.has(message.id)) {
        doomed.add(message.id)
        grew = true
      }
    }
  }
  const parentId = conv.messages[id]?.parentId ?? null
  const leafDoomed = conv.leafId !== null && doomed.has(conv.leafId)
  for (const doomedId of doomed) delete conv.messages[doomedId]
  for (const [key, child] of Object.entries(conv.activeChild)) {
    if (doomed.has(child) || doomed.has(key)) delete conv.activeChild[key]
  }
  if (leafDoomed) {
    const remaining = childrenOf(parentId).at(-1)
    conv.leafId = remaining ? deepestFrom(remaining.id) : parentId
  }
  void persist(true)
}

export function assistantById(id: string): AssistantMessage | undefined {
  const message = conversation.value?.messages[id]
  return message?.role === 'assistant' ? message : undefined
}
