# MindNotes

MindNotes is a private, local-first app for connected note-taking. Notes can be related directly or through folders, hashtags, and imported sources, and every relationship becomes part of an interactive mind map.

**Live app:** [abbas.ali-raza.net/Mindnotes](https://abbas.ali-raza.net/Mindnotes)

## Included

- Feature-rich notes with status, favourites, folders, hashtags, source citations, and direct links
- Interactive canvas mind map with focus mode, filters, pan, zoom, and layouts bounded for large libraries
- Full-text search across notes and extracted source content
- On-device extraction for PDF, DOCX, PPTX, Excel/CSV, text, Markdown, HTML, and JSON files
- Optional private backend for website text, YouTube transcripts, and self-hosted workspace backups
- Responsive phone, tablet, and desktop layouts
- Capacitor Android project and APK build task
- Light and dark themes, keyboard navigation, reduced-motion support, and local autosave

## Run locally

```bash
npm install
npm run dev
```

The app stores its workspace in browser IndexedDB by default. No account or server is required.

## Optional private server

```bash
cp .env.example .env
# Set a long random MINDNOTES_ACCESS_TOKEN, then load the variables safely.
npm run server
```

Put the public HTTPS URL and access token into **Settings & sync**. The token is stored only on that device and is never bundled into the frontend. Put the backend behind HTTPS before using it outside localhost.

The URL importer rejects private/reserved IP addresses to reduce SSRF risk. For a multi-user public deployment, add real user accounts, per-user encryption keys, rate limits, and database-backed revision sync rather than sharing one access token.

## Android

```bash
npm run android:add
npm run android:apk
```

The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`. Use an Android signing key and a release build before publishing through an app store.

## Privacy

No analytics or tracking are included. `.env`, server data, Android signing keys, and build products are ignored by Git.
