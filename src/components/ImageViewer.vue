<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { images } from '../lib/store'
import { downloadDataUrl, extensionFor } from '../lib/image-utils'
import { annotateTarget, attachImage, viewerImageId } from '../lib/ui'

const record = computed(() => (viewerImageId.value ? images.get(viewerImageId.value) : undefined))
const target = computed(() => (record.value?.targetId ? images.get(record.value.targetId) : undefined))
const editable = computed(() => record.value && record.value.source !== 'mask' && record.value.source !== 'markup')
const request = computed(() => {
  const params = record.value?.generation?.params
  if (!params) return ''
  const { prompt: _prompt, ...rest } = params
  return JSON.stringify(rest, null, 2)
})

function close() {
  viewerImageId.value = null
}

function annotate(mode: 'mask' | 'markup') {
  if (!record.value) return
  annotateTarget.value = { imageId: record.value.id, mode }
  close()
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    v-if="record"
    class="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm lg:flex-row"
    role="dialog"
    aria-modal="true"
    @click.self="close"
  >
    <div class="checker-dark flex min-h-0 flex-1 items-center justify-center p-4" @click.self="close">
      <img :src="record.dataUrl" :alt="record.label" class="max-h-full max-w-full object-contain shadow-2xl" />
    </div>
    <aside class="max-h-[45vh] w-full overflow-y-auto border-t border-stone-800 bg-stone-950 p-5 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
      <div class="flex items-center justify-between">
        <h2 class="font-mono text-lg text-stone-50">{{ record.label }}</h2>
        <button type="button" class="rounded-full px-3 py-1 text-stone-400 hover:bg-stone-800" @click="close">Close</button>
      </div>
      <p class="mt-1 text-sm text-stone-400">
        {{ record.width }}×{{ record.height }} · {{ record.mediaType }} · {{ record.source }}
        <template v-if="target"> · on {{ target.label }}</template>
      </p>
      <p v-if="record.name" class="mt-1 truncate text-sm text-stone-500">{{ record.name }}</p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-full bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-200"
          @click="attachImage(record.id); close()"
        >
          Attach to message
        </button>
        <button
          type="button"
          class="rounded-full border border-stone-600 px-4 py-2 text-sm font-semibold text-stone-200 hover:bg-stone-800"
          @click="downloadDataUrl(record.dataUrl, `${record.label}.${extensionFor(record.mediaType)}`)"
        >
          Download
        </button>
        <template v-if="editable">
          <button
            type="button"
            class="rounded-full border border-fuchsia-400/50 px-4 py-2 text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-500/10"
            title="Paint the area that should change"
            @click="annotate('mask')"
          >
            Paint mask
          </button>
          <button
            type="button"
            class="rounded-full border border-amber-400/50 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/10"
            title="Sketch or annotate on top of the image (GPT Image 2.5+)"
            @click="annotate('markup')"
          >
            Draw markup
          </button>
        </template>
      </div>

      <template v-if="record.generation">
        <h3 class="mt-6 text-xs font-semibold uppercase tracking-widest text-stone-500">Prompt</h3>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-200">{{ record.generation.prompt }}</p>
        <h3 class="mt-5 text-xs font-semibold uppercase tracking-widest text-stone-500">Request</h3>
        <pre class="mt-2 overflow-x-auto rounded-xl bg-stone-900 p-3 text-xs text-stone-300">{{ request }}</pre>
      </template>
    </aside>
  </div>
</template>
