<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { refreshModels } from './lib/models'
import { apiKey, settings } from './lib/settings'
import {
  activePath,
  conversation,
  fastForward,
  hiddenAfterLeaf,
  init,
  ready,
  renameConversation,
  running,
} from './lib/store'
import { notice, settingsOpen, sidebarOpen } from './lib/ui'
import Composer from './components/Composer.vue'
import ImageAnnotator from './components/ImageAnnotator.vue'
import ImageViewer from './components/ImageViewer.vue'
import MessageItem from './components/MessageItem.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import Sidebar from './components/Sidebar.vue'

const scroller = ref<HTMLElement>()
const content = ref<HTMLElement>()
const editingTitle = ref(false)
const titleDraft = ref('')

// Keep the newest content in view while the agent streams, unless the user scrolled up.
let pinned = true
let lastTop = 0
function onScroll() {
  const el = scroller.value
  if (!el) return
  const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  // Only an upward scroll that leaves the end unpins; layout shifts and clamping keep the pin.
  if (nearEnd) pinned = true
  else if (el.scrollTop < lastTop) pinned = false
  lastTop = el.scrollTop
}
function scrollToEnd() {
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}
const resizeObserver = new ResizeObserver(() => {
  if (pinned) scrollToEnd()
})

onMounted(() => {
  void init()
  if (content.value) resizeObserver.observe(content.value)
})
onBeforeUnmount(() => resizeObserver.disconnect())

let refreshTimer: number | undefined
watch(
  [apiKey, () => settings.value.baseURL],
  ([key, baseURL]) => {
    clearTimeout(refreshTimer)
    if (key.trim()) refreshTimer = window.setTimeout(() => refreshModels(key.trim(), baseURL), 400)
  },
  { immediate: true },
)

// A new message, branch switch or conversation always jumps to the end.
watch(
  () => [conversation.value?.id, conversation.value?.leafId],
  async () => {
    pinned = true
    await nextTick()
    scrollToEnd()
  },
)

function startRename() {
  if (!conversation.value) return
  titleDraft.value = conversation.value.title
  editingTitle.value = true
}

async function commitRename() {
  editingTitle.value = false
  await renameConversation(titleDraft.value)
}

watch(notice, (value) => {
  if (value) window.setTimeout(() => (notice.value = null), 6000)
})
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-gradient-to-br from-slate-950 via-neutral-950 to-zinc-900 text-stone-100">
    <Sidebar />

    <main class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center gap-3 border-b border-stone-800 bg-stone-950/80 px-4 py-3 backdrop-blur">
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-stone-300 hover:bg-stone-800 lg:hidden"
          aria-label="Conversations"
          @click="sidebarOpen = true"
        >
          ☰
        </button>
        <div class="min-w-0 flex-1">
          <input
            v-if="editingTitle"
            v-model="titleDraft"
            class="w-full rounded-lg border border-stone-700 bg-stone-900 px-2 py-1 font-serif text-lg text-stone-50 outline-none focus:border-cyan-300"
            @keydown.enter="commitRename"
            @keydown.esc="editingTitle = false"
            @blur="commitRename"
          />
          <button
            v-else
            type="button"
            class="block max-w-full truncate text-left font-serif text-lg text-stone-50"
            :title="conversation ? 'Rename' : ''"
            @click="startRename"
          >
            {{ conversation?.title ?? 'Image studio' }}
          </button>
          <p class="truncate text-xs text-stone-500">
            Agent {{ settings.chatModel }} · Images {{ settings.imageModel }}
            <span v-if="running" class="ml-1 animate-pulse text-cyan-300">● working</span>
          </p>
        </div>
        <span
          class="hidden rounded-full border px-3 py-1 text-xs font-semibold sm:inline"
          :class="apiKey ? 'border-emerald-400/30 text-emerald-200' : 'border-amber-400/40 text-amber-200'"
        >
          {{ apiKey ? 'Key ready' : 'Key needed' }}
        </span>
        <button
          type="button"
          class="rounded-full border border-stone-700 px-3 py-1.5 text-sm font-semibold text-stone-200 hover:border-cyan-300/60"
          @click="settingsOpen = !settingsOpen"
        >
          Settings
        </button>
      </header>

      <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]" @scroll.passive="onScroll">
        <div ref="content" class="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 py-6 sm:px-6">
          <div
            v-if="ready && !activePath.length && !hiddenAfterLeaf"
            class="mx-auto mt-10 max-w-lg rounded-3xl border border-dashed border-stone-700 bg-stone-900/40 p-8 text-center"
          >
            <p class="font-serif text-3xl text-stone-100">Describe it. Show it. Iterate.</p>
            <p class="mt-3 text-sm leading-6 text-stone-400">
              An agent plans each request and drives the image model for you: it writes the prompts, picks which images to
              edit or combine, and checks the results. Attach images to any message, paint masks or sketch markups, and
              rewind to any point of the conversation to branch off.
            </p>
            <button
              v-if="!apiKey"
              type="button"
              class="mt-5 rounded-full bg-cyan-300 px-5 py-2 text-sm font-bold text-slate-950"
              @click="settingsOpen = true"
            >
              Add your OpenAI API key
            </button>
          </div>

          <MessageItem v-for="message in activePath" :key="message.id" :message="message" />

          <div
            v-if="hiddenAfterLeaf && !running"
            class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/25 bg-amber-950/20 px-4 py-3 text-sm"
          >
            <span class="text-amber-100">
              Rewound. {{ hiddenAfterLeaf }} later message{{ hiddenAfterLeaf === 1 ? '' : 's' }} kept in a branch; sending
              now starts a new branch from here.
            </span>
            <button
              type="button"
              class="rounded-full border border-amber-300/40 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-300/10"
              @click="fastForward"
            >
              Restore later messages
            </button>
          </div>
        </div>
      </div>

      <div class="mx-auto w-full max-w-4xl">
        <Composer />
      </div>
    </main>

    <SettingsPanel />
    <ImageViewer />
    <ImageAnnotator />

    <div
      v-if="notice"
      class="fixed bottom-4 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-2xl border border-rose-400/30 bg-rose-950/90 px-4 py-3 text-sm text-rose-100 shadow-xl"
    >
      {{ notice }}
    </div>
  </div>
</template>
