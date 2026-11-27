# CampusGuard Personnel Management audit

Frontend prototype, source audit of the reorganized repository. In this report, **implemented** means a working frontend capability. **Simulated** means an action or state represents a real-world process only in the demo. **Partially implemented** means some working behavior exists alongside a material gap. All names in fixture examples are project demo data.

## 1. Source and dependency map

| Path | Responsibility and important symbols | Dependencies and consumers |
|---|---|---|
| `src/features/personnel/Personnel.tsx` | All four Personnel routes, directory, profile, photos, selected shift, group editing, post map, copy, template, checks, publication. Key functions include `requestedSchedule`, `register`, `saveGroup`, `placePost`, `renamePost`, `removePost`, and `selectPersonnelPhoto`. | Store, fixtures and shared overlap helper, React Router, shared UI and record hooks, dashboard route context and defaults, reporting date validator, both personnel history files. Optional map asset via the `/public/design/*` glob. |
| `src/features/personnel/PersonnelActivityHistory.tsx` | Global Personnel history filters, pagination, table/list, and Activity Details dialog. | Store, `combinedPersonnelHistory`, shared records and UI, fixture date formatter. |
| `src/features/personnel/personnel-activity.ts` | `personnelActivity`, `combinedPersonnelHistory`, `PersonnelHistoryRow`. | `Person`, `Activity`, `Visit`, `Incident`, `MockAccount`, `accountName`, `campusDateTime`. Also imported directly by data verification. |
| `src/features/personnel/personnel-directory.css` | Directory/table/cards, profile, photo, roster, toolbar, and activity-specific layout. | Global CSS tokens, panels, dialogs, responsive records. |
| `src/data/data.ts` | `Person`, `Assignment`, `Activity`, `VisitorAssignment`, `Visit`, `Incident`, fixtures, `TODAY`, `dateLabel`, `overlaps`. | Shared by the store, feature pages, data scripts, and browser fixtures. |
| `src/app/store.ts`, `src/app/DemoProvider.tsx` | `useStoreValue`, `DemoContext`, `useDemo`, provider. Personnel updates use state setters. | Fixtures and auth/visitor reducers. Supplies all operational modules. |
| `src/app/App.tsx`, `src/app/navigation.ts` | Protected shell, `/personnel/*`, role-specific access, and `personnelTabs`. | Auth helpers, Personnel, role-specific dashboards. |
| `src/shared/ui/ui.tsx`, `src/shared/ui/ResponsiveRecords.tsx`, `src/shared/ui/RecordTableTools.tsx` | `Modal`, `Footer`, `Heading`, `Stats`, `Tabs`, `Panel`, `Field`, `Select`, `Segments`, `SearchBox`, `Badge`, responsive records, sort headings, pagination and empty states. | Shared by many modules. Associated styles in `src/shared/ui/responsive-records.css` and `src/shared/ui/record-table-tools.css`. |
| `src/shared/hooks/useLogbookFilters.ts`, `useRecordPage.ts`, `useSummaryHref.ts`, `useCampusDate.ts` | URL-backed directory view/filters, page and sort helpers, dashboard-aware summary links, and live campus date in consumers. | Router, visitor time utility, operational logbooks and dashboards. |
| `src/styles/index.css`, `App.css`, `modules.css`, `refinements.css`, `interactions.css`, `modal-density.css`, `modal-typography.css`, `page-hierarchy.css` | Global tokens, shell, grids, forms, map presentation, focus and dialog behavior/styling. | Global cascade through `main.tsx` and `App.tsx`. |
| `src/features/dashboard/Dashboard.tsx`, `DashboardContext.tsx`, `dashboard-context.css`, `dashboard-data.ts`, `GuardDashboard.tsx` | Head roster links/counts, source-page return context, `dashboardShift` and schedule selectors, guard's own duties. | Store, routes, fixtures, role and gate rules, campus date. |
| `src/features/auth/auth-data.ts`, `GuardAccounts.tsx`, `Login.tsx`, `accounts.css` | Session identity and authorization, account admin, sign-in, and guard dashboard/account styling. | Store, personnel eligibility, gate permissions. |
| `src/features/visitors/visitor-data.ts`, `Visitors.tsx`, `VisitorRegistration.tsx`, `visitor-registration.css` | Attributed check-in/out and optional assignment snapshots. | Store, auth, assignments, Activity consumers. |
| `src/features/incidents/Incidents.tsx` | Responding personnel selector and name display. | Store, shared controls, incident fixtures, Personnel activity projections. |
| `src/features/lost-found/LostFound.tsx`, `ItemDetails.tsx` | Item verification/release attribution and item-local history. | Authenticated actor from store. Item activity is separate from combined Personnel history. |
| `src/features/reporting/Analytics.tsx`, `Reports.tsx`, `reporting.ts` | Assignment totals and rankings, aggregate preview, sample archive, `isReportDate` and date helpers. | Store assignments and fixture dates. |
| `src/features/help/Help.tsx` | Role-aware operating guidance and shortcuts. | Navigation and session role. Guidance can describe prototype features more broadly than rendered code. |
| `scripts/verify-*.mjs` | Direct and integration checks, detailed in section 9. | Built preview in browser suites, direct TypeScript imports in data suites. |

## 2. Data, roles, state, and identifiers

Actual data shapes from `src/data/data.ts` and `src/features/auth/auth-data.ts`:

```ts
type Person = { id: string; name: string; position: string; status: string; contact: string; photo?: string }
type Assignment = { id: string; personId: string; location: string; date: string; start: string; end: string }
type Activity = { id: string; date: string; time?: string; event: string; detail: string; actor: string; actorId?: string; personId?: string }
type VisitorAssignment = { post: string; date: string; start: string; end: string; personIds: string[] }
type UserRole = 'Security Head' | 'Security Guard'
type MockAccount = { id: string; username: string; password: string; role: UserRole; name?: string; personId?: string; enabled: boolean; gates: string[] }
type SessionUser = { accountId: string; username: string; name: string; role: UserRole; personId?: string; gates: string[] }
type PersonnelHistoryRow = Activity & {
  category: 'Visitor transactions' | 'Incident assignments' | 'Personnel changes'
  actorKey: string
  reference?: string
}
```

- `posts` is inferred as `{name:string; x:number; y:number}[]`. The post name is the link to `Assignment.location`. There is no post ID, description, capacity, duty description, or responsibility field. The roster has no separate entity, assignment-effective-date range, or tour-of-duty type.
- `useStoreValue` owns `people/setPeople`, `assignments/setAssignments`, `posts/setPosts`, `mapPhoto/setMapPhoto`, `activities/activity`, and `rosterStates/setRosterStatus`, plus accounts, current user, visits, incidents, and items. `rosterStates` is a `Record<string,string>` keyed by `date|start|end`. Personnel and scheduling have no dedicated reducer or API.
- `register` generates `SEC-` plus the largest existing numeric suffix + 1, padded to three digits. Assignments made by group edits, template, and copy use `crypto.randomUUID()`. Those operations replace rows and can replace assignment IDs. Post identity is a mutable string. Activity entries get UUIDs, campus date/time to seconds and a snapshot of the actor display name, account ID and optional personnel ID.
- `activity(event,detail)` prepends a record and clears **all** roster-state markers. The check signature in `Personnel.tsx` separately includes all assignments and each profile's ID/status. Photo save updates `people` and the open profile object without calling `activity`. Data survives route changes while the provider stays mounted. Refresh returns to fixtures and clears authentication. Nothing writes to durable storage.
- Assignment dates are date strings and shifts are same-day `HH:mm` strings. `requestedSchedule` validates date with `isReportDate`, clocks with a 24-hour regex and `start < end`; invalid/missing input falls back to the demo date/shift as appropriate. `TODAY` is fixed at 2026-10-19. `campusDateTime` and `useCampusDate` in visitor/guard flows use actual Asia/Manila time. Historical assignment dates are the dates recorded on rows, not attendance timestamps.

Reducer signatures relevant to integrations:

```ts
type AuthAction =
  | { type:'login'; requestId:string; username:string; password:string; people:Person[] }
  | { type:'logout' }
  | { type:'manage'; requestId:string; newAccountId:string; change:GuardAccountChange; people:Person[] }
type GuardAccountChange =
  | {kind:'create'; personId:string; username:string; password:string; gates:string[]}
  | {kind:'access'; accountId:string; gates:string[]}
  | {kind:'enabled'; accountId:string; enabled:boolean}
  | {kind:'password'; accountId:string; password:string}
type TransactionContext = {people:Person[]; assignments:Assignment[]; actor:SessionUser|null}
type VisitorAction = (
  {type:'checkIn'; input:CheckInInput; visitId:string; newProfileId:string}
  | {type:'checkOut'; input:CheckOutInput}
) & {requestId:string; at:string; context:TransactionContext}
```

`AuthState` holds `accounts`, `sessionId`, and `result`. `VisitorState` holds `profiles`, `visits`, and `result`. Store wrappers build the action context from live state and stamp visitor actions with ISO instants. Personnel rows are not auth accounts. Directory position options are **Security Guard** and **Senior Security Personnel**. There is no rank ladder, designation separate from position, responsibility object, employment type, or attendance status. Either active position can qualify for a Guard account, subject to account validation. The seeded Head account has a name but no Personnel link. The seeded guard accounts link to SEC-001 and SEC-003.

**Access.** `canAccessPath` permits the Head to use Personnel routes and Guard Accounts. Guards see their own read-only assignments in My Security Dashboard and use scoped visitor workflows. A Guard account must be enabled and reference an Active profile and at least one valid authorized gate. Valid gates are Gate 1 (Main) and Gate 2 (Side). The Head can create Guard accounts, change gates, reset passwords, and enable/disable accounts. New accounts require an active existing profile, one account per person even if an account is disabled, a unique case-insensitive username (normalized, 3–40 allowed characters), and password length of at least eight. No UI workflow creates more Head accounts or uses Personnel rank to grant access. These checks are frontend demo rules.

## 3. Interface hierarchy

All four routes share the **Security Personnel** heading, **Add Personnel**, **Personnel overview**, and Personnel / Duty Schedule / Campus Posts / Activity History tabs. The overview shows selected date/shift, unique scheduled people, active profiles across the directory, and assigned locations among current posts. Counts link to the matching destinations, with date/start/end and Active status as appropriate. Dashboard-origin navigation can show a return link. Unknown subpaths redirect to Dashboard.

### Directory and registration

- **Personnel Directory** has a live filtered/total count, case-insensitive ID/name/position substring search, All Status/Active/Inactive, Name/Position/Personnel ID ascending and descending, and Table/Grid choices. Default is Name A–Z, Table, 10/page. Page sizes are 10/25/50. Search, status, sort, view and pagination use URL parameters. Clear filters removes search, status and page, preserving sort/view. Empty states distinguish an empty directory from no matching results.
- Desktop table columns are Personnel (photo or initials, linked name and ID), Position, Status, Sample Scheduled Post, Actions (View profile). Personnel and Position headers sort. Scheduled post is the first matching assignment for the exact selected shift, or Not scheduled. Grid cards show photo or No photo, name, status, position, ID and View Profile. Phone table mode becomes a labeled list with position, ID, shift post and profile action.
- **Register Personnel** groups Personnel Information, Employment Information and optional Personnel Photo. Fields are `name` required text with native non-whitespace pattern plus trimmed validation, `contact` optional tel/autocomplete trimmed on save, `position` required select defaulting to Security Guard, and `status` required radio defaulting to Active. Photo is optional. Save Personnel waits for photo loading; Cancel dismisses. There is no duplicate-name or duplicate-contact check, phone-format rule, manually editable reference number, or additional profile field.
- **Photo controls** use Take Photo (hidden image input with environment capture), Choose Photo (file input), and Remove Photo (clears the draft). MIME prefix and 5,000,000-byte limit are checked; FileReader and image decoding must succeed. Read failures show an alert and keep the earlier photo. The read token prevents stale callbacks after reset/unmount. Loading is announced. Save commits the photo; Cancel abandons the photo edit. There is no name, contact, position or status editor for an existing profile, nor a deactivate/delete personnel action. An Inactive profile can be created. Guard Account disabling is distinct.

### Profile and history

- **Personnel Profile** header has avatar/initials, name, ID, position, and Active/Inactive. Profile tab displays Contact Number or an explicit missing-contact message, View full photo and Add/Update Photo. Full-photo view contains the image or Photo unavailable, Back to profile and Close. Photo edit has Save Photo and Cancel. These subviews reuse the same dialog, focus their headings, and restore focus to the initiating control or profile heading. Profile tabs use Arrow Left/Right, Home/End and roving tab focus.
- **Assignments** shows Selected Assignment for the exact selected date/start/end, or Not scheduled for this shift, and all other retained assignments, descending by date/start. Includes past and future rows with no separate historical cutoff. View Duty Schedule closes the modal and navigates with current `date/start/end` query parameters. **Activity** lists linked visitor check-ins/checkouts and assigned incidents with label, date/time, place, and record ID, or No linked activity. Both tabs use the profile footer Close. There is no edit assignment button inside the profile.
- **Personnel Activity History** shows Sample Data badge, search over event/actor/reference/details, and category, actor, and observed date selects. Category options are Visitor transactions, Incident assignments, and Personnel changes. Actor options come from activity rows, so a Head account can appear and profiles without activity need not appear. Dates come from the history. Filters and page size reset the page, Reset filters clears all filters, and history defaults to 10/page with 25/50 options. Filters are local state. Ordering is newest date/time first. Date-only rows show no invented clock; displayed times are truncated to minutes.
- Activity desktop columns are Date / Time, Activity (event, reference or detail, View details), Personnel. The phone list exposes reference, date/time, actor and details. Activity Details shows event, date/time, person, optional reference, details and Close. Row and filtered empty states use `RecordEmpty`. No export button is rendered.

### Duty Schedule and Campus Posts

- Both show the Date & Shift toolbar with date/time, Change, Draft/Checked/Published badge, Add Campus Post, Copy Another Schedule, Apply Template, Check Schedule and Publish Schedule. Disabled publication explains no assignments, overlaps/inactive personnel, or need for a check. **Confirmed gap:** Change and Week View set `stage='date'` and `stage='weekly'`, and the modal title map recognizes both, but neither has a body branch. The visible dialogs have a header Close and shared dismissal behavior, with no date/time fields, weekly roster, or footer action.
- **Duty Schedule** pairs Duty Roster · Guard Groups and campus map. The roster lists every post (number/Map pin), Assigned Guard Group (names or Not assigned), Shift, Guards (badge count), and Action (Edit Group). Header Week View is the incomplete control above. Summary shows selected date/time, assignment count and mapped locations. Roster and map markers cross-highlight on hover.
- **Campus Posts** pairs the same map with Location Assignment Groups. Assign / Edit Group opens the first post; each group's View Group opens editing for its post. Groups display name, members or Not assigned, shift and count. Map header expands/collapses; collapsed pins display numbers, expanded pins names. Clicking a pin opens group editing unless placing/moving. Select Manage campus post for Rename, Move Pin, Remove Post and selected-shift count.
- **Add Campus Post** has one required text field `postName` (80-character limit), Cancel and Place on Map. Trim and case-insensitive uniqueness checks precede placement. Placement status offers Cancel placement. Pointer position becomes clamped percentages; Enter/Space on the map places at center, and a marker can supply its existing coordinates. Post is created only when placed and group editing opens. Move Pin changes coordinates without changing assignments. Rename uses native prompt, validates duplicate names and rewrites `Assignment.location` across dates, including historical rows. Remove Post refuses deletion if any assignment references the name; otherwise it deletes immediately. With zero posts the first-post assign shortcut and template location indexing have no guard for the missing list.
- **Map image** can be uploaded/replaced or removed for the session. Image MIME and size at most 10 MiB are checked; read failures are announced. Unlike the personnel photo path, no image decode is performed before storing the map. The repository currently has no `public/design/campus-map.png`; the built-in missing-map message is expected with default assets. Pins remain functional on the placeholder.
- **Assign Guard Group** is a wide modal with location, shift, selected count, name/ID search, checkbox rows with portrait or initials, ID, and Selected/Available/Inactive/Move from location cues. Inactive rows are disabled. There is no special no-results body for group search. Save Group Draft replaces that exact post/shift's membership and removes chosen guards from other posts at the same exact shift. Deselect all current members and save to remove the group assignments. Cancel drops the selection. An overlap from a different time slot can show a Move from cue but still fail Save, since only identical shift slots are moved automatically.
- **Copy Previous Schedule** takes required `source` and `destination` dates and a `replace` checkbox. Uses the current start/end for both days. Source defaults to demo date; destination uses selected date or 2026-10-26 when selected date equals demo date. Same-date copy, empty source, inactive/missing personnel, overlap, and unconfirmed destination replacement produce errors. Successful copy uses new IDs, changes selected date, and records an activity. It does not publish.
- **Load Schedule Template** offers one selector option, Day Shift · Four Campus Locations, informational preview, replacement checkbox, and Apply Template. Uses selected date/times, first six Active profiles in array order and post positions 0/0/1/1/2/3. Tests conflict against retained rows and requires consent to replace existing exact-slot rows. It logs success and does not publish. Despite its preview wording, it has no rendered list of generated assignments before apply.
- **Schedule Validation** reports global overlaps, selected assignment/post counts, unknown official coverage and the Active-only rule, with Review Draft. **Publish Duty Schedule** shows sample-only warning, selected shift and assigned count, with Cancel and Publish Roster. It rechecks local validity and records Published plus a summary event. No official approval or exported document is produced. The dormant `notice` branch displays a prototype history-export message; no control opens it.

### Responsive behavior

Source styles switch shared record tables to labeled mobile records below 640px. Personnel tabs form a 2×2 group at phone width; directory search spans the row and status/sort share a row. Grid is one column on phones, two at 640–1279px and three on wider screens. Schedule tools wrap and split into sections at narrower widths, with compact phone controls. Roster remains a table with fixed layout and wrapping. Split roster/map and map/groups use the responsive shared grid. Profile identity and photo content wrap/fit within scrollable dialogs. Wider tablet widths may still have internal table scroll, especially directory. Camera/browser-mobile behavior in source is based on file input hints; the suite exercises simulated inputs and viewports.

## 4. Sample posts and assignments

`src/data/data.ts` and the post initializer in `store.ts`. All listed duty rows are **2026-10-19, 06:00–14:00**. Seeded post coordinates are percentages.

| Post | Coordinates | Assignment and personnel |
|---|---|---|
| UNC Arch / Entrance | 15,25 | A-0 / SEC-001 Carlos Ignacio Santos (Senior Security Personnel); A-1 / SEC-002 Ramon Dante Mendoza |
| E-Library | 35,60 | A-2 / SEC-003 Joshua Allen Reyes; A-3 / SEC-004 Miguel Andres Flores |
| JH Building | 55,25 | A-4 / SEC-005 Patricia Lynn Aquino |
| UNC Sports Palace | 75,60 | A-5 / SEC-006 Benedicto Cruz Navarro |

SEC-002–008 are Security Guard positions; SEC-001–006 are Active. SEC-007 Loreto James Villanueva and SEC-008 Elena Marie Castillo are Inactive. The 21 seeded assignments also include 15 dated September 1–15, 2026 for the populated Analytics sample. The default roster has groups 2/2/1/1. All posts are reference locations with no recorded descriptions or individual responsibilities.

## 5. Activity provenance and history integrity

| Source | How it links | History behavior |
|---|---|---|
| Profile `personnelActivity` | `Visit.entryGuardId` or `exitGuardId` equals `Person.id`; `Incident.personnel` equals ID. Checkout also requires a valid `exitAt`. | Derived per person. Check-in uses stored visit date/time, checkout uses Manila conversion, incident uses occurrence time. Excludes account-only visitor actions and direct Personnel changes. |
| Combined visitor history | Admitted entry requires guard or actor ID. Checkout needs actor/guard ID and valid ISO exit. IDs `entry-<visitId>`, `exit-<visitId>`; reference is visit ID, detail is entry/exit gate. | Current account/profile data resolves names. Entry uses valid `entryAt` or visit date/time fallback. Missing exit gate is labeled. Actor key favors personnel ID, then account ID, then unrecorded. |
| Combined incident history | Nonempty `Incident.personnel`; ID `incident-<id>`; details from type/location, reference is incident ID. | Derived from the current incident, so changing responder, date, type or location rewrites what the timeline shows. It is an assignment projection, not a record of who encoded the report. |
| Direct Personnel events | `activity(event,detail)` snapshots actor name/IDs and timestamp. Seed entry `initial` is simulated Roster created on the demo date with role label and no time. | Registration, group save, post create/move/rename/remove, copy, template, publish are logged. `personId` means the actor, not the person registered or reassigned. Detail often stores a name/ID or summary string. Photo edits and account actions do not enter this feed. |
| Lost & Found | Item-local ownership/release actions record actor identity and timestamps. | Neither action contributes to Personnel history. |

Direct events preserve their stored actor name and textual summary within the session. Derived rows can change when source records or name resolution change. Reassigning a roster leaves visitor event IDs intact and does not recalculate saved visitor snapshots. Profile Assignments shows latest rows: copy/template/group edits replace records, and post rename rewrites old location strings. There is no immutable roster revision or assignment-event history.

## 6. Integrations and regression boundaries

| Consumer | Actual relationship and risk |
|---|---|
| Gate & Visitor | Accounts use `personId` for actor attribution, with separate `entryGuardId/entryActorId` and `exitGuardId/exitActorId`. `snapshotVisitorAssignment` uses gate-to-post mapping, date and half-open time `start <= time < end`, and retains post/date/start/end/personIds if a matching group exists. `visitorGatePosts` is empty in the app, so roster assignment does not grant gate permissions or instantiate a verified mapping. Changing personnel eligibility affects guard session validation. |
| Incidents | `Incident.personnel` is an optional-by-empty-string responder ID, separate from `reporter`. The selector permits Active profiles and the existing responder on edit. Reopening resolves the name live; timeline rows follow the current incident responder and occurrence. Keep stable person IDs to avoid broken incident links. |
| Lost & Found | Head-only, uses current account ID/name to record verification and physical handover separately. The current Head lacks a personnel ID. No assignment requirement and no merge into Personnel activity. |
| Head Dashboard | `dashboardShift` defines the demo slot; `getDashboardSummary().scheduled` and schedule links use assignment data for it. Personnel overview uses exact selected shift and unique IDs. Changing that roster changes the dashboard count and related drill-down. |
| Guard Dashboard | Filters live `assignments` by signed-in `personId` and actual campus date or All Dates. Lists post and time with Scheduled; no filter for publication, time-of-day or attendance. Gate scope is account-controlled. Guards can see their own draft rows because the schedule has no separate publish snapshot. |
| Analytics / Reports | Analytics filters assignments by report date, counts records and ranks locations. Reports aggregates scheduled assignments for the included range. Both consume the live pool including historical and draft rows, not unique people or verified attendance. Edits on historical dates and post renames can change historical summaries. |
| Guard Accounts | Lists eligible active profiles without existing account links, derives guard display names, and stores account ID/role/gates independently. `resolveSession` revalidates the linked profile on store updates and logs out an invalid guard. Personnel account integration has no schedule-based gate entitlement. |

## 7. Functional inventory and scheduling classification

Paths below use the full file locations from the source map. `Personnel.tsx` is the primary owner of Personnel and scheduling features.

| Feature | Implementation status | Relevant source files | Existing behavior | Limitations |
|---|---|---|---|---|
| Directory views, status, filters, sort, pagination | Implemented | Personnel.tsx, shared record tools | Table/mobile list or Grid, URL-backed controls | No department, rank, or availability filters |
| Create and view profile | Implemented | Personnel.tsx, data.ts | Generated ID and basic info, Active/Inactive, optional contact and photo | No duplicate-profile check or extended employment data |
| Photo management | Implemented | Personnel.tsx | Add, view, replace, remove; load/error and cancellation | In-memory images |
| Change profile name, contact, position or status; delete profile | Not implemented | Personnel.tsx | Profile fields are read-only apart from photo | Account disable does not change profile status |
| Profile assignment and activity panels | Implemented | Personnel.tsx, personnel-activity.ts | Exact shift plus other retained assignments, derived events | No roster versions or direct Personnel events in profile timeline |
| Global activity history | Implemented | PersonnelActivityHistory.tsx, personnel-activity.ts, store.ts | Activity by date/actor/category plus details | Mixed snapshot and derived provenance; no durable audit log |
| Campus post assignment groups | Implemented | Personnel.tsx | Multiple people per post/shift, multiple non-overlapping assignments per person | Exact shift tuple, no individual duty designation |
| Add, rename, move or remove posts and manage map image | Implemented | Personnel.tsx, store.ts | Named coordinate pins and post actions | No post IDs/descriptions; no bundled campus map; keyboard placement is center or existing marker |
| Daily/selected-shift roster | Partially implemented | Personnel.tsx | Exact date/shift via URL, selected day changes on copy | Change dialog has no body; no fixed-slot selector or general manual shift editor |
| Weekly scheduling | Not implemented | Personnel.tsx | Week View opens an empty titled dialog | No week grid or weekly editing |
| Overnight shifts | Not implemented | Personnel.tsx, data.ts | Same-day slots, `start < end` | No cross-midnight modeling or conflict detection |
| Copy schedules | Implemented | Personnel.tsx | Same-slot copy between two dates with overwrite confirmation | No multi-day copy or versions |
| Reuse schedule templates | Partially implemented | Personnel.tsx | One positional hardcoded template | No template management or generated-row preview; requires sufficient posts |
| Same-slot reassignment and assignment removal | Implemented | Personnel.tsx | Move selected guard to another post, deselect to remove | Replaces rows and IDs; no dedicated temporary-relief workflow |
| Rotation, rest days, availability, emergency coverage | Not implemented | Personnel.tsx, data.ts | No domain fields, views, or rules for these capabilities | Manual group edits are the available mechanism |
| Check overlaps and eligibility | Implemented | Personnel.tsx, data.ts | Active-only groups and copies, same-person/day interval check | Global check can block a selected slot for another slot's conflict |
| Identify unassigned posts / enforce coverage | Partially implemented | Personnel.tsx | Not assigned labels and group counts, nonempty roster required | No required-post or staffing minimum rule |
| Draft, check and publication | Simulated | Personnel.tsx, store.ts | Draft and checked state, local Published marker and event | No Approved state or approval workflow, publication is not required for guards/reports to see data |
| Read previous assignments / versioned schedule archive | Partially implemented | Personnel.tsx, GuardDashboard.tsx | Existing rows accessible through profile, All Dates, or URL-selected date/shift | Mutable pool with no preserved copies on replacement |
| Attendance, check-in for duty, proof of being on post | Not implemented | Personnel.tsx, GuardDashboard.tsx | Scheduled indicators and explicit attendance disclaimer | No timeclock, presence or on-duty selector |
| Print, CSV/PDF/Word export, prepared/noted/approved-by | Not implemented | Personnel.tsx, Reports.tsx | Local roster and validation views; separate report demo | No print layout/print function, real export, signer fields, or schedule archive |
| Report preview and sample archive outside Personnel | Simulated | Reports.tsx | Aggregated summaries, sample archive previews and demo actions | No printable roster or reusable document generator. Generic Modal/Panel and preview-section CSS can be reused for UI. |

## 8. Business-rule details and observations

**Confirmed implementation.** `overlaps` returns true for distinct rows for the same person and calendar date if `a.start < b.end && b.start < a.end`. Adjacent shifts are allowed. Group editing rejects inactive/missing selected people, and template starts from Active rows. Copy rejects inactive source people. Check/publication require a matching validation signature, at least one selected-slot row, all selected-slot people Active, and no overlaps in the entire assignment array. A published slot is a marker, not a copy of a roster. A later direct activity can clear publication across slots. Profile statuses drive login eligibility, not attendance. Post names are case-insensitively unique at create/rename, and a post with any assignment cannot be removed, even if the reference is historical.

**Strengths and reuse.** Shared responsive records, modal focus handling, common fields/filters, canonical person IDs, distinct account permissions, and explicit demo disclaimers already exist. `requestedSchedule`, `overlaps`, `personnelActivity`, `combinedPersonnelHistory`, and reporting date helpers expose the current semantics directly. Importing a second data layer would overlap the current Context responsibility.

**Confirmed limitations and risk points.** Empty Date/Week dialogs leave prominent controls incomplete. Profile controls expose photo only; registration can create duplicate human profiles. Group editor, roster, map and profile all consume the same mutable arrays, and some actions update historic rows. Replacing a group regenerates IDs for unchanged members too. The group cue and save validation differ for overlapping but nonidentical shifts. Template selection depends on mutable ordering and at least four post entries for six guards. Selected profile assignment takes the first exact-slot match. There is no historical freeze for reports, profile assignments or incident projections. Existing report and checkout code depends on person IDs and date/time conventions; changing those requires checking integrations. Activity page's actor filter does not follow the subject of a mutation. The dead history-export notice is not an existing export workflow.

**Inference boundary.** Source establishes the shape and controls, not UNC staffing policies, actual post responsibilities, contractual ranks, approval chains, hardware camera behavior or field usage. A rendered Available cue means eligible under the current form logic, not confirmed availability. None of the above observations assigns future implementation priority.

## 9. Verification coverage

| Script | Relevant existing assertions |
|---|---|
| `scripts/verify-dashboard.mjs` | Directory table/list record parity, pagination and filters, mobile profile entry/focus, registration/contact/default Active, camera vs picker hints, profile tab keyboard behavior, photo load/failure/replacement/removal/cancel and viewport fit. Checks fixture assignment and incident history, schedule drill-down, disabled inactive checkboxes, group removal, local check/publication, copy to Oct 26, template replacement, activity search/actor/date/category, details, pagination/reset, module and roster layout. |
| `scripts/verify-data.mjs` | Fixture totals and uniqueness, roster group sizes and overlap rules, direct/derived history helper behavior and shared style contrast. |
| `scripts/verify-dashboard-data.mjs` | Dashboard schedule counts, presets/drill-downs and shared dataset behavior. |
| `scripts/verify-analytics.mjs` | Assignment-based analytics sample totals and report/date aggregation behavior. |
| `scripts/verify-auth-data.mjs`, `scripts/verify-auth.mjs` | Account eligibility, duplicate prevention and access rules; browser guard account management, protected Personnel routes, own-duty visibility and responsive auth. |
| `scripts/verify-visitors.mjs`, `scripts/verify-visitor-workflows.mjs` | Visitor actor attribution and assignment snapshot rules, handling unavailable historical roster, separate checkout actor and integration behavior. |

The browser suite covers rendering Campus Posts, but does not assert post create/move/rename/remove, multiple pointer/keyboard placement modes, or map-image upload failure. It does not exercise Change or Week View, every schedule copy/overlap error, empty post lists, or a Personnel status edit (no such edit UI). It verifies emulated layouts and file-input behavior, not hands-on camera use, attendance or production authorization. No print/export execution path exists to exercise.

**Audit runs.** `npm run test:data` passed all five scripts. `npm run lint` exited successfully with the existing unused-variable warning in `.agents/skills/design-system/scripts/generate-tokens.cjs:148`. All three scripts in `npm run test:browser` passed against the existing production build served by Vite preview on port 4173. They ran sequentially from a temporary working directory so screenshots and browser profiles stayed outside the repository. The browser run used headless Edge; no fresh build was run for this audit.
