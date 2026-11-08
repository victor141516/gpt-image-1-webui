<script setup lang="ts">
import { conversation, deleteConversation, openConversation, running, startConversation, summaries } from '../lib/store'
import { composerAttachments, composerText, sidebarOpen } from '../lib/ui'

function resetComposer() {
  composerText.value = ''
  composerAttachments.value = []
  sidebarOpen.value = false
}

async function open(id: string) {
  if (running.value || conversation.value?.id === id) return
  await openConversation(id)
  resetComposer()
}

function create() {
  if (running.value) return
  startConversation()
  resetComposer()
}

async function remove(id: string, title: string) {
  if (confirm(`Delete "${title}" and all its images?`)) await deleteConversation(id)
}

const formatDate = (time: number) =>
  new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <nav
    class="fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-stone-800 bg-stone-950 transition-transform duration-200 lg:static lg:translate-x-0"
    :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="border-b border-stone-800 p-4">
      <p class="text-xs font-semibold uppercase tracking-widest text-cyan-300">Image studio</p>
      <button
        type="button"
        :disabled="running !== null"
        class="mt-3 w-full rounded-full bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
        @click="create"
      >
        New conversation
      </button>
    </div>
    <ul class="flex-1 space-y-1 overflow-y-auto p-2">
      <li v-for="item in summaries" :key="item.id" class="group relative">
        <button
          type="button"
          :disabled="running !== null"
          class="w-full rounded-xl px-3 py-2 text-left transition disabled:cursor-not-allowed"
          :class="conversation?.id === item.id ? 'bg-stone-800/80 text-stone-50' : 'text-stone-300 hover:bg-stone-900'"
          @click="open(item.id)"
        >
          <span class="block truncate pr-6 text-sm">{{ item.title }}</span>
          <span class="block text-xs text-stone-500">{{ formatDate(item.updatedAt) }}</span>
        </button>
        <button
          type="button"
          class="absolute right-2 top-2 hidden rounded px-1.5 text-stone-500 hover:bg-stone-700 hover:text-rose-200 group-hover:block"
          title="Delete conversation"
          @click="remove(item.id, item.title)"
        >
          ×
        </button>
      </li>
      <li v-if="!summaries.length" class="px-3 py-4 text-sm text-stone-500">No saved conversations yet.</li>
    </ul>
    <p class="border-t border-stone-800 p-4 text-xs leading-5 text-stone-500">
      Conversations and images are stored in this browser (IndexedDB).
    </p>
  </nav>
  <div v-if="sidebarOpen" class="fixed inset-0 z-20 bg-black/60 lg:hidden" @click="sidebarOpen = false" />
</template>
