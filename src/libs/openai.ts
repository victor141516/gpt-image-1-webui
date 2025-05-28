const MODEL_NAME = 'gpt-image-1'

export async function generateImage({
  text,
  image,
  resolution,
  apiKey,
}: {
  text: string
  image?: File
  resolution: { width: number; height: number }
  apiKey: string
}) {
  const size = `${resolution.width}x${resolution.height}`
  let response: any
  try {
    if (image) {
      const formData = new FormData()
      formData.append('model', MODEL_NAME)
      formData.append('prompt', text)
      formData.append('size', size)
      formData.append('n', '1')
      formData.append('image[]', image)
      response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },

        body: formData,
      }).then(async (r) => {
        if (r.ok) {
          return r.json()
        } else {
          return Promise.reject(
            new Error('Non 200 response: ' + (await r.text()))
          )
        }
      })
    } else {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          prompt: text,
          n: 1,
          size,
        }),
      }).then(async (r) => {
        if (r.ok) {
          return r.json()
        } else {
          return Promise.reject(
            new Error('Non 200 response: ' + (await r.text()))
          )
        }
      })
    }
  } catch (error) {
    console.log('Unexpected error:', error)
    throw (error as any)?.message ?? error?.toString() ?? error
  }

  const imageB64 = response?.data?.[0]?.b64_json
  if (!imageB64) {
    console.error('Unexpected response:', JSON.stringify(response))
  }
  return imageB64 as string | null
}
