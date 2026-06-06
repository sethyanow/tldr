# tldr

Single Page Application for privacy-first, on-device summarization in the browser.

## Run locally

Serve `/tmp/workspace/sethyanow/tldr` with any static file server, for example:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Features

- Landing page introducing on-device summarization goals
- Model control panel with:
  - common model presets
  - free-form Hugging Face model ID input
  - optional API key input for gated model access checks
  - download/load action for local model execution in browser cache
- Summarization area optimized for readability
- Local save to `localStorage`
- Saved-results browsing with fuzzy search + autocomplete
