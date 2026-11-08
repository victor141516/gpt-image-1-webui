<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { images } from '../lib/store'
import { annotateTarget, attachDrawing, notice } from '../lib/ui'

const layer = ref<HTMLCanvasElement>()
const brush = ref(6)
const color = ref('#ff3b30')
const erasing = ref(false)
const saving = ref(false)
const history: ImageData[] = []
let drawing = false
let last: { x: number; y: number } | null = null

const target = computed(() => (annotateTarget.value ? images.get(annotateTarget.value.imageId) : undefined))
const mode = computed(() => annotateTarget.value?.mode ?? 'mask')
/** Brush diameter in image pixels: percentage of the longest edge. */
const brushPx = computed(() => Math.max(1, ((target.value ? Math.max(target.value.width, target.value.height) : 1024) * brush.value) / 100))

watch(
  target,
  async (record) => {
    history.length = 0
    if (!record) return
    erasing.value = false
    brush.value = mode.value === 'mask' ? 6 : 1.2
    await nextTick()
    const canvas = layer.value!
    canvas.width = record.width
    canvas.height = record.height
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
  },
  { immediate: true },
)

function point(event: PointerEvent) {
  const canvas = layer.value!
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  }
}

function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
  const ctx = layer.value!.getContext('2d')!
  ctx.globalCompositeOperation = erasing.value ? 'destination-out' : 'source-over'
  ctx.strokeStyle = mode.value === 'mask' ? 'rgba(217, 70, 239, 1)' : color.value
  ctx.lineWidth = brushPx.value
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function onDown(event: PointerEvent) {
  const canvas = layer.value!
  canvas.setPointerCapture(event.pointerId)
  history.push(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height))
  if (history.length > 30) history.shift()
  drawing = true
  last = point(event)
  stroke(last, last)
}

function onMove(event: PointerEvent) {
  if (!drawing || !last) return
  const next = point(event)
  stroke(last, next)
  last = next
}

function onUp() {
  drawing = false
  last = null
}

function undo() {
  const snapshot = history.pop()
  if (snapshot) layer.value!.getContext('2d')!.putImageData(snapshot, 0, 0)
}

function clear() {
  const canvas = layer.value!
  history.push(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height))
  canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
}

function close() {
  annotateTarget.value = null
}

/** Builds the PNG the API expects: masks are opaque with transparent holes; markups are the stroke layer. */
function exportPng() {
  const source = layer.value!
  if (mode.value === 'markup') return source.toDataURL('image/png')
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(source, 0, 0)
  return out.toDataURL('image/png')
}

async function save() {
  if (!target.value) return
  saving.value = true
  try {
    await attachDrawing(exportPng(), mode.value, target.value.id)
    close()
  } catch (error) {
    notice.value = `Could not save the ${mode.value}: ${error instanceof Error ? error.message : error}`
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="target" class="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true">
    <div class="flex flex-wrap items-center gap-3 border-b border-stone-800 bg-stone-950 px-4 py-3 text-sm">
      <span class="font-semibold" :class="mode === 'mask' ? 'text-fuchsia-200' : 'text-amber-200'">
        {{ mode === 'mask' ? 'Paint the area to change' : 'Sketch / annotate' }} · {{ target.label }}
      </span>
      <label class="flex items-center gap-2 text-stone-300">
        Brush
        <input v-model.number="brush" type="range" min="0.3" max="20" step="0.1" class="accent-cyan-300" />
      </label>
      <label v-if="mode === 'markup'" class="flex items-center gap-2 text-stone-300">
        Colour <input v-model="color" type="color" class="h-7 w-10 rounded bg-transparent" />
      </label>
      <label class="flex items-center gap-2 text-stone-300">
        <input v-model="erasing" type="checkbox" class="accent-cyan-300" /> Eraser
      </label>
      <button type="button" class="rounded-full border border-stone-700 px-3 py-1 text-stone-200 hover:bg-stone-800" @click="undo">Undo</button>
      <button type="button" class="rounded-full border border-stone-700 px-3 py-1 text-stone-200 hover:bg-stone-800" @click="clear">Clear</button>
      <div class="ml-auto flex gap-2">
        <button type="button" class="rounded-full px-4 py-1.5 text-stone-300 hover:bg-stone-800" @click="close">Cancel</button>
        <button
          type="button"
          :disabled="saving"
          class="rounded-full bg-cyan-300 px-4 py-1.5 font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50"
          @click="save"
        >
          Attach {{ mode }}
        </button>
      </div>
    </div>
    <div class="checker-dark flex min-h-0 flex-1 items-center justify-center p-4">
      <div class="relative inline-block max-h-full max-w-full">
        <img :src="target.dataUrl" :alt="target.label" class="block max-h-[calc(100vh-8rem)] max-w-full select-none" draggable="false" />
        <canvas
          ref="layer"
          class="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          :class="mode === 'mask' ? 'opacity-55' : ''"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        />
      </div>
    </div>
    <p class="bg-stone-950 px-4 py-2 text-xs text-stone-500">
      {{
        mode === 'mask'
          ? 'Painted pixels become transparent in the mask: the model repaints only there. Then describe the change in your message.'
          : 'Your strokes are sent as a transparent markup overlay on the image. Describe what the marks mean in your message.'
      }}
    </p>
  </div>
</template>
