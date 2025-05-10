# [img.viti.site](https://img.viti.site)

A simple Vue.js application for generating AI images using OpenAI's GPT-image-1 model.

## Features

- Generate images from text prompts
- Edit existing images with text instructions
- Choose from multiple resolution options (1024x1024, 1024x1536, 1536x1024)
- Local storage for your OpenAI API key
- Clean, responsive UI with Tailwind CSS

## Technologies

- Vue.js 3 with Composition API
- TypeScript
- Tailwind CSS 4
- Vite
- OpenAI API (GPT-image-1)
- VueUse for composable utilities

## Prerequisites

- Node.js (latest LTS version recommended)
- OpenAI API key with access to GPT-image-1

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/img.viti.site.git
cd img.viti.site

Install dependencies:
bun install

Start the development server:
bun run dev

Build for production:
bun run build
Usage
Enter your OpenAI API key in the password field
Type a descriptive prompt in the text field
(Optional) Upload an image if you want to edit an existing image
Select your desired resolution
Click "Generate Image"
View your generated images in the gallery below
Configuration
The API key is stored in your browser's local storage for convenience
You can modify the default resolutions in the App.vue file
Tailwind CSS can be customized as needed
Security NoteYour OpenAI API key is stored locally in your browser and is sent directly to the OpenAI API. It is never transmitted to or stored on our servers.LicenseMITContributingContributions are welcome! Please feel free to submit a Pull Request.
```
