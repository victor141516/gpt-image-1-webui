import { ref } from 'vue'
import { addImage, conversation, startConversation } from './store'
import { readAsDataUrl } from './image-utils'
import type { ImageSource } from './types'

export const composerText = ref('')
/** Image ids attached to the message being written. */
export const composerAttachments = ref<string[]>([])
export const viewerImageId = ref<string | null>(null)
export const annotateTarget = ref<{ imageId: string; mode: 'mask' | 'markup' } | null>(null)
export const settingsOpen = ref(false)
export const sidebarOpen = ref(false)
export const notice = ref<string | null>(null)

export function attachImage(imageId: string) {
  if (!composerAttachments.value.includes(imageId)) composerAttachments.value.push(imageId)
}

export async function attachFiles(files: Iterable<File>) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    try {
      if (!conversation.value) startConversation()
      const record = await addImage({
        dataUrl: await readAsDataUrl(file),
        mediaType: file.type,
        source: 'upload',
        name: file.name,
      })
      attachImage(record.id)
    } catch (error) {
      notice.value = `Could not attach ${file.name}: ${error instanceof Error ? error.message : error}`
    }
  }
}

export async function attachDrawing(dataUrl: string, source: Extract<ImageSource, 'mask' | 'markup'>, targetId: string) {
  const record = await addImage({ dataUrl, mediaType: 'image/png', source, targetId })
  attachImage(targetId)
  attachImage(record.id)
}
