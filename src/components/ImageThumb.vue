<script setup lang="ts">
import { computed } from 'vue'
import { images } from '../lib/store'
import { viewerImageId } from '../lib/ui'

const props = defineProps<{ imageId: string; size?: 'sm' | 'md' | 'lg' }>()
const record = computed(() => images.get(props.imageId))
const box = computed(
  () =>
    ({
      sm: 'h-16 w-16',
      md: 'h-40 w-40 sm:h-48 sm:w-48',
      lg: 'max-h-[28rem] w-full',
    })[props.size ?? 'md'],
)
const kindClass = computed(() =>
  record.value?.source === 'mask'
    ? 'bg-fuchsia-500/90'
    : record.value?.source === 'markup'
      ? 'bg-amber-500/90'
      : 'bg-stone-950/80',
)
</script>

<template>
  <button
    v-if="record"
    type="button"
    class="checker group relative overflow-hidden rounded-xl border border-stone-700/80 transition hover:border-cyan-300/70"
    :class="size === 'lg' ? 'block w-full' : 'inline-block'"
    :title="`${record.label}${record.name ? ' · ' + record.name : ''} — click for details`"
    @click="viewerImageId = record.id"
  >
    <img :src="record.dataUrl" :alt="record.label" class="object-contain" :class="box" loading="lazy" />
    <span
      class="absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white"
      :class="kindClass"
    >
      {{ record.label }}{{ record.source === 'mask' ? ' · mask' : record.source === 'markup' ? ' · markup' : '' }}
    </span>
  </button>
  <div v-else class="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-stone-700 text-xs text-stone-500">
    missing
  </div>
</template>
