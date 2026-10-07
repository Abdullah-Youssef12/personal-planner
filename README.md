# Planner

A personal, local-first weekly planner. The published site contains no personal schedule. Blocks, repeating rules, one-day changes, and checklist states are stored in IndexedDB on the device that uses the app.

## Run locally

```sh
npm ci
npm run dev
```

`npm test` checks date and recurrence logic. `npm run build -- --mode pages` builds the GitHub Pages version. The service worker caches the app shell for offline use after the first online visit.

## iPhone setup

1. Open the published HTTPS link in Safari.
2. Tap **Share → Add to Home Screen**.
3. Open **Planner** from its new icon.
4. Transfer your private timetable JSON to the iPhone Files app using a method you trust.
5. In Planner, open **Settings → Import JSON**, select that file, and browse the week of October 10, 2026.
6. Use **Settings → Export backup** regularly. Importing a file replaces the current schedule.

The app has no account, cloud sync, alerts, or server-side workout/planning data. Removing its storage or the Home Screen app may remove its local data; keep backups outside the app.

## Data format

Exports use `schemaVersion: 1` and contain arrays of `rules`, `events`, `overrides`, and `checks`. A repeating rule may be weekly or biweekly and has a Saturday rotation anchor, an effective start date, an optional end date, and an optional pause date. Overrides apply to one dated occurrence. Checklist completion keys include the occurrence date, so repeating items start fresh each time.
