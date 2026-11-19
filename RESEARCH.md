# Free clipping and YouTube monitoring

Research checked on **20 November 2026 (Asia/Karachi)**. Recommendations are based on current primary repository documentation, configuration requirements, licensing and issue reports. Upstream clippers were not installed or performance-tested. A free local execution path is different from a hosted product's trial or an API provider's promotional credits.

## Recommended approach

Use **Antigravity Planning mode** to build and modify the system. Use **Fast mode** for small corrections, commands and routine changes. Select the strongest reasoning model included in your account for architecture, OAuth and debugging; exact model availability changes. Antigravity's own free access is subject to account/model usage limits. It is the development agent, while a local queue worker does the recurring processing.

Start with a local pipeline and local dashboard. This avoids paid inference, render hosting and databases. Your existing computer, electricity, storage and internet are still needed; running local software is not literally resource-free. Neither unlimited cloud GPU time nor permanently free 24/7 hosting can be guaranteed.

## GitHub shortlist

| Repository | License and free path | Where it fits | Limitation |
| --- | --- | --- | --- |
| [zhouxiaoka/autoclip](https://github.com/zhouxiaoka/autoclip) | MIT; choose local Whisper/SenseVoice and Ollama/LM Studio | First choice for Antigravity orchestration; desktop, CLI and MCP | Cloud transcription, cloud analysis, image generation and posting intermediaries are separate optional services. Disable the default branded outro if unwanted. |
| [artbyjazi/autoclip](https://github.com/artbyjazi/autoclip) | MIT; local Whisper, Ollama and FFmpeg | Smaller alternative for a custom review UI | Pre-1.0; an open Windows/Ollama highlight-timeout issue means local reliability needs a sample test. Python 3.11/3.12 and FFmpeg with libass are specified. |
| [modelscope/FunClip](https://github.com/modelscope/FunClip) | MIT source; locally deployed speech/transcript clipping | Text-based selection and speaker-oriented editing | Choose local components. Its optional cloud LLM integrations are not a guarantee of zero-cost AI highlight selection. Check licenses of the exact model weights you enable. |
| [ClipsAI/clipsai](https://github.com/ClipsAI/clipsai) | MIT; local Python library | Build a custom transcript-based clipper | More integration work than a finished app. Its documented resize/diarization path requires a free Hugging Face token and gated-model access. |
| [umschaudhary/verticlip](https://github.com/umschaudhary/verticlip) | MIT; local Whisper/Ollama/FFmpeg | Experimental CLI automation with a persistent ledger | Small project; quickstart targets macOS/Linux. Prefer a Windows-native base for your machine. |

Useful building blocks: [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/). faster-whisper transcribes; it does not itself decide which moments make a good Short. FFmpeg renders; it does not provide editorial judgment. Use local source files as a reliable ingest path when URL extraction fails.

I would exclude [Anil-matcha/AI-Youtube-Shorts-Generator](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator) from a strict no-cloud-key shortlist in its current documented configuration: its default API mode uses MuAPI, while its local mode still asks for OpenAI or Gemini for highlight ranking. Modifying it for Ollama is possible engineering work, not an existing zero-key guarantee.

## Workflow to automate

1. Watch a local input folder or a deliberate source queue. Store each job and source hash in SQLite so it cannot silently duplicate work.
2. Extract audio and transcribe locally with word timestamps. On a CPU-oriented laptop, start with a smaller model and int8 compute; benchmark one real video before larger downloads. Avoid running a large transcription model and a large LLM simultaneously on limited RAM.
3. Use the local LLM to propose distinct 30–50-second moments with their original timestamps, surrounding context, hook and payoff. Reject near-duplicates and fragments that depend on missing context.
4. Adjust boundaries to complete words and thoughts. Preserve useful breaths, laughs, hesitations and human pacing. Do not synthesize lines the speaker never said.
5. Reframe to 9:16 with stable face tracking. Use a wide or two-person layout when that preserves meaning better than an aggressive crop.
6. Correct and burn captions. Use short readable phrases, preserve names, and keep text away from platform controls.
7. Normalize audio gently, export, then review the full clip with sound. Inspect caption accuracy, framing and the final sentence.
8. Export approved clips. Publishing is a separate opt-in stage; Google's direct upload API avoids a paid publishing intermediary.
9. Associate each uploaded video ID with its clip, source, hook, duration, caption preset and edit decisions. Use the dashboard to compare like-for-like results after reporting delays.

Use Windows Task Scheduler for startup or a persistent local worker for queues. Antigravity need not stay open after the software is written. A running local process cannot monitor or render while its host computer is asleep.

## Skills that help

- **AutoClip's own agent skill:** [source](https://github.com/zhouxiaoka/autoclip/blob/main/skills/autoclip/SKILL.md). Install into the chosen agent using `npx skills add zhouxiaoka/autoclip`. This provides the repository's actual CLI/MCP workflow instead of guessed commands. It does not remove the need to configure a local model.
- **Remotion skills:** [official guide](https://www.remotion.dev/docs/ai/skills), [repository](https://github.com/remotion-dev/skills). Useful if building reusable caption or motion templates with Remotion. Optional: `npx skills add remotion-dev/skills`. Remotion's runtime is free for individuals and companies up to three people under its terms; it is not an unrestricted free dependency for every business. FFmpeg/libass is the simpler no-subscription rendering default.
- **Custom editorial instructions:** specify a standalone hook, a complete payoff, original speech only, 30–50 seconds, no fake hype, no stock effects added by habit, and a maximum of three distinct candidates before review.
- **Custom caption/framing QA instructions:** verify names against the source audio, check word timing, protect safe areas, avoid jittery crops, and watch the complete rendered output.
- **Custom results-review instructions:** compare retention, average percentage viewed, engaged views and subscriber changes by clip type and age. Do not label a model's heuristic score as a measured probability of virality or promise views.

Skills guide the coding/editorial workflow. Better results still depend on the source material, model capability, accurate transcription and an actual review pass. Current Antigravity documentation defaults to `.agents/skills/<name>/SKILL.md`, with legacy `.agent/skills` compatibility.

## Keys and free replacements

| Capability | Common paid dependency | No-payment path | Credential needed |
| --- | --- | --- | --- |
| Transcription | OpenAI Whisper API / cloud ASR | Local faster-whisper or the clipper's local ASR | None after model downloads |
| Highlight selection, titles | OpenAI / Anthropic / cloud Gemini | Ollama with a locally runnable model | None for the local Ollama endpoint |
| Rendering and captions | Hosted clipping API | FFmpeg + libass | None |
| Face-aware framing | Hosted auto-crop API | Local OpenCV/MediaPipe or the selected clipper's implementation | None for basic local tracking |
| Speaker diarization | Hosted transcription platform | Local model pipeline | Some pyannote paths need a free Hugging Face token and acceptance of model terms; skip diarization for a zero-token single-speaker path |
| App database | Managed database subscription | SQLite on the computer | None |
| Channel/video metadata | Paid analytics provider | YouTube Data API within assigned quotas | OAuth access token for owned/private data; a public-data API key is optional in other designs |
| Watch time and retention | Paid analytics provider | YouTube Analytics API within assigned quotas | Free Google OAuth client ID/secret and channel authorization |
| Automated impressions / CTR | Paid analytics provider | YouTube Reporting API reach reports | Same OAuth authorization; enable Reporting API and create a report job |
| All-key-free analytics snapshots | Any API integration | Manual YouTube Studio CSV export | No developer key; requires your normal Studio login |
| Studio-only visible metrics | Paid tool | Optional DOM reader in your authenticated browser | Browser session; no developer API key |
| Publishing | Third-party posting service | Direct YouTube Data API upload | OAuth with upload scope; separate from read-only monitoring |

Free cloud inference tiers with rate limits or temporary credits are not the foundation of this recommendation. Private analytics cannot be obtained anonymously by swapping in an unofficial endpoint.

## Dashboard: what data comes from where

| Requirement | Preferred source | Availability |
| --- | --- | --- |
| Titles, publish dates, uploads, current lifetime counts | Data API | Poll and batch requests; counters are separate from range reports |
| Views, engaged views, watch time, engagement, attributed subs | Analytics API | Query supported metric/dimension combinations |
| Retention curve | Analytics API | Separate video-level request; limited data may be withheld |
| Traffic, countries, devices | Analytics API | Supported channel/video reports; thresholds can limit detail |
| Revenue | Analytics API | Monetary scope and eligible monetized channel |
| Thumbnail impressions and CTR | Reporting API `channel_reach_basic_a1` | Daily generated files, not a live arbitrary-range query; first job output can take up to 24 hours |
| Exact Studio realtime cards or other unavailable fields | Studio CSV / optional DOM | Only fields actually displayed/exported; not a promise of every Studio card |

The Data API has assigned daily quotas; the current getting-started page lists 10,000 daily units for ordinary endpoints and separate default buckets for search and uploads. Read-only list requests are inexpensive; use uploads playlists and batch metadata rather than repeated searches. Increasing polling frequency does not eliminate Analytics processing delays. Google's data model currently describes typical Analytics latency of 48–72 hours.

**DOM fallback:** use your own authenticated Studio browser profile, read rendered values only, and record channel, video ID, reporting period, metric name, units, source and collection time. Detect unexpected page layouts and stop that collector rather than guessing. Do not automate password/2FA entry or move browser cookies into the app. A Studio layout change, login expiry or missing card can interrupt collection. Keep DOM values separate from API reports and do not call an inferred field an official API metric. No DOM collector was run or installed here.

## What was built in this package

`Channel Desk` is a local monitoring starter with the core Data/Analytics integrations and manual Studio CSV import. It does not yet run a clipping pipeline or download Reporting API reach jobs, and it does not yet implement DOM collection. See `README.md` for the exact implemented features and validation limits. This is a source-code deliverable, not a claim that your Google channels are already linked.

## Primary references

- Antigravity modes: https://antigravity.google/docs/artifact-review
- Antigravity skills: https://antigravity.google/docs/skills
- AutoClip: https://github.com/zhouxiaoka/autoclip and its linked CLI/MCP and skill documentation
- Smaller AutoClip: https://github.com/artbyjazi/autoclip ; Windows issue: https://github.com/artbyjazi/autoclip/issues/3
- FunClip: https://github.com/modelscope/FunClip
- ClipsAI: https://github.com/ClipsAI/clipsai
- Verticlip: https://github.com/umschaudhary/verticlip
- Excluded key-dependent generator: https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator
- Remotion skills and license: https://www.remotion.dev/docs/ai/skills and https://www.remotion.dev/pricing
- YouTube channel reports: https://developers.google.com/youtube/analytics/channel_reports
- Analytics metrics: https://developers.google.com/youtube/analytics/metrics
- Analytics freshness: https://developers.google.com/youtube/analytics/data_model
- Data API quotas: https://developers.google.com/youtube/data/getting-started
- Reporting reach: https://developers.google.com/youtube/reporting/v1/reports/channel_reports
- Reporting job creation: https://developers.google.com/youtube/reporting/v1/reference/rest/v1/jobs/create
- OAuth refresh token expiration: https://developers.google.com/identity/protocols/oauth2
