# CS101 Modules 82–234 Examination App

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

Import the repository into Vercel with the framework preset set to **Vite**. The included `vercel.json` keeps browser routes working after refresh. Add the variables from `.env.example` in Vercel Project Settings → Environment Variables, especially `VITE_ADMIN_PASSCODE`.

In Firebase Authentication → Settings → Authorized domains, add the deployed Vercel domain before testing anonymous sign-in. The exam is optimized for phone screens with large touch targets, safe-area padding, vertical question cards, and horizontally scrollable admin results.

The Firebase web configuration is available through the supplied defaults in `src/firebase.ts`. To use environment variables instead, copy `.env.example` to `.env` and fill in the same values.

## Firebase setup

In the Firebase console for `livewrite-4c2aa`:

1. Enable **Authentication → Sign-in method → Anonymous**.
2. Create/enable **Cloud Firestore**.
3. Deploy the included `firestore.rules` file.

The app asks for the student name at the start of every attempt. Every start resets the answers and timer and creates a new attempt record. Attempts are stored at `users/{anonymousUid}/attempts/{attemptId}` plus an admin summary in `adminAttempts/{attemptId}`. Student results do not reveal score or answer keys.

Open `/ ?admin=1` (without the space, for example `http://localhost:5173/?admin=1`) or use the Admin panel link on the start screen. The default passcode is `VU-CS101-ADMIN`; override it with `VITE_ADMIN_PASSCODE` in `.env`. The admin panel shows score, answered count, duration, student ID, and rule violations.

## Verification

```bash
npm run check:questions
npm run build
```

The exam has exactly 50 typed questions, a 60-minute timer, forward-only navigation, fullscreen enforcement, a visible violation warning before submission, tab/focus/fullscreen violation submission, and best-effort browser screenshot/print/copy deterrence. OS-level screenshots and external recording cannot be technically prevented by a browser app.
