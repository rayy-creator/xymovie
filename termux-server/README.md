# XYBYPASS Android Engine

Lightweight Node.js resolver for Android/Termux. No Python, Chromium, Playwright, or npm dependencies are required.

## Update and install

If the repository is already cloned:

```sh
cd ~/xymovie
git pull
cd termux-server
npm install
node --check server.js
```

Start the engine:

```sh
export XYBYPASS_TOKEN="buat-token-panjang-acak"
npm start
```

The token is optional for local testing. For public access, always set a long random token and keep it private.

## Test

Open in the phone browser:

`http://127.0.0.1:8787/health`

Provider registry:

`http://127.0.0.1:8787/providers`

Test API locally from another Termux session:

```sh
curl -X POST http://127.0.0.1:8787/api/bypass \
  -H 'content-type: application/json' \
  -H 'x-xybypass-token: buat-token-panjang-acak' \
  -d '{"url":"https://sfl.gl/example"}'
```

Replace the example URL with a real link. If no token was configured in the server session, omit the `x-xybypass-token` header.

## Optional public access

Install Cloudflare Tunnel only if the package is available in your Termux repositories:

```sh
pkg install cloudflared
cloudflared tunnel --url http://127.0.0.1:8787
```

Copy the HTTPS URL printed by the command. In XYBYPASS admin settings (`/#/admin`), set **Termux Engine URL** to that URL and **Engine Token** to the same token configured in the server session. Keep both Termux sessions running.

## Endpoints

- `GET /health` — engine status
- `GET /providers` — candidate provider registry
- `POST /api/bypass` — JSON body: `{"url":"https://..."}`

## Limitations and safety

- The provider registry contains candidate domains; it does not mean every provider is active or supported.
- This engine follows HTTP redirects and detects some HTML meta-refresh and simple JavaScript redirects.
- It does not execute JavaScript, solve CAPTCHA, bypass human verification, or automate timers, login, cookies, or provider-specific tokens.
- Redirects are limited and local/private network destinations are blocked.
- Keep the token private. Do not publish it in screenshots or public repositories.
- Android may stop background processes. You can run `termux-wake-lock` while the engine is active.
