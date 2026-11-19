# Channel Desk

A local web app for monitoring your own YouTube channels. There are no npm dependencies, paid analytics services, subscription gates, or watermarks. Requires Node.js **22.13+**; Node 24 is recommended. Node may print a warning about its built-in SQLite module.

## Run

Open a terminal in this folder:

```powershell
npm start
```

Then open **http://localhost:3010/**. On Windows, you can also double-click `Start-Channel-Desk.cmd`. You do not need `npm install`.

The dashboard starts empty. Use **Explore sample dashboard** to view clearly labeled fictional data; sample mode never changes your actual records.

## Connect real channels

1. Open https://console.cloud.google.com/ and create a project.
2. Enable **YouTube Data API v3** and **YouTube Analytics API**. These APIs use quotas; a paid AI API and billing account are not part of this setup.
3. Configure the Google OAuth consent screen. While using External / Testing, add every Google account you will connect as a Test user.
4. Create an OAuth client with type **Web application**. Register the exact redirect URI `http://localhost:3010/oauth/callback`.
5. Open **Channels & setup** in the app, save the client ID and secret locally, and choose **Continue with Google**. Do not send these credentials in chat.
6. Repeat the sign-in for each Google / Brand Account channel identity. An API key alone cannot provide private watch time or retention. The authenticated identity must have the channel access supported by the APIs; Studio delegated permissions do not automatically confer every API permission.
7. Request monetary access only for monetized channels. Revenue queries require the monetary scope and YouTube Partner Program eligibility.

The first connection starts a 28-day sync. Sync runs hourly while this server and computer remain awake. You can query other date ranges and press **Sync channels**. Google external apps left in Testing generally receive refresh tokens that expire after seven days; reconnect when prompted. A public app may require Google's verification process. There is no claim that a local process continues after the computer sleeps.

## Available now

- Multiple channels, channel filter, date windows, title search, sortable metrics and CSV export.
- Uploads inventory with paginated metadata and lifetime view counts.
- Selected-period views, engaged views, watch hours, average view duration, average percentage viewed, likes, comments, shares and video-attributed subscriber changes.
- Daily view chart; channel-level traffic sources, countries and devices.
- On-demand per-video retention with a 12-hour cache.
- Optional revenue reports for eligible connected channels.
- Manual per-video YouTube Studio CSV import, including impressions and CTR when those columns are included in the export.
- Local SQLite persistence, encrypted OAuth credentials, PKCE and browser-bound OAuth state.

This starter does **not** yet implement Reporting API job downloads, a Studio DOM collector, upload/publishing, the clipping worker, content-type filters, comparisons, unique-viewer analytics, demographics or every metric/card found in YouTube Studio. Reach metrics in this version come from Studio CSV imports. `RESEARCH.md` describes the full architecture, including automated reach reports.

## No-key operation

In YouTube Studio, open Analytics → Advanced mode, choose your period, set the table to Content / Video, and export **Table data (.csv)**. Use English column headings. Import that CSV with its exact reporting dates and channel name. This is a manual snapshot, not automatic monitoring.

An optional channel ID lets an import match a Google-connected channel. Import replaces that channel's video report for the exact dates; a later API sync for the same dates replaces that report again. Daily charts come from the API, so CSV imports do not fabricate a time series. Files with only chart dates and no video IDs are rejected. Export revenue in USD if you want the USD revenue column populated.

## Data interpretation

- A dash means unavailable, not zero.
- Lifetime public counters are displayed separately from selected-period analytics.
- Missing rows are not proof of zero views. Metadata-only entries remain visible.
- Analytics can lag by 48–72 hours. A fetch timestamp is not a claim that YouTube processed every date through the requested end date; the daily chart ends at the latest returned day.
- Per-video subscriber totals reflect video-attributed subscriptions and may differ from the full channel total.
- Different metrics can have different processing and availability constraints. Low-volume audience reports can be withheld.
- Store impressions CTR as a percentage value in CSV, e.g. `4.2` for 4.2%.

## Privacy and deployment

This version binds to `127.0.0.1` and is for use on your own computer. The browser speaks only to this server. The backend sends OAuth/API requests directly to Google. No source footage or analytics is sent to an AI provider.

Credentials are AES-GCM encrypted in the local database; the decryption key is in the same `data/` directory. Protect that directory with your operating system permissions. Encryption does not protect against someone who can read both the database and its key. Back up the whole `data/` folder together; never publish or commit it. Removing a channel deletes its local records. Revoke Google access separately from your Google account if desired.

Do not put this personal local app on a public port. A hosted version needs application authentication, HTTPS, tenant isolation, deployment secrets, a dedicated worker and a configured public OAuth callback. The analytics frontend can be hosted independently, but heavy transcription/rendering belongs on the local worker. Running a new cloud server continuously is not guaranteed free.

## Validation

```powershell
npm test
```

The test suite covers CSV parsing, missing values, dates, authenticated encryption, analytics and uploads pagination, channel/range isolation, cross-site request rejection, credential non-disclosure, OAuth session binding and a full sync using mocked Google responses. Syntax checks also run during preparation.

The preparation environment blocked loopback network access. The browser preview could not connect, so visual/browser behavior and a real Google OAuth login remain unverified. No real channel was connected, no real analytics was fetched, and the upstream clippers were researched rather than installed or benchmarked.

## Files

- `RESEARCH.md`: repository shortlist, free alternatives and dashboard data map.
- `ANTIGRAVITY_PROMPT.md`: implementation brief for extending the app with a local clipper.
- `server.mjs`, `lib.mjs`, `public/`: working local dashboard source.
- `test/`: automated tests with synthetic fixtures.
