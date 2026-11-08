<script setup lang="ts">
import { computed } from 'vue'
import type { ToolPart } from '../lib/types'
import { imageByLabel } from '../lib/store'
import ImageThumb from './ImageThumb.vue'

const props = defineProps<{ part: ToolPart }>()

const title = computed(() => (props.part.toolName === 'edit_image' ? 'Edit image' : 'Generate image'))
const prompt = computed(() => {
  if (typeof props.part.input?.prompt === 'string') return props.part.input.prompt
  const match = /"prompt"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(props.part.inputText)
  if (!match) return ''
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return match[1]
  }
})
const inputLabels = computed(() => {
  const input = props.part.input
  if (!input) return []
  const labels = Array.isArray(input.images) ? (input.images as string[]) : []
  return [
    ...labels.map((label) => ({ label, role: 'input' })),
    ...(['mask', 'markup'] as const)
      .filter((key) => typeof input[key] === 'string' && input[key])
      .map((key) => ({ label: input[key] as string, role: key })),
  ]
})
const params = computed(() => {
  const request = props.part.request
  if (!request) return []
  const skip: Record<string, true> = { endpoint: true, prompt: true, images: true, mask: true, markup: true }
  return Object.entries(request)
    .filter(([key]) => !skip[key])
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
})
const usage = computed(() => {
  const usage = props.part.output?.usage
  if (!usage) return ''
  const parts = [
    usage.input_tokens != null && `${usage.input_tokens} in`,
    usage.output_tokens != null && `${usage.output_tokens} out`,
  ].filter(Boolean)
  return parts.length ? `${parts.join(' / ')} tokens` : ''
})
const duration = computed(() => {
  const end = props.part.endedAt
  return end ? `${((end - props.part.startedAt) / 1000).toFixed(1)}s` : ''
})
</script>

<template>
  <div class="rounded-2xl border border-stone-800 bg-stone-900/70 p-3">
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="font-semibold uppercase tracking-widest text-amber-200">{{ title }}</span>
      <span
        class="rounded-full px-2 py-0.5 font-semibold"
        :class="{
          'bg-stone-700/60 text-stone-300': part.state === 'input',
          'animate-pulse bg-cyan-400/15 text-cyan-200': part.state === 'running',
          'bg-emerald-400/15 text-emerald-200': part.state === 'done',
          'bg-rose-400/15 text-rose-200': part.state === 'error',
        }"
      >
        {{ { input: 'writing prompt…', running: 'rendering…', done: 'done', error: 'failed' }[part.state] }}
      </span>
      <span v-if="duration" class="text-stone-500">{{ duration }}</span>
      <span v-if="usage" class="text-stone-500">{{ usage }}</span>
    </div>

    <p v-if="prompt" class="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-300">{{ prompt }}</p>

    <div v-if="inputLabels.length" class="mt-2 flex flex-wrap items-center gap-2">
      <template v-for="item in inputLabels" :key="item.role + item.label">
        <span class="text-[11px] uppercase tracking-wider text-stone-500">{{ item.role }}</span>
        <ImageThumb v-if="imageByLabel(item.label)" :image-id="imageByLabel(item.label)!.id" size="sm" />
        <span v-else class="font-mono text-xs text-rose-300">{{ item.label }}?</span>
      </template>
    </div>

    <div v-if="params.length" class="mt-2 flex flex-wrap gap-1.5">
      <span
        v-for="param in params"
        :key="param"
        class="rounded-md border border-stone-700/80 bg-stone-950/60 px-1.5 py-0.5 font-mono text-[11px] text-stone-400"
      >
        {{ param }}
      </span>
    </div>

    <div v-if="part.state === 'running'" class="mt-3">
      <img
        v-if="part.partial"
        :src="part.partial"
        alt="Partial preview"
        class="max-h-[28rem] w-full rounded-xl object-contain opacity-80 blur-[1px]"
      />
      <div
        v-else
        class="h-56 animate-pulse rounded-xl border border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-cyan-950"
      />
    </div>

    <p v-if="part.state === 'error'" class="mt-2 whitespace-pre-wrap text-sm text-rose-200">{{ part.error }}</p>

    <div v-if="part.output?.images.length" class="mt-3 grid gap-2" :class="part.output.images.length > 1 ? 'grid-cols-2' : ''">
      <ImageThumb v-for="id in part.output.images" :key="id" :image-id="id" size="lg" />
    </div>
  </div>
</template>
