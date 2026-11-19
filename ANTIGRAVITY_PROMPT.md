# Paste into Antigravity Planning mode

Extend the existing Channel Desk local web app into a personal YouTube clipping and analytics workspace. Read README.md, RESEARCH.md, the current source and the tests first. Preserve working features. Select a strong reasoning model included in my current plan; do not require a paid AI API.

My goal is authentic 30–50-second Shorts: human cadence, a standalone hook, complete payoff, readable captions and stable reframing. Keep useful breaths and real laughs. No fake hype, arbitrary sound effects, invented dialogue, forced zooms, or claims that virality is guaranteed.

Constraints:

- No paid inference, clipping, rendering, analytics database or publishing intermediary in the required path. Local compute is acceptable. Free trials and promotional credits do not count as permanent free dependencies.
- Use one local clipping engine. Evaluate zhouxiaoka/autoclip first for its CLI/MCP integration and local ASR/Ollama mode, with artbyjazi/autoclip as an alternative. Inspect their current versions, licenses, requirements and commands instead of relying on old examples.
- Keep heavy media processing in a Python 3.11/3.12 environment separate from the dashboard server. Check this machine's hardware before selecting model sizes. Benchmark a short supplied sample before processing long footage.
- Choose local transcription and local Ollama analysis explicitly. Disable cloud ASR/image generation and paid-provider fallbacks. On any failure, show a useful error instead of silently switching to paid services.
- Use existing/authorized source footage, a local folder queue, FFmpeg, word timestamps, deterministic exports, resumable jobs and source-hash deduplication. Save the source, decisions, timestamps, review status and output paths per job.
- Use an editorial review step before publishing. Add direct YouTube uploading only as a separate user-enabled feature with the appropriate OAuth scope and private-first behavior. Reading analytics must remain usable with read-only access.
- Start with the existing zero-dependency Node + SQLite dashboard; introduce dependencies only when they solve a real requirement. Keep it local by default. Do not expose the app or its credentials publicly.

Milestones:

1. Verify the existing dashboard tests and data model. Add Reporting API reach ingestion for `channel_reach_basic_a1`: discover/reuse jobs, create a job when needed, fetch generated daily reports, handle first-report delays, deduplicate files and handle corrected/backfilled versions. Preserve raw units and validate CTR conversion against official documentation/examples. Sum impressions, but compute aggregate CTR using impression weights. Surface report freshness and gaps.
2. Add per-video drilldowns and supported audience/content-type reports. Keep views and engaged views separate. Never average ratios across videos without the correct weights. Keep lifetime counts distinct from date-range metrics. Implement explicit metric availability and processing timestamps.
3. Add a queue view and a single local clipping-worker adapter with progress, cancellation and bounded retries. Use repository-native APIs/CLI/MCP. Do not issue shell commands assembled from untrusted video titles or URL strings.
4. Add an editor/review screen with original playback, candidate timestamps, framing options, caption correction and full rendered preview. Store versioned edit decisions and allow a rejected candidate to be replaced without repeating transcription.
5. Link published video IDs to clip provenance so I can compare hook, source, duration and caption presets after YouTube reports become available. Label comparisons observational; do not invent causes or success probabilities.
6. Only where an important metric is unavailable from the official APIs or CSV, add an optional DOM collector. Use my normal authenticated browser session with a dedicated profile and read visible Studio data. Let me log in manually. Do not export passwords, cookies or browser tokens. Record exact channel, video, period, units and source. Stop on layout mismatch. Keep a CSV path available.

Validation:

- Test pagination, channel isolation, token expiration, unsupported metric combinations, quota failures, duplicate input jobs, malformed model output, unavailable retention, Reporting API backfills and mixed date windows with meaningful fixtures.
- Show clearly labeled sample data only when I deliberately enable demo mode. A connected badge requires a successful authorized response.
- Verify the actual browser layout at desktop and mobile widths when preview is available. State unverified parts honestly.
- Deliver exact run commands and local file locations. Do not claim that channels are connected, jobs are scheduled or videos are published unless verified.

Build one milestone at a time and summarize the resulting behavior and validation after each. Do not invent missing credentials or switch to paid services to make a demo appear successful.
