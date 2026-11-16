# XYWAIFU

Personal single-user anime companion web app. The repository is temporarily named `xymovie`.

## Current mode
- No login, no Supabase, no account system.
- Opens directly to the dashboard.
- Character data and reference images are stored in this browser using localStorage.
- Voice sample files are stored locally in IndexedDB.
- Data does not sync between devices or browsers. Clearing browser/site data can erase locally stored content; export/backup is not yet implemented.

## Current starter features
- Dashboard and navigation.
- Create character profiles with name, personality, and image references.
- Upload-only Voice Studio; microphone is not required.
- Chat page placeholder.
- Privacy settings and local data reset.

## Not yet connected
- LLM chat inference, image-to-3D generation, voice cloning/TTS, speech recognition, lip-sync, 3D model viewer, desktop and Android activity companion. These require separate engines/services. The UI deliberately does not fake AI outputs.
- Use only audio you own or have explicit permission to use for voice cloning.
- Activity awareness must remain opt-in, visible, permission-based, and pausable.
