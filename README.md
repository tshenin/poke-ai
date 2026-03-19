# Poke AI

An open-source Chrome extension that lets you annotate any webpage and send those annotations to an AI agent — using your own API key.

## What it does

Poke AI adds an annotation toolbar to any site you visit. You highlight elements, draw boxes, or leave text notes directly on the page. When you're ready, Poke AI packages up your annotations and sends them to an AI model of your choice to act on them — writing code, filling forms, summarizing content, automating tasks, or anything else you can describe.

## Features

- **Visual annotation tool** — point-and-click selection, bounding boxes, and text notes on any webpage
- **Bring your own API key** — works with Claude (Anthropic), OpenAI, and other compatible providers
- **Run locally or in the cloud** — send annotations to a local agent or a hosted endpoint
- **Privacy first** — your API key never leaves your browser; all requests go directly from the extension to the AI provider
- **Open source** — inspect, fork, and extend everything

## How it works

1. Click the Poke AI icon to open the annotation toolbar
2. Select elements or draw annotations on the page
3. Describe what you want the AI to do
4. Hit send — your annotations + prompt go to your chosen AI provider
5. The response is shown inline or applied to the page

## Roadmap

- [ ] Core annotation engine (element picker, bounding box, text notes)
- [ ] Settings panel for API key management
- [ ] Claude (Anthropic) integration
- [ ] OpenAI / compatible API integration
- [ ] Local agent mode (run against Ollama or similar)
- [ ] Annotation export (JSON / screenshot)
- [ ] Replay & share annotation sessions

## Getting started (development)

```bash
git clone https://github.com/tshenin/poke-ai.git
cd poke-ai
# Load the extension in Chrome:
# 1. Go to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select this folder
```

## Contributing

Contributions are welcome. Open an issue to discuss ideas or submit a pull request.

## License

MIT
