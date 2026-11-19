# XYBYPASS Termux Engine

Browser-based resolver for the XYBYPASS website. Runs on Android/Termux with Node.js, Chromium and Playwright Core.

## Install on Termux

Use a current Termux build (F-Droid or GitHub release), then run:

```sh
pkg update && pkg upgrade -y
pkg install nodejs-lts git x11-repo chromium cloudflared -y
git clone https://github.com/rayy-creator/xymovie.git
cd xymovie/termux-server
npm install
```

Find Chromium's path:

```sh
which chromium-browser || which chromium
```

Set the path if needed, then start the engine:

```sh
export CHROMIUM_PATH="$(which chromium-browser || which chromium)"
export XYBYPASS_TOKEN="buat-token-panjang-acak"
npm start
```

Health check: `http://127.0.0.1:8787/health`

## Expose it to the website

In another Termux session:

```sh
cloudflared tunnel --url http://127.0.0.1:8787
```

Copy the HTTPS trycloudflare URL printed in the terminal. In XYBYPASS, open the hidden admin page (`/#/admin`), enter that URL as **Termux Engine URL**, enter the same token as **Engine Token**, then save. Keep both Termux sessions running.

For a stable URL, create a named Cloudflare Tunnel from your own Cloudflare account. Quick Tunnels may change URL when restarted.

## Endpoints

- `GET /health` — engine status
- `GET /providers` — candidate provider registry
- `POST /api/bypass` — JSON body: `{"url":"https://..." }`

## Important

- The registry is a list of candidate domains, not a promise that every provider works at all times.
- Chromium executes ordinary page JavaScript and follows browser redirects. Timers, changing tokens, login walls, CAPTCHA and human verification may still prevent resolution.
- CAPTCHA/human verification is not bypassed.
- The engine accepts only registered provider domains and blocks local/private network destinations.
- Keep the token private. Do not publish it in screenshots or public repositories.
- Android may stop background processes to save battery. Disable battery optimization for Termux and use `termux-wake-lock` while running.
