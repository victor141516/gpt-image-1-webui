<script setup lang="ts">
import { computed, ref } from 'vue'
import { send, stop } from '../lib/chat'
import { imageModels } from '../lib/models'
import {
  AGENT,
  apiKey,
  FORMAT_OPTIONS,
  N_OPTIONS,
  QUALITY_OPTIONS,
  settings,
  SIZE_PRESETS,
} from '../lib/settings'
import { images, running } from '../lib/store'
import { attachFiles, composerAttachments, composerText, settingsOpen } from '../lib/ui'
import ImageThumb from './ImageThumb.vue'

const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)

const busy = computed(() => running.value !== null)
const canSend = computed(
  () =>
    !busy.value &&
    apiKey.value.trim().length > 0 &&
    (composerText.value.trim().length > 0 || composerAttachments.value.length > 0),
)
const sizeIsPreset = computed(() => SIZE_PRESETS.some((o) => o.value === settings.value.size))

async function submit() {
  if (!canSend.value) return
  const text = composerText.value.trim()
  const attachments = composerAttachments.value.filter((id) => images.has(id)).map((imageId) => ({ imageId }))
  composerText.value = ''
  composerAttachments.value = []
  await send(text, attachments)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void submit()
  }
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) await attachFiles([...input.files])
  input.value = ''
}

async function onPaste(event: ClipboardEvent) {
  const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  await attachFiles(files)
}

async function onDrop(event: DragEvent) {
  dragging.value = false
  await attachFiles([...(event.dataTransfer?.files ?? [])])
}

const selectClass =
  'max-w-40 truncate rounded-full border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 outline-none focus:border-cyan-300'
</script>

<template>
  <form
    class="relative border-t border-stone-800 bg-stone-950/95 p-3 sm:p-4"
    @submit.prevent="submit"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-cyan-300/70 bg-cyan-950/60 text-sm font-semibold text-cyan-100"
    >
      Drop images to attach
    </div>

    <div v-if="composerAttachments.length" class="mb-3 flex flex-wrap gap-2">
      <div v-for="id in composerAttachments" :key="id" class="relative">
        <ImageThumb :image-id="id" size="sm" />
        <button
          type="button"
          class="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-stone-800 text-xs text-stone-200 ring-1 ring-stone-600 hover:bg-rose-600"
          title="Remove attachment"
          @click="composerAttachments = composerAttachments.filter((x) => x !== id)"
        >
          ×
        </button>
      </div>
    </div>

    <textarea
      v-model="composerText"
      rows="3"
      :placeholder="
        apiKey ? 'Describe what you want. Attach, paste or drop images anytime…' : 'Add your OpenAI API key in Settings first.'
      "
      class="w-full resize-y rounded-3xl border border-stone-700 bg-stone-900 px-5 py-3 text-base text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
      @keydown="onKeydown"
      @paste="onPaste"
    />

    <div class="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="rounded-full border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-200 transition hover:border-cyan-300/60"
        @click="fileInput?.click()"
      >
        + Images
      </button>
      <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFiles" />

      <select v-model="settings.imageModel" :class="selectClass" title="Image model">
        <option v-for="m in imageModels" :key="m.value" :value="m.value">{{ m.label }}</option>
        <option v-if="!imageModels.some((m) => m.value === settings.imageModel)" :value="settings.imageModel">
          {{ settings.imageModel }}
        </option>
      </select>
      <select v-model="settings.size" :class="selectClass" title="Size">
        <option v-for="o in SIZE_PRESETS" :key="o.value" :value="o.value">{{ o.value === AGENT ? 'Size: agent' : o.label }}</option>
        <option v-if="!sizeIsPreset" :value="settings.size">{{ settings.size }}</option>
      </select>
      <select v-model="settings.quality" :class="selectClass" class="hidden sm:block" title="Quality">
        <option v-for="o in QUALITY_OPTIONS" :key="o.value" :value="o.value">Quality: {{ o.label }}</option>
      </select>
      <select v-model="settings.outputFormat" :class="selectClass" class="hidden sm:block" title="Output format">
        <option v-for="o in FORMAT_OPTIONS" :key="o.value" :value="o.value">{{ o.label.toUpperCase() }}</option>
      </select>
      <select v-model="settings.n" :class="selectClass" class="hidden sm:block" title="Images per call">
        <option v-for="o in N_OPTIONS" :key="o.value" :value="o.value">n: {{ o.label }}</option>
      </select>
      <button
        type="button"
        class="text-xs font-semibold text-stone-400 underline-offset-4 hover:text-cyan-200 hover:underline"
        @click="settingsOpen = true"
      >
        All parameters…
      </button>

      <div class="ml-auto">
        <button
          v-if="busy"
          type="button"
          class="rounded-full bg-rose-400 px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-rose-300"
          @click="stop"
        >
          Stop
        </button>
        <button
          v-else
          type="submit"
          :disabled="!canSend"
          class="rounded-full bg-cyan-300 px-5 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/50 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400 disabled:shadow-none"
        >
          Send
        </button>
      </div>
    </div>
  </form>
</template>
