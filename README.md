# Poke AI

Chrome extension that launches Cursor agents from Jira tickets — via the cloud API or directly in your local Cursor IDE.

## What it does

- Works on Jira issue pages.
- Shows Jira ticket key and title in the popup.
- Two ways to run an agent:
  - **Run Cloud Agent** — calls the Cursor background-agent API (requires API key).
  - **Open in Cursor** — opens your local Cursor IDE with the ticket context pre-filled as a prompt (no API key needed).
- Supports prompt resolution by repository for cloud agents:
  - custom prompt for repo (if saved),
  - predefined prompt for repo,
  - super-default prompt fallback.

### On-Site Annotation (New)

Annotate UI elements directly on platform pages:

1. Navigate to a supported platform page.
2. Click the extension icon and start **Annotation Mode**.
3. Hover and click any element to select it.
4. Add a note describing the change needed (e.g., "Change this icon" or "Fix button alignment").
5. Run the agent directly from the platform page, or annotations will be included when running from a Jira ticket.

## Setup

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project directory.
4. (Optional) Open extension **Settings** and configure:
   - Cursor API key (needed only for cloud agents),
   - target repository URL,
   - base branch.

For best results with private npm dependencies, add `GITHUB_TOKEN` in Cursor User Secrets.

## Usage

1. Open a Jira issue page.
2. Click the extension icon.
3. Verify ticket key/title in popup.
4. Click **Run Cloud Agent** to start a background agent, or **Open in Cursor** to launch your local IDE with the ticket prompt.

## Project structure

- `manifest.json` - Chrome extension manifest (MV3).
- `background.js` - service worker, Cursor API integration, prompt resolution.
- `content.js` - Jira issue data extraction (ticket key/title/description).
- `annotation.js` - on-site annotation for platform pages.
- `popup/` - popup UI and run action.
- `settings/` - API key/repository settings and advanced prompt configuration.
- `icons/` - extension icons.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features.
