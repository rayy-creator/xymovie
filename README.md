# XYDOWN
Minimalist social media media downloader for Instagram, TikTok and YouTube.

## Features
- Public-content link downloader UI for Instagram photos/videos/Reels/accessible public Stories, TikTok videos/photo slideshows and YouTube media where supported by the provider.
- No social-media login, password, cookies or user account credentials are requested.
- Optional local browser profile. It is not authentication and is not required to download.
- Donation links for Saweria and Sociabuzz (replace generic links in `assets/app.js` with your own).
- Static frontend in `index.html`, `assets/style.css`, `assets/app.js`; server adapter in `api/download.js`.

## Free API setup
This project uses the open-source Cobalt-compatible API protocol. The upstream Cobalt project does not provide a public hosted API for unrestricted third-party use; host your own compatible instance or use an instance whose owner explicitly permits your use.
1. Deploy a Cobalt API instance on a service that supports its runtime requirements (Node.js + FFmpeg; see https://github.com/imputnet/cobalt).
2. In Vercel Project Settings → Environment Variables, set:
   - `COBALT_API_URL` = base API endpoint of your permitted instance (usually ends in `/`)
   - `COBALT_API_KEY` = optional API key, only if your instance requires one
3. Redeploy the Vercel project.

The API adapter does not scrape private accounts or bypass access controls. Private/age-restricted/login-gated Stories and posts may fail. Provider support and free-tier limits can change.

## Deployment
Deploy this repository to Vercel. No npm build step is required for the static frontend and serverless function.

## Important
Only download content you own or have permission to save. Respect platform terms, copyright and creators' rights. This project is not affiliated with Instagram, TikTok, YouTube or Cobalt.
