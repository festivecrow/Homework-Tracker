# The Clock — Homework Tracker

This is your homework/tests tracker, packaged as a real deployable web app
(a PWA — Progressive Web App). Once deployed, you can add it to your phone's
home screen and it works like an installed app.

## What changed from the Claude preview

- **Storage**: the Claude preview used `window.storage`, which only exists
  inside a Claude conversation. This version uses a small shim
  (`src/storage-shim.js`) that redirects the exact same calls to your
  browser's `localStorage` instead — so the app code itself didn't need to
  change. Your data now lives on whichever device/browser you use it on.
- **Important limitation**: `localStorage` does **not** sync between devices.
  If you use this on your phone and your laptop, they'll have separate data.
  Fixing that requires a real backend/database — a good next step once
  you're using this daily, but not needed to get a working app on your
  phone today.
- **Installable**: this project generates a proper `manifest.webmanifest`
  and service worker, which is what makes "Add to Home Screen" give you a
  real app icon and offline support, instead of just a bookmark.

## Deploy it (no local setup required)

The easiest path uses GitHub + Vercel, both free, and neither requires you
to install anything on your own computer.

### 1. Put this project on GitHub
1. Create a free account at github.com if you don't have one.
2. Create a new repository (e.g. `homework-tracker`).
3. Upload every file in this folder to that repository. On the repo page,
   use "Add file" -> "Upload files" and drag in the whole folder contents
   (make sure `src/`, `public/`, `index.html`, `package.json`, and
   `vite.config.js` all end up there).

### 2. Deploy with Vercel
1. Create a free account at vercel.com -- you can sign up directly with
   your GitHub account, which makes step 3 automatic.
2. Click "Add New" -> "Project".
3. Select the GitHub repository you just created.
4. Vercel will auto-detect this as a Vite project. Leave the defaults and
   click "Deploy".
5. In a minute or two, you'll get a live URL like
   `homework-tracker-yourname.vercel.app`.

### 3. Install it on your phone
1. Open that URL on your phone in Safari (iOS) or Chrome (Android).
2. iOS: tap the Share icon -> "Add to Home Screen".
   Android: tap the menu (three dots) -> "Install app" (or you'll see a
   banner prompting this automatically).
3. You now have a real app icon that opens full-screen, no browser bar.

## Local development (optional)

If you want to run this on your own computer to test changes before
deploying:

    npm install
    npm run dev

Then open the URL it prints (usually http://localhost:5173).

To build the production version yourself:

    npm run build
    npm run preview

## What's still missing (the honest list)

- **No cross-device sync** -- see the localStorage note above.
- **No real push notifications** -- the reminder logic in the app calculates
  *when* you should be notified, but nothing is currently wired up to
  actually send that notification to your phone in the background. That
  needs a backend service and browser push subscriptions -- a bigger next
  step once the core app is solid.
- **No backup automation** -- use Settings -> Backup -> Download backup
  periodically, especially before switching phones or browsers.
