<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { ref } from 'vue'
import { generateImage } from './libs/openai'

const promptValue = ref('')
const resolutionValue = ref({ width: 1024, height: 1024 })
const images = ref([] as Array<{ url: string; height: number; width: number }>)
const openAiApiKey = useStorage('openai-key', '')
const inputImage = ref<File>()
const isGenerating = ref(false)

const onFileSelected = (event: Event) => {
  const selectedFile =
    event?.target &&
    'files' in event?.target &&
    event?.target.files instanceof FileList &&
    event?.target.files?.['0'] &&
    event?.target.files?.['0'] instanceof File &&
    event?.target.files?.['0']

  if (!selectedFile) {
    alert('what happened?')
    console.log(event)
    return
  }

  inputImage.value = selectedFile
}

const onSubmit = async () => {
  isGenerating.value = true
  const imageB64 = await generateImage({
    text: promptValue.value,
    image: inputImage.value,
    resolution: resolutionValue.value,
    apiKey: openAiApiKey.value,
  })
  isGenerating.value = false

  if (imageB64) {
    images.value.unshift({
      url: `data:image/png;base64,${imageB64}`,
      ...resolutionValue.value,
    })
  }
}
</script>

<template>
  <div class="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
    <h2 class="text-2xl font-bold text-gray-800 mb-4">Image Generator</h2>

    <input
      type="password"
      placeholder="OpenAI API Key"
      v-model="openAiApiKey"
      class="w-full px-4 py-2 mb-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
    />

    <form @submit.prevent="onSubmit" class="flex flex-col gap-3">
      <div class="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Prompt"
          v-model="promptValue"
          class="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />

        <label
          class="flex flex-col items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md border border-gray-300 cursor-pointer hover:bg-gray-200 transition"
        >
          <span class="text-sm">Input image</span>
          <span class="text-xs" :class="{ 'opacity-0': !inputImage }">{{
            (inputImage?.name ?? 'file').slice(0, 20)
          }}</span>
          <input
            type="file"
            id="imageInput"
            accept="image/*"
            @change="onFileSelected"
            class="hidden"
          />
        </label>
      </div>

      <select
        v-model="resolutionValue"
        placeholder="Resolution (e.g. 1024x1024)"
        class="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      >
        <option default :value="{ width: 1024, height: 1024 }">
          1024x1024
        </option>
        <option :value="{ width: 1024, height: 1536 }">1024x1536</option>
        <option :value="{ width: 1536, height: 1024 }">1536x1024</option>
      </select>

      <button
        :disabled="isGenerating"
        type="submit"
        class="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {{ isGenerating ? 'Generating...' : 'Generate Image' }}
      </button>
    </form>

    <div class="mt-6 space-y-4">
      <div
        v-for="{ url, height, width } in images"
        class="border border-gray-200 rounded-lg overflow-hidden shadow-sm"
      >
        <img
          :width="width"
          :height="height"
          :src="url"
          class="w-full h-auto object-cover"
        />
      </div>
    </div>
  </div>
</template>
