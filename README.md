# XYWAIFU

XYWAIFU is an anime AI-companion web app starter. The repository is temporarily named `xymovie`; keep that repository name until the owner renames it.

## Setup
1. Create a **new** Supabase project dedicated to XYWAIFU. Do not reuse or delete the old XYMovie Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. Copy the Project URL and publishable key (or legacy anon key) into `CONFIG` in `assets/app.js`.
4. Enable Email auth in Supabase Authentication. For production, configure the site's allowed redirect URLs.
5. Deploy this repository to Vercel with the repository root as the project root.

## Current starter features
- Email/password sign-up and sign-in via Supabase Auth.
- User-owned character records and private image/audio Storage buckets.
- Character reference-image upload UI.
- Upload-only voice sample studio (no microphone required).
- Initial dashboard, chat placeholder, and privacy/awareness settings.

## Not yet connected
- LLM provider / chat inference, image-to-3D generation, voice cloning/TTS, speech recognition, lip-sync, 3D model viewer, desktop and Android activity companion. These require separate engines/services. The UI deliberately does not fake AI outputs.
- Use only audio you own or have explicit permission to use for voice cloning.
- Activity awareness must remain opt-in, visible, permission-based, and pausable.

## Supabase config
Never put a service-role key in frontend code. Only use the project's public publishable/anon key in the browser.
