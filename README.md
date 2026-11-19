# XYDOWN

Minimalist social media media downloader for Instagram, TikTok and YouTube.

## Architecture
- Static frontend: `index.html`, `assets/style.css`, `assets/app.js`.
- Download engine: Node.js + yt-dlp + FFmpeg running on the owner's Android phone through Termux.
- Public connection: Cloudflare Tunnel.
- No Cobalt API, no Supabase, and no social-media account login.

## Termux server
1. Install Node.js, Python, yt-dlp, FFmpeg, Express and CORS in Termux.
2. Run `node server.js` on port 3000.
3. In another Termux session, run `cloudflared tunnel --url http://localhost:3000`.
4. Update the API base URL in `assets/app.js` to the current `https://<random>.trycloudflare.com` address, then redeploy the website.

The current frontend is configured for the owner's current Quick Tunnel URL. Cloudflare Quick Tunnel hostnames are temporary and change when the tunnel is restarted; update the URL in `assets/app.js` after generating a new one. Quick Tunnels are intended for testing/development and have no uptime guarantee.

## Features and limitations
- Public Instagram, TikTok and YouTube links where yt-dlp supports access.
- No social-media username, password, cookies or account login are requested.
- Private, login-gated, age-restricted or otherwise inaccessible content is not supported.
- Media URLs returned by platforms may expire; request the link again if a download URL stops working.
- The phone, Node.js server and Cloudflare Tunnel must remain online for the downloader API to work.

## Donations
Replace the generic Saweria and Sociabuzz links in `assets/app.js` with the project's actual donation URLs.

## Responsible use
Only download content you own or have permission to save. Respect platform terms, copyright and creators' rights.
