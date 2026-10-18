# Instagram phone app, headless

Run the Instagram **phone app** without a phone and without a screen. A headless
Chromium emulates an iPhone (or any Playwright phone preset), so Instagram serves
its mobile web app with the features the desktop site hides behind the "+" button:
posting photos and videos, adding to your story, publishing notes, plus liking,
commenting, following and direct messages. Drive it from the command line or from
Node.

```
$ ig login
$ ig post photo.jpg --caption "Shipped from a headless phone"
$ ig story clip.mp4
$ ig note "back online"
```

## How it works

- **Playwright + Chromium** launch headless by default (`--headed` shows the window).
- A **phone device preset** (`iPhone 13` by default) sets the viewport, pixel ratio,
  touch support and the mobile Safari user agent, so instagram.com answers with the
  phone layout (bottom tab bar, "+", stories tray, notes in the inbox).
- **Sessions persist**: after `ig login`, cookies and storage are saved to
  `.session/state.json`, so every later command starts already logged in. Actions
  log in automatically when the session is missing and credentials are configured.
- Every control the driver taps is listed once in `src/selectors.js`, so when
  Instagram changes its layout there is one file to fix. `--debug` saves a screenshot
  and the HTML after every step into `debug/`, and any failure captures the screen.

## Requirements

- Node.js 20.12 or newer (22 recommended).
- `npm install` pulls Playwright; run `npx playwright install chromium` once if no
  Chromium is present on the machine, or point `IG_CHROMIUM_PATH` at an existing
  Chrome/Chromium binary.

## Setup

```bash
npm install
cp .env.example .env     # fill in IG_USERNAME and IG_PASSWORD
npm link                 # optional: makes the `ig` command available globally
```

Without `npm link`, replace `ig` with `node src/cli.js` in the examples below.

## Commands

### Account

| Command | What it does |
| --- | --- |
| `ig login` | Logs in with `IG_USERNAME` / `IG_PASSWORD`, handles the 2FA prompt (asks in the terminal, or uses `IG_TOTP_CODE`), saves the session. |
| `ig whoami` | Loads the app and reports whether the saved session is still logged in (exit code 3 when it is not). |
| `ig session [--clear]` | Shows or deletes the session file. |

### Create (the phone app's "+")

| Command | What it does |
| --- | --- |
| `ig post <file...> --caption "text"` | Shares a feed post. Pass several files for a carousel (max 10). JPG, PNG, HEIC, WEBP, MP4, MOV. |
| `ig story <file>` | Adds a photo or video to your story. |
| `ig note "text"` | Publishes a note (60 characters max). `--audience followers` or `--audience close_friends`. |

### Engage

| Command | What it does |
| --- | --- |
| `ig like <post-url or shortcode>` | Likes a post or reel. |
| `ig comment <post-url> "text"` | Comments on a post or reel. |
| `ig follow <username>` / `ig unfollow <username>` | Follows or unfollows an account. |
| `ig dm <username> "text"` | Sends a direct message from the profile's Message button. |

### Look

| Command | What it does |
| --- | --- |
| `ig open [path] -s shot.png` | Opens any Instagram path in the phone layout and optionally screenshots it. |
| `ig screenshot <path> -o file.png [--full]` | Screenshots a page. |
| `ig profile <username> [--json]` | Prints name, post/follower/following counts and privacy. |
| `ig devices` | Lists the phone presets accepted by `--device`. |

### Options

```
-d, --device <name>    Phone to emulate (default: iPhone 13)
    --headed           Show the browser window
    --proxy <url>      Proxy for the browser ("none" to disable; defaults to $HTTPS_PROXY)
    --timeout <ms>     Per-step timeout (default 45000; uploads get IG_UPLOAD_TIMEOUT_MS, default 120000)
    --session <file>   Session file to use
    --json             Machine-readable output
    --debug            Screenshot + HTML after every step into debug/
    --quiet            Hide progress lines
```

All settings can also come from `.env`; see `.env.example`.

## Use it from Node

```js
import { getConfig, InstagramMobile } from './src/index.js';

const ig = await InstagramMobile.launch(getConfig({ device: 'iPhone 15' }));
try {
  await ig.requireLogin();                       // saved session, or IG_USERNAME / IG_PASSWORD
  await ig.post(['photo.jpg'], { caption: 'hi' });
  await ig.story('clip.mp4');
  await ig.note('back online', { audience: 'followers' });
  await ig.like('https://www.instagram.com/p/SHORTCODE/');
  await ig.comment('SHORTCODE', 'nice');
  await ig.follow('instagram');
  await ig.dm('friend', 'hello from a headless phone');
  console.log(await ig.profile('instagram'));
} finally {
  await ig.close();
}
```

`ig.page` is the Playwright page, so anything the library does not cover is a normal
Playwright call away. See `examples/basic.mjs`.

## When Instagram changes its layout

Instagram ships UI changes often, and the create/story/note flows depend on the labels
of a handful of buttons. If an action fails with `UI_NOT_FOUND`:

1. Re-run with `--debug` (or look at the capture the error prints).
2. Open the screenshot and HTML in `debug/` and find the control's label.
3. Add or reorder the matching spec in `src/selectors.js`. Specs are CSS strings,
   `{ role, name }`, `{ text }` or `{ label }`; lists are tried in order.

## Troubleshooting

- **`RATE_LIMITED` / 429**: Instagram throttles the IP. Wait, and reuse the saved
  session instead of logging in repeatedly. Shared or datacenter IPs hit this fast,
  and logged-out profile views are the first thing Instagram redirects to a throttled
  login page, so `ig profile` works best after `ig login`.
- **`TWO_FACTOR`**: run `ig login` in a terminal to type the code, or set `IG_TOTP_CODE`
  for a single non-interactive run.
- **`CHALLENGE`**: Instagram wants a manual checkpoint. Complete it once with
  `ig login --headed` (or in any browser), then log in again.
- **`NOT_LOGGED_IN`**: the session expired. Run `ig login`.
- **Blank or wrong-looking pages**: try another preset (`ig devices`), or `--headed`
  to watch what the phone sees.

## Verification status

Verified live in this environment: headless launch with iPhone emulation, Instagram
serving the phone layout, the landing page and the login form (username, password,
"Log in" button). The logged-in flows (post, story, note, like, comment, follow, DM)
follow Instagram's current phone web UI but could not be exercised here without an
account, so expect to adjust a selector or two on first use (see the section above).

## Responsible use

Automating an account can breach Instagram's Terms of Use and trip its anti-spam
systems. Use it on accounts you own, keep volumes human, and prefer the official
Graph API for anything at scale. Credentials stay in `.env` and the session in
`.session/`; both are git-ignored.
