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
const error = ref<any>(null)
const showErrorPopup = ref(false)

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
  error.value = null
  showErrorPopup.value = false

  try {
    const imageB64 = await generateImage({
      text: promptValue.value,
      image: inputImage.value,
      resolution: resolutionValue.value,
      apiKey: openAiApiKey.value,
    })

    if (imageB64) {
      images.value.unshift({
        url: `data:image/png;base64,${imageB64}`,
        ...resolutionValue.value,
      })
    }
  } catch (err) {
    error.value = err
    showErrorPopup.value = true
  } finally {
    isGenerating.value = false
  }
}

const downloadImage = (url: string, index: number) => {
  const a = document.createElement('a')
  a.href = url
  a.download = `image-${index + 1}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const useAsInput = async (url: string, index: number) => {
  try {
    const response = await fetch(url)
    const blob = await response.blob()

    const file = new File([blob], `generated-image-${index + 1}.png`, {
      type: 'image/png',
      lastModified: Date.now(),
    })

    inputImage.value = file
  } catch (err) {
    console.error('Error al usar imagen como input:', err)
    alert('Error al usar la imagen como input')
  }
}

const closeErrorPopup = () => {
  showErrorPopup.value = false
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
        v-for="({ url, height, width }, index) in images"
        :key="index"
        class="border border-gray-200 rounded-lg overflow-hidden shadow-sm relative group"
      >
        <img
          :width="width"
          :height="height"
          :src="url"
          class="w-full h-auto object-cover"
        />

        <button
          @click="useAsInput(url, index)"
          class="absolute bottom-3 right-14 bg-green-600 text-white p-2 rounded-full shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition opacity-0 group-hover:opacity-100"
          title="Use as input image"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </button>

        <button
          @click="downloadImage(url, index)"
          class="absolute bottom-3 right-3 bg-indigo-600 text-white p-2 rounded-full shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition opacity-0 group-hover:opacity-100"
          title="Download image"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Error Popup -->
    <div
      v-if="showErrorPopup"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div
        class="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-auto"
      >
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-xl font-bold text-red-600">Error</h3>
          <button
            @click="closeErrorPopup"
            class="text-gray-400 hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div class="text-gray-700">
          <p class="mb-2">An error occurred while generating the image:</p>
          <div class="bg-gray-100 p-3 rounded-md overflow-auto max-h-[300px]">
            <pre class="text-sm whitespace-pre-wrap">{{
              error || 'Unknown error'
            }}</pre>
            <div
              v-if="error?.response"
              class="mt-2 pt-2 border-t border-gray-300"
            >
              <h4 class="font-bold mb-1">Response:</h4>
              <pre class="text-sm whitespace-pre-wrap">{{
                JSON.stringify(error.response?.data || {}, null, 2)
              }}</pre>
            </div>
          </div>
        </div>
        <button
          @click="closeErrorPopup"
          class="mt-4 px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
