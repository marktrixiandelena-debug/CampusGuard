# CampusGuard frontend

React, TypeScript, Vite, Tailwind CSS 4, React Router, Lucide React, and Recharts. Uses fictional local records only. No backend, database, or API integration. Login, roles, and gate permissions are browser-only demonstrations.

## Run

- `npm ci` (if dependencies are not installed)
- `npm run dev`
- `npm run build`
- `npm run preview -- --host 127.0.0.1 --port 4173`

## Verify

- `npm run lint`
- `npm run test:data`
- With the production preview running on port 4173: `npm run test:browser`
- With the Vite dev server running: `npm run test:browser -- http://127.0.0.1:5173`

The dev server uses port 5173 with strict port checking. After renaming imported source files, restart Vite if it continues requesting an old filename. Browser checks also fail on unsuccessful JavaScript module requests. Browser-profile artifacts in `.verification/` are excluded from Vite's watcher.

The browser verification uses Windows Edge and Node's built-in WebSocket. Node 26 was used for verification; the data test needs Node support for importing erasable TypeScript. Screenshots are written to ignored `.verification/`.

## Routes and demo behavior

- `/dashboard`: Security Head overview with four linked summaries, outstanding-work links, quick actions, and the five most recent incident/visitor/Lost & Found logbook records. Daily visitors use the sample date; outstanding incidents/items include all dates; scheduled guards are distinct personnel on the labeled 6am–2pm shift. Detailed charts remain in Analytics.
- `/visitors`: access history, combined search/gate/date filters, and details.
- `/lost-found`: table/grid, filters and sorting, local record/photo creation, match linking, ownership verification, and physical release.
- `/personnel`: directory, search/status filtering, registration and profiles.
- `/personnel/duty-schedule`: date/shift selection, weekly view, group assignment, templates, copying, validation, and sample publication.
- `/personnel/campus-posts`: assignment groups and map marker interactions.
- `/personnel/activity-history`: local event history and details.
- `/incidents`: situation/type/report filters, search, sorting, recording, viewing, and updating.
- `/analytics`: visitor and Lost & Found timelines, ranked incident/assignment bars, date presets and custom ranges, source filtering, and expandable exact-value tables. Defaults to the populated September 2026 sample. A selected day uses hourly buckets; short ranges use daily buckets; longer custom ranges use weekly or monthly buckets. Calendar presets include the complete month/year. Counts use campus-local dates (Asia/Manila), independently of the browser timezone. Returned/matched figures describe current statuses of reports dated in the range, not historical status transitions.
- `/reports`: report configuration, archive filtering/search, preview, metadata, regeneration, and export notices.

All changes remain in memory across frontend navigation; a reload restores the fixtures. The demo date is October 19, 2026. Older fictional September records populate Analytics. Dashboard, operational tables, charts, and previews share the same data. A local schedule publication does not represent actual UNC approval or attendance. Generate/Export PDF and history export display prototype notices and produce no files.

Dashboard links use `from=dashboard` for a visible return link and validated `view` presets for matching source filters. Visitor, incident, and item filters are stored in the URL, so reloads and browser Back/Forward preserve them. `record=<id>` opens the existing detail dialog; `action=new` opens the incident or item creation form. These one-time requests are consumed without adding history entries. Missing records show a dismissible message. Duty-schedule links accept a validated date and start/end time. Security Head and Security Guard views use demo route and gate restrictions; these are not server-enforced authorization.

## Interface design

The interface uses a restrained navy, white, and slate institutional palette. Shared colors, spacing, radii, shadows, and motion tokens live in `src/styles/index.css`; component styles remain in their existing stylesheets. UI/UX Pro Max written guidance informs accessibility and layout; no external fonts, images, or animation packages are required.

Desktop navigation expands to 256px and collapses to a 72px icon rail with accessible labels. Below 1024px, navigation becomes an overlay drawer with focus containment, Escape dismissal, and focus restoration. The collapse preference lasts for the mounted session.

Shared dialogs use native dialog semantics, a 200ms fade/scale entrance, and a 150ms cancellation exit. Modal children receive an animated dismissal callback; successful record operations retain their existing completion behavior. Dashboard cards use a 250ms fade/slide entrance, charts reveal over 250ms without animating data updates, and action buttons use subtle hover shadows. Existing success messages and notices animate in; explicit notice dismissal animates out without changing message lifetimes. Status badge colors transition over 150ms. Page opacity transitions run only on pathname changes. Reduced-motion preferences remove motion and dismissal delays.

Browser verification covers workflow behavior, sidebar collapse, drawer keyboard handling, modal focus restoration, reduced motion, and responsive layouts. Screenshot artifacts are stored under ignored `.verification/`.
