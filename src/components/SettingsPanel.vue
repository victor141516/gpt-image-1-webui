<script setup lang="ts">
import { computed } from 'vue'
import { chatModels, imageModelInfo, imageModels, modelsError, refreshModels } from '../lib/models'
import {
  apiKey,
  BACKGROUND_OPTIONS,
  COMPLEXITY_OPTIONS,
  DETAIL_OPTIONS,
  EFFORT_OPTIONS,
  FIDELITY_OPTIONS,
  FORMAT_OPTIONS,
  MODERATION_OPTIONS,
  N_OPTIONS,
  parseSize,
  QUALITY_OPTIONS,
  resetSettings,
  SERVICE_TIER_OPTIONS,
  settings,
  SIZE_PRESETS,
  SUMMARY_OPTIONS,
  VERBOSITY_OPTIONS,
  AGENT,
} from '../lib/settings'
import { settingsOpen } from '../lib/ui'

const customSize = computed(() =>
  SIZE_PRESETS.some((o) => o.value === settings.value.size) ? '' : settings.value.size,
)
function setCustomSize(event: Event) {
  settings.value.size = (event.target as HTMLInputElement).value.trim() || AGENT
}

const sizeWarning = computed(() => {
  const size = settings.value.size
  if (size === AGENT || size === 'auto') return ''
  const parsed = parseSize(size)
  if (!parsed) return 'Use WIDTHxHEIGHT, e.g. 1536x864.'
  const { width, height } = parsed
  const ratio = Math.max(width, height) / Math.min(width, height)
  if (width % 16 || height % 16) return 'Both edges must be multiples of 16 on GPT Image 2+.'
  if (ratio > 3) return 'Aspect ratio must be between 1:3 and 3:1.'
  if (width * height > 3840 * 2160) return 'Larger than the 3840×2160 maximum.'
  return ''
})

const isGif = computed(() => settings.value.outputFormat === 'gif')
const isSvg = computed(() => settings.value.outputFormat === 'svg')
const supportsCompression = computed(() => ['jpeg', 'webp'].includes(settings.value.outputFormat))

const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-stone-400'
const inputClass =
  'mt-1.5 w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20'
const helpClass = 'mt-1 text-xs leading-5 text-stone-500'
</script>

<template>
  <aside
    class="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-stone-800 bg-stone-950/98 shadow-2xl shadow-black transition-transform duration-200"
    :class="settingsOpen ? 'translate-x-0' : 'translate-x-full'"
    :aria-hidden="!settingsOpen"
  >
    <div class="flex items-center justify-between border-b border-stone-800 px-5 py-4">
      <h2 class="font-serif text-xl text-stone-50">Settings</h2>
      <button type="button" class="rounded-full px-3 py-1 text-stone-400 hover:bg-stone-800" @click="settingsOpen = false">
        Close
      </button>
    </div>

    <div class="flex-1 space-y-8 overflow-y-auto px-5 py-5">
      <section class="space-y-4">
        <h3 class="text-sm font-semibold text-cyan-200">Connection</h3>
        <label class="block">
          <span :class="labelClass">OpenAI API key</span>
          <input v-model="apiKey" type="password" placeholder="sk-..." autocomplete="off" :class="inputClass" />
          <p :class="helpClass">Stored only in this browser and sent directly to the API.</p>
        </label>
        <label class="block">
          <span :class="labelClass">API base URL</span>
          <input v-model="settings.baseURL" :class="inputClass" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span :class="labelClass">Organization</span>
            <input v-model="settings.organization" placeholder="optional" :class="inputClass" />
          </label>
          <label class="block">
            <span :class="labelClass">Project</span>
            <input v-model="settings.project" placeholder="optional" :class="inputClass" />
          </label>
        </div>
        <button
          type="button"
          class="rounded-full border border-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:border-cyan-300/60"
          :disabled="!apiKey"
          @click="refreshModels(apiKey.trim(), settings.baseURL)"
        >
          Refresh model lists
        </button>
        <p v-if="modelsError" class="text-xs text-amber-300">{{ modelsError }}</p>
      </section>

      <section class="space-y-4">
        <h3 class="text-sm font-semibold text-cyan-200">Agent</h3>
        <label class="block">
          <span :class="labelClass">Agent model</span>
          <input v-model="settings.chatModel" list="chat-models" :class="inputClass" />
          <datalist id="chat-models">
            <option v-for="m in chatModels" :key="m" :value="m" />
          </datalist>
          <p :class="helpClass">Vision + tool-calling model that plans, writes prompts and calls the image tools.</p>
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span :class="labelClass">Reasoning effort</span>
            <select v-model="settings.reasoningEffort" :class="inputClass">
              <option v-for="o in EFFORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Reasoning summary</span>
            <select v-model="settings.reasoningSummary" :class="inputClass">
              <option v-for="o in SUMMARY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Verbosity</span>
            <select v-model="settings.textVerbosity" :class="inputClass">
              <option v-for="o in VERBOSITY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Service tier</span>
            <select v-model="settings.serviceTier" :class="inputClass">
              <option v-for="o in SERVICE_TIER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Max steps per turn</span>
            <input v-model.number="settings.maxSteps" type="number" min="1" max="50" :class="inputClass" />
          </label>
          <label class="block">
            <span :class="labelClass">Vision detail</span>
            <select v-model="settings.visionDetail" :class="inputClass">
              <option v-for="o in DETAIL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </div>
        <label class="flex items-start gap-3 text-sm text-stone-300">
          <input v-model="settings.agentSeesResults" type="checkbox" class="mt-1 accent-cyan-300" />
          <span>Agent sees generated images (lets it check and fix results; costs input tokens).</span>
        </label>
        <label class="flex items-start gap-3 text-sm text-stone-300">
          <input v-model="settings.parallelToolCalls" type="checkbox" class="mt-1 accent-cyan-300" />
          <span>Allow parallel image calls in one step.</span>
        </label>
        <label class="block">
          <span :class="labelClass">Custom instructions</span>
          <textarea
            v-model="settings.customInstructions"
            rows="4"
            placeholder="e.g. Always answer in Spanish. Prefer cinematic lighting."
            :class="inputClass"
          />
        </label>
      </section>

      <section class="space-y-4">
        <h3 class="text-sm font-semibold text-cyan-200">Images API</h3>
        <label class="block">
          <span :class="labelClass">Image model</span>
          <input v-model="settings.imageModel" list="image-models" :class="inputClass" />
          <datalist id="image-models">
            <option v-for="m in imageModels" :key="m.value" :value="m.value">{{ m.label }}</option>
          </datalist>
          <p :class="helpClass">{{ imageModelInfo(settings.imageModel).description }}</p>
        </label>
        <label class="block">
          <span :class="labelClass">Size</span>
          <select v-model="settings.size" :class="inputClass">
            <option v-for="o in SIZE_PRESETS" :key="o.value" :value="o.value">{{ o.label }}</option>
            <option v-if="!SIZE_PRESETS.some((o) => o.value === settings.size)" :value="settings.size">
              {{ settings.size }} (custom)
            </option>
          </select>
          <input
            :value="customSize"
            placeholder="custom, e.g. 1920x1088"
            :class="inputClass"
            @change="setCustomSize"
          />
          <p :class="sizeWarning ? 'mt-1 text-xs text-amber-300' : helpClass">
            {{ sizeWarning || 'Any WIDTHxHEIGHT with edges divisible by 16, aspect 1:3–3:1, up to 3840×2160 (GPT Image 2+).' }}
          </p>
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span :class="labelClass">Quality</span>
            <select v-model="settings.quality" :class="inputClass">
              <option v-for="o in QUALITY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Background</span>
            <select v-model="settings.background" :class="inputClass">
              <option v-for="o in BACKGROUND_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Images per call (n)</span>
            <select v-model="settings.n" :class="inputClass" :disabled="isSvg">
              <option v-for="o in N_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Output format</span>
            <select v-model="settings.outputFormat" :class="inputClass">
              <option v-for="o in FORMAT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Moderation</span>
            <select v-model="settings.moderation" :class="inputClass">
              <option v-for="o in MODERATION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Complexity</span>
            <select v-model="settings.complexity" :class="inputClass">
              <option v-for="o in COMPLEXITY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Input fidelity (edits)</span>
            <select v-model="settings.inputFidelity" :class="inputClass">
              <option v-for="o in FIDELITY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span :class="labelClass">Partial images</span>
            <input
              v-model.number="settings.partialImages"
              type="number"
              min="0"
              max="3"
              :disabled="isGif || isSvg"
              :class="inputClass"
            />
          </label>
        </div>
        <p :class="helpClass">Partial images &gt; 0 streams previews while rendering (not available for GIF/SVG).</p>

        <label v-if="supportsCompression" class="block">
          <span :class="labelClass">Output compression: {{ settings.outputCompression }}%</span>
          <input v-model.number="settings.outputCompression" type="range" min="0" max="100" class="mt-2 w-full accent-cyan-300" />
        </label>

        <div v-if="isGif" class="grid grid-cols-2 gap-3">
          <label class="block">
            <span :class="labelClass">GIF frames</span>
            <input v-model.number="settings.frameCount" type="number" min="2" max="16" :class="inputClass" />
          </label>
          <label class="block">
            <span :class="labelClass">Frame duration (ms)</span>
            <input v-model.number="settings.frameDurationMs" type="number" min="20" step="10" :class="inputClass" />
          </label>
        </div>

        <div v-if="isSvg" class="grid grid-cols-2 gap-3">
          <label class="block">
            <span :class="labelClass">SVG author model</span>
            <input v-model="settings.svgModel" placeholder="only if enabled" list="chat-models" :class="inputClass" />
          </label>
          <label class="block">
            <span :class="labelClass">SVG reasoning</span>
            <select v-model="settings.svgReasoningEffort" :class="inputClass">
              <option v-for="o in EFFORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </div>

        <label class="block">
          <span :class="labelClass">Safety identifier</span>
          <input v-model="settings.safetyIdentifier" maxlength="128" placeholder="optional hashed user id" :class="inputClass" />
        </label>
      </section>

      <button
        type="button"
        class="rounded-full border border-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-400 hover:border-rose-400/60 hover:text-rose-200"
        @click="resetSettings"
      >
        Reset settings to defaults
      </button>
    </div>
  </aside>
</template>
