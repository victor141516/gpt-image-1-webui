# [img.viti.site](https://img.viti.site)

Agentic image studio. A tool-calling LLM (default `gpt-6.1-terra`) runs a [Vercel AI SDK](https://ai-sdk.dev) `ToolLoopAgent` in the browser and drives OpenAI's image-only models (`gpt-image-*`) through two tools:

- `generate_image` → `POST /v1/images/generations`
- `edit_image` → `POST /v1/images/edits` (up to 16 input images, optional mask or markup)

The agent writes the prompts, decides which images to edit or combine, can run several calls in parallel, and (optionally) looks at the results to fix mistakes before answering.

## Features

- Attach images to any message (button, paste or drag & drop), or re-attach any earlier image from its viewer.
- Paint masks and draw markup overlays on any image; they are sent as `mask` / `markup` to the edits endpoint.
- Every image gets a stable label (`img_1`, `img_2`, …) that the agent uses to reference it.
- Conversations are trees: rewind to any message, edit a past prompt, retry an answer, switch between branches (‹ 1/2 ›) or restore the rewound messages.
- Streaming text, reasoning summaries, tool calls and partial image previews; Stop aborts the run.
- All Images API parameters are exposed: model, size (presets or any custom `WxH`), quality, background, n, output format (png/webp/jpeg/gif/svg), compression, moderation, complexity, partial images, input fidelity, GIF frames/duration, SVG author model/effort, safety identifier. Size, quality, background and n can be delegated to the agent.
- Agent settings: model, reasoning effort/summary, verbosity, service tier, max steps, parallel tool calls, vision detail, custom instructions; plus API base URL, organization and project.
- Conversations and images persist in IndexedDB; the API key and settings in localStorage. Requests go straight from the browser to the API.

## Development

```bash
bun install
bun run dev
bun run build   # outputs dist/
```

## Code map

- `src/lib/agent.ts` – tools, system instructions, history → model messages, stream handling.
- `src/lib/images-api.ts` – Images API client (JSON bodies, SSE partial images).
- `src/lib/store.ts` – IndexedDB persistence, image registry, message tree (rewind/branches).
- `src/lib/settings.ts` – persisted settings and parameter options.
- `src/components/` – chat UI, composer, settings drawer, image viewer, mask/markup editor.
