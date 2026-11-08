<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '../lib/types'
import { conversation, deleteBranch, running, setLeaf, siblingsOf, switchBranch } from '../lib/store'
import { regenerate, rewindBefore } from '../lib/chat'
import { composerAttachments, composerText } from '../lib/ui'
import { renderMarkdown } from '../lib/markdown'
import { apiKey } from '../lib/settings'
import ImageThumb from './ImageThumb.vue'
import ToolCallCard from './ToolCallCard.vue'

const props = defineProps<{ message: Message }>()

const siblings = computed(() => siblingsOf(props.message))
const siblingIndex = computed(() => siblings.value.findIndex((s) => s.id === props.message.id))
const isLeaf = computed(() => conversation.value?.leafId === props.message.id)
const busy = computed(() => running.value !== null)
const isRunning = computed(() => running.value?.assistantId === props.message.id)
const time = computed(() =>
  new Date(props.message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
)
const usage = computed(() => {
  if (props.message.role !== 'assistant' || !props.message.usage) return ''
  const u = props.message.usage
  const reasoning = u.reasoningTokens ? ` (${u.reasoningTokens} reasoning)` : ''
  return `${u.inputTokens ?? 0} in / ${u.outputTokens ?? 0} out${reasoning}`
})

function editAndRewind() {
  if (props.message.role !== 'user' || busy.value) return
  composerText.value = props.message.text
  composerAttachments.value = props.message.attachments.map((a) => a.imageId)
  rewindBefore(props.message)
}

function copyText() {
  const text =
    props.message.role === 'user'
      ? props.message.text
      : props.message.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n\n')
  void navigator.clipboard.writeText(text)
}

function removeBranch() {
  if (confirm('Delete this message and everything that follows it in this branch?')) deleteBranch(props.message.id)
}

const actionClass =
  'rounded-full border border-stone-700 px-2.5 py-1 text-[11px] font-semibold text-stone-300 transition hover:border-cyan-300/60 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40'
</script>

<template>
  <article class="group flex" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
    <div
      class="w-full rounded-3xl border p-4 shadow-xl"
      :class="
        message.role === 'user'
          ? 'max-w-2xl border-cyan-400/25 bg-cyan-950/30 shadow-cyan-950/20'
          : 'max-w-3xl border-stone-800 bg-stone-900/60 shadow-black/30'
      "
    >
      <header class="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span
          class="font-semibold uppercase tracking-widest"
          :class="message.role === 'user' ? 'text-cyan-200' : 'text-amber-200'"
        >
          {{ message.role === 'user' ? 'You' : 'Agent' }}
        </span>
        <span>{{ time }}</span>
        <span v-if="message.role === 'assistant'">{{ message.model }}</span>
        <span v-if="message.role === 'assistant' && message.steps > 1">{{ message.steps }} steps</span>
        <span v-if="usage">{{ usage }}</span>
        <span v-if="siblings.length > 1" class="ml-auto flex items-center gap-1 font-mono text-stone-400">
          <button
            type="button"
            class="rounded px-1.5 hover:bg-stone-800 disabled:opacity-30"
            :disabled="busy || siblingIndex === 0"
            title="Previous branch"
            @click="switchBranch(message, -1)"
          >
            ‹
          </button>
          {{ siblingIndex + 1 }}/{{ siblings.length }}
          <button
            type="button"
            class="rounded px-1.5 hover:bg-stone-800 disabled:opacity-30"
            :disabled="busy || siblingIndex === siblings.length - 1"
            title="Next branch"
            @click="switchBranch(message, 1)"
          >
            ›
          </button>
        </span>
      </header>

      <template v-if="message.role === 'user'">
        <p v-if="message.text" class="whitespace-pre-wrap text-base leading-7 text-stone-100">{{ message.text }}</p>
        <div v-if="message.attachments.length" class="mt-3 flex flex-wrap gap-2">
          <ImageThumb v-for="a in message.attachments" :key="a.imageId" :image-id="a.imageId" />
        </div>
      </template>

      <div v-else class="space-y-3">
        <template v-for="(part, index) in message.parts" :key="index">
          <details v-if="part.type === 'reasoning' && part.text.trim()" class="text-sm text-stone-400">
            <summary class="cursor-pointer select-none text-xs uppercase tracking-widest text-stone-500">
              Reasoning
            </summary>
            <div class="prose-chat mt-2 border-l border-stone-700 pl-3" v-html="renderMarkdown(part.text)" />
          </details>
          <div v-else-if="part.type === 'text' && part.text" class="prose-chat text-stone-100" v-html="renderMarkdown(part.text)" />
          <ToolCallCard v-else-if="part.type === 'tool'" :part="part" />
        </template>
        <p v-if="isRunning && !message.parts.length" class="animate-pulse text-sm text-stone-400">Thinking…</p>
        <p
          v-if="message.status === 'error'"
          class="whitespace-pre-wrap rounded-2xl border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-100"
        >
          {{ message.error }}
        </p>
        <p v-if="message.status === 'aborted'" class="text-xs uppercase tracking-widest text-stone-500">
          Stopped{{ message.error ? ` — ${message.error}` : '' }}
        </p>
      </div>

      <footer class="mt-3 flex flex-wrap gap-1.5 opacity-60 transition group-hover:opacity-100">
        <template v-if="message.role === 'user'">
          <button
            type="button"
            :class="actionClass"
            :disabled="busy"
            title="Rewind to before this message and load it into the composer"
            @click="editAndRewind"
          >
            Edit &amp; rewind
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            :class="actionClass"
            :disabled="busy || isLeaf"
            title="Rewind the conversation to this point (later messages stay in a branch)"
            @click="setLeaf(message.id)"
          >
            Rewind here
          </button>
          <button
            type="button"
            :class="actionClass"
            :disabled="busy || !apiKey"
            title="Run the agent again for the same message (new branch)"
            @click="regenerate(message)"
          >
            Retry
          </button>
        </template>
        <button type="button" :class="actionClass" @click="copyText">Copy</button>
        <button type="button" :class="actionClass" :disabled="busy" title="Delete this branch" @click="removeBranch">
          Delete
        </button>
      </footer>
    </div>
  </article>
</template>
