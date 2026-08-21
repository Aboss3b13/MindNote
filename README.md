# MindNotes

MindNotes is a private, local-first app for connected note-taking. Notes can be related directly or through folders, hashtags, and imported sources, and every relationship becomes part of an interactive mind map.

**Live app:** [abbas.ali-raza.net/Mindnotes](https://abbas.ali-raza.net/Mindnotes)

**Android preview:** [Download MindNotes v0.3.0](https://github.com/Aboss3b13/MindNote/releases/download/v0.3.0/MindNotes-v0.3.0-debug.apk)

## Included

- Abrahamic Books-style note list, folder browser, editor, search, and responsive bottom navigation
- Feature-rich notes with status, favourites, folders, hashtags, exact source excerpts, citations, and direct links
- Select any phrase in an imported source to create a linked note or append it to an existing note
- Interactive Abrahamic Books-style canvas mind map with focus mode, filters, pan, pinch/scroll zoom, animated reflow, and layouts bounded for large libraries
- Full-text search across notes and extracted source content
- On-device extraction for PDF, DOCX, PPTX, Excel/CSV, OpenDocument, RTF, text, Markdown, HTML, XML, and JSON files
- Simple email/password accounts with automatic end-to-end encrypted server sync
- Built-in website, YouTube transcript, and PDF extraction endpoints
- Responsive phone, tablet, and desktop layouts
- Capacitor Android project and APK build task
- Light and dark themes, keyboard navigation, reduced-motion support, and local autosave

## Run locally

```bash
npm install
npm run dev
```

The app stores its workspace in browser IndexedDB by default. No account or server is required.

## Accounts and server storage

The production backend lives in `public/api`. Users only enter an email and password. Their workspace is encrypted with AES-256-GCM in the browser before upload; the server stores the opaque encrypted envelope and a password hash, never plaintext notes or the encryption key.

The backend includes authentication rate limits, protected data files, strict origin handling, upload limits, private-network URL blocking, atomic writes, transient PDF extraction, and YouTube transcript extraction. Local-only mode remains the default and requires no account.

## Android

```bash
npm run android:add
npm run android:apk
```

The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`. Use an Android signing key and a release build before publishing through an app store.

## Privacy

No analytics or tracking are included. `.env`, server data, Android signing keys, and build products are ignored by Git.
