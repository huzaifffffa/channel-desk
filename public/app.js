const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = value => value == null ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
const compact = value => value == null ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const seconds = value => value == null ? '—' : `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
const sum = values => { const known = values.filter(v => typeof v === 'number' && Number.isFinite(v)); return known.length ? known.reduce((a, b) => a + b, 0) : null; };
let state = { channels: [], syncing: false }, demo = false, sort = 'views', sortDirection = -1, poll;
let toastTimer;

function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 6500); }
async function api(url, data, method = 'POST') {
  const result = await fetch(url, data === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const json = await result.json(); if (!result.ok) throw new Error(json.error || 'Request failed.'); return json;
}
const range = () => ({ start: $('start-date').value, end: $('end-date').value });
const selectedChannels = () => state.channels.filter(c => $('channel-filter').value === 'all' || c.id === $('channel-filter').value);

function videoRows(channel) {
  const metadata = new Map(channel.videos.map(v => [v.id, v]));
  const metrics = new Map((channel.reports.video?.payload || []).map(v => [v.video, v]));
  const revenue = new Map((channel.reports.revenue?.payload || []).map(v => [v.video, v]));
  return [...new Set([...metadata.keys(), ...metrics.keys()])].map(id => ({ ...metadata.get(id), ...metrics.get(id), ...revenue.get(id),
    id, title: metadata.get(id)?.title || metrics.get(id)?.title || id, channel: channel.id, channelTitle: channel.title,
    source: channel.reports.video?.source || 'Metadata only' }));
}
function allRows() { return selectedChannels().flatMap(videoRows); }
function metricRows(channel) { return channel.reports.video?.payload ?? channel.reports.daily?.payload ?? []; }
function netSubscribers(v) { return v.netSubscribers ?? (v.subscribersGained == null || v.subscribersLost == null ? null : v.subscribersGained - v.subscribersLost); }

function chart(target, points, label) {
  if (!points.length) { target.innerHTML = `<div class="empty">${esc(label)}</div>`; return; }
  const width = 680, height = 185, pad = 14;
  const maximum = Math.max(1, ...points.map(p => p.y)), minimumX = Math.min(...points.map(p => p.x)), maximumX = Math.max(...points.map(p => p.x));
  const coords = points.map(p => ({ x: pad + (p.x - minimumX) / (maximumX - minimumX || 1) * (width - pad * 2), y: height - pad - p.y / maximum * (height - pad * 2), p }));
  const line = coords.map(p => `${p.x},${p.y}`).join(' ');
  const grid = [0, .25, .5, .75, 1].map(v => `<line x1="${pad}" y1="${height - pad - v * (height - pad * 2)}" x2="${width - pad}" y2="${height - pad - v * (height - pad * 2)}" stroke="#edf0f2" stroke-dasharray="4 5"/>`).join('');
  const area = `${coords[0].x},${height - pad} ${line} ${coords.at(-1).x},${height - pad}`;
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><title>${esc(label)}. Maximum ${fmt(maximum)}.</title>${grid}<polygon points="${area}" fill="#e6f3ed"/><polyline points="${line}" fill="none" stroke="#078367" stroke-width="2.5" stroke-linejoin="round"/>${coords.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#078367"><title>${esc(p.p.title || p.p.x)}: ${fmt(p.p.y)}</title></circle>`).join('')}</svg>`;
}

function render() {
  const current = $('channel-filter').value;
  $('channel-filter').innerHTML = '<option value="all">All channels</option>' + state.channels.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
  $('channel-filter').value = state.channels.some(c => c.id === current) ? current : 'all';
  $('demo-notice').classList.toggle('hidden', !demo);
  $('sync-button').disabled = demo || state.syncing;
  $('sync-button').textContent = state.syncing ? 'Syncing…' : 'Sync channels';
  const channels = selectedChannels(), rows = channels.flatMap(metricRows);
  const stats = [
    ['Views', sum(rows.map(v => v.views)), 'For the selected date range'],
    ['Watch hours', sum(rows.map(v => v.estimatedMinutesWatched)) == null ? null : sum(rows.map(v => v.estimatedMinutesWatched)) / 60, 'Time people spent watching'],
    ['Engaged views', sum(rows.map(v => v.engagedViews)), 'Kept separate from total views'],
    ['Net subscribers', sum(rows.map(netSubscribers)), 'Gained minus lost · Video-attributed']
  ];
  $('stats').innerHTML = stats.map(([title, value, note]) => `<article class="stat"><div class="stat-label">${title}</div><div class="stat-value">${compact(value)}</div><div class="stat-note">${note}</div></article>`).join('');
  const times = channels.map(c => c.last_sync || c.reports.video?.updated).filter(Boolean).sort();
  $('sync-status').textContent = state.syncing ? 'Fetching official YouTube reports…' : demo ? 'Sample data only' : times.length ? `Last fetched ${new Date(times.at(-1)).toLocaleString()}` : state.channels.length ? 'Choose dates and sync' : 'No channels connected';
  const daily = new Map();
  for (const c of channels) for (const row of c.reports.daily?.payload || []) daily.set(row.day, (daily.get(row.day) || 0) + row.views);
  const points = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([day, views], i) => ({ x: i, y: views, title: day }));
  chart($('views-chart'), points, 'Daily views appear after API sync. Per-video CSV totals do not include a daily time series.');
  $('chart-start').textContent = daily.size ? [...daily.keys()].sort()[0] : range().start;
  $('chart-end').textContent = daily.size ? [...daily.keys()].sort().at(-1) : range().end;
  $('chart-source').textContent = points.length ? 'API daily views' : 'Waiting for daily data';
  $('channel-list').innerHTML = channels.length ? channels.map(c => `<div class="channel-item"><div class="channel-row"><div class="channel-identity"><span class="avatar">${esc(c.title.charAt(0).toUpperCase())}</span><span>${esc(c.title)}</span></div><strong>${compact(sum(metricRows(c).map(v => v.views)))}</strong></div><p class="channel-note">${c.connected ? 'Google connected' : demo ? 'Sample channel' : 'CSV snapshot'} · ${c.videos.length} videos${c.reports.video ? ` · ${esc(c.reports.video.source)}` : ' · No report for these dates'}</p>${c.error ? `<p class="channel-note error-note">${esc(c.error)}</p>` : ''}</div>`).join('') : '<p class="empty">Connect a channel for automatic monitoring, or import a Studio CSV without any keys.</p>';
  $('settings-channels').innerHTML = state.channels.length ? state.channels.map(c => `<div class="settings-row"><span>${esc(c.title)}<br><small>${c.connected ? 'Google connected' : 'CSV import'}</small></span><button class="remove-button" data-remove="${esc(c.id)}">Remove local data</button></div>`).join('') : '<p class="fine-print">No channels yet.</p>';
  renderTable();
  for (const [kind, dimension] of [['traffic', 'insightTrafficSourceType'], ['country', 'country'], ['device', 'deviceType']]) {
    const grouped = new Map(); for (const c of channels) for (const row of c.reports[kind]?.payload || []) grouped.set(row[dimension], (grouped.get(row[dimension]) || 0) + row.views);
    $(kind).innerHTML = grouped.size ? [...grouped].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => `<div class="breakdown-row"><span>${esc(name.replaceAll('_', ' '))}</span><strong>${compact(count)}</strong></div>`).join('') : '<p class="empty">Available after a successful API sync.</p>';
  }
}

function tableData() {
  const search = $('search').value.toLocaleLowerCase();
  return allRows().filter(v => v.title.toLocaleLowerCase().includes(search)).sort((a, b) => {
    const av = a[sort], bv = b[sort]; if (av == null && bv == null) return a.title.localeCompare(b.title); if (av == null) return 1; if (bv == null) return -1; return sortDirection * (av - bv);
  });
}
function renderTable() {
  const rows = tableData();
  $('video-rows').innerHTML = rows.length ? rows.map(v => `<tr><td><button class="video-name" data-video="${esc(v.id)}" data-channel="${esc(v.channel)}">${esc(v.title)}</button><span class="video-channel">${esc(v.channelTitle)}${v.publishedAt ? ` · ${new Date(v.publishedAt).toLocaleDateString()}` : ''}</span></td><td>${fmt(v.views)}</td><td>${fmt(v.engagedViews)}</td><td>${fmt(v.estimatedMinutesWatched == null ? null : v.estimatedMinutesWatched / 60)}</td><td>${seconds(v.averageViewDuration)}</td><td>${v.averageViewPercentage == null ? '—' : `${fmt(v.averageViewPercentage)}%`}</td><td>${fmt(v.likes)}</td><td>${fmt(v.comments)}</td><td>${fmt(v.shares)}</td><td>${fmt(netSubscribers(v))}</td><td>${fmt(v.impressions)}</td><td>${v.ctr == null ? '—' : `${fmt(v.ctr)}%`}</td><td>${v.estimatedRevenue == null ? '—' : `$${fmt(v.estimatedRevenue)}`}</td><td>${fmt(v.lifetimeViews)}</td><td><span class="source-tag">${esc(v.source)}</span></td></tr>`).join('') : '<tr><td colspan="15"><div class="empty">Your video library will appear here. Connect Google, import a CSV, or explore the sample dashboard.</div></td></tr>';
}

async function load() {
  if (demo) return;
  state = await api(`/api/dashboard?${new URLSearchParams(range())}`); render();
  clearTimeout(poll); poll = setTimeout(() => load().catch(e => toast(e.message)), state.syncing ? 2500 : 60000);
}
function showSetup() { $('setup-dialog').showModal(); }
$('channels-button').onclick = showSetup; $('setup-shortcut').onclick = showSetup;
$('overview-button').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
$('import-button').onclick = () => { $('import-start').value = range().start; $('import-end').value = range().end; $('import-dialog').showModal(); };
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
$('channel-filter').onchange = render; $('search').oninput = renderTable;
$('apply-button').onclick = () => { if (demo) toast('Sample data uses a fixed 28-day window.'); else load().catch(e => toast(e.message)); };
document.querySelectorAll('[data-sort]').forEach(button => button.onclick = () => { sortDirection = sort === button.dataset.sort ? -sortDirection : -1; sort = button.dataset.sort; renderTable(); });
$('sync-button').onclick = async () => { try {
  if (!state.channels.some(c => c.connected)) return showSetup();
  const channel = $('channel-filter').value;
  await api('/api/sync', { ...range(), ...(channel !== 'all' ? { channel } : {}) }); await load();
} catch (e) { toast(e.message); } };
$('config-form').onsubmit = async event => { event.preventDefault(); try {
  await api('/api/config', { clientId: $('client-id').value, clientSecret: $('client-secret').value }); $('client-secret').value = ''; toast('Google client saved locally. Continue with Google to connect a channel.');
} catch (e) { toast(e.message); } };
$('connect-button').onclick = async () => { try { if (demo) throw new Error('Exit sample mode before connecting Google.'); const result = await api('/api/connect', { monetary: $('monetary').checked }); window.location.assign(result.url); } catch (e) { toast(e.message); } };
$('import-form').onsubmit = async event => { event.preventDefault(); try {
  if (demo) throw new Error('Exit sample mode before importing your own data.');
  const file = $('csv-file').files[0]; if (!file || file.size > 10 * 1024 * 1024) throw new Error('Choose a CSV smaller than 10 MB.');
  const dates = { start: $('import-start').value, end: $('import-end').value };
  const result = await api('/api/import', { title: $('import-title').value, channelId: $('import-channel-id').value, csv: await file.text(), ...dates });
  $('start-date').value = dates.start; $('end-date').value = dates.end; $('import-dialog').close(); await load(); toast(`Imported ${result.imported} videos. No API key was needed.`);
} catch (e) { toast(e.message); } };
$('settings-channels').onclick = async event => { const target = event.target.closest('[data-remove]'); if (!target) return; try {
  if (demo) throw new Error('Sample channels are temporary. Exit sample mode to return to your data.');
  const channel = state.channels.find(c => c.id === target.dataset.remove);
  if (!confirm(`Remove ${channel.title} and its analytics from this computer?`)) return;
  await api('/api/channel', { id: channel.id }, 'DELETE'); await load();
} catch (e) { toast(e.message); } };
$('video-rows').onclick = async event => { const target = event.target.closest('[data-video]'); if (!target) return;
  $('retention-title').textContent = target.textContent; $('retention-status').textContent = 'Loading retention from YouTube…'; $('retention-chart').innerHTML = ''; $('retention-dialog').showModal();
  try {
    const result = demo ? { rows: Array.from({ length: 20 }, (_, i) => ({ elapsedVideoTimeRatio: i / 19, audienceWatchRatio: 1.05 - i * .025 + Math.sin(i) * .04 })) } : await api(`/api/retention?${new URLSearchParams({ ...range(), channel: target.dataset.channel, video: target.dataset.video })}`);
    $('retention-status').textContent = demo ? 'Fictional sample retention curve.' : result.rows.length ? 'Retention ratio by position in the video. Hover on points for values.' : 'YouTube has no retention report for this video and date range.';
    chart($('retention-chart'), result.rows.map(v => ({ x: v.elapsedVideoTimeRatio * 100, y: v.audienceWatchRatio * 100, title: `${Math.round(v.elapsedVideoTimeRatio * 100)}% through video` })), 'Audience retention (%)');
  } catch (e) { $('retention-status').textContent = e.message; }
};
$('export-button').onclick = () => {
  const columns = ['title', 'channelTitle', 'id', 'views', 'engagedViews', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'likes', 'comments', 'shares', 'subscribersGained', 'subscribersLost', 'impressions', 'ctr', 'estimatedRevenue', 'lifetimeViews', 'source'];
  const cell = value => { let v = String(value ?? ''); if (/^[=+@-]/.test(v)) v = "'" + v; return `"${v.replaceAll('"', '""')}"`; };
  const text = [columns.join(','), ...tableData().map(row => columns.map(c => cell(row[c])).join(','))].join('\r\n');
  const objectURL = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = objectURL; a.download = `channel-desk-${range().start}-${range().end}${demo ? '-SAMPLE' : ''}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
};

function makeDemo() {
  const { start, end } = range();
  return { syncing: false, channels: ['Studio Notes', 'The Long Conversation'].map((title, c) => {
    const videos = Array.from({ length: 4 }, (_, i) => ({ id: `DEMO${c}${String(i).padStart(6, '0')}`, title: ['The idea I almost threw away', 'What makes an opening work?', 'A small change, a better story', 'Why the quiet moment matters'][i], publishedAt: new Date(Date.parse(end) - i * 86400000 * 3).toISOString(), lifetimeViews: (c + 1) * (i + 1) * 48210 }));
    const video = videos.map((v, i) => ({ video: v.id, views: 42000 + c * 6000 + i * 2310, engagedViews: 31000 + i * 1900, estimatedMinutesWatched: 22000 + i * 2700, averageViewDuration: 35 + i * 2, averageViewPercentage: 74 + i * 3, likes: 1400 + i * 180, comments: 80 + i * 11, shares: 210 + i * 25, subscribersGained: 150 + i * 20, subscribersLost: 5 + i, impressions: 320000 + i * 8000, ctr: 5.4 + i * .3 }));
    const totalViews = video.reduce((a, v) => a + v.views, 0), weights = Array.from({ length: 28 }, (_, i) => 10 + Math.sin(i * .6 + c) * 4 + i * .55), weight = weights.reduce((a, b) => a + b, 0);
    const report = payload => ({ payload, source: 'SAMPLE', updated: new Date().toISOString() });
    return { id: `sample-${c}`, title, connected: false, videos, metadata: {}, last_sync: null, reports: { video: report(video),
      daily: report(weights.map((w, i) => ({ day: new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10), views: Math.round(totalViews * w / weight) }))),
      country: report([{ country: 'US', views: 64000 }, { country: 'GB', views: 31000 }, { country: 'PK', views: 22000 }]),
      device: report([{ deviceType: 'MOBILE', views: 101000 }, { deviceType: 'DESKTOP', views: 19000 }]),
      traffic: report([{ insightTrafficSourceType: 'SHORTS', views: 110000 }, { insightTrafficSourceType: 'YT_SEARCH', views: 14000 }]) } };
  }) };
}
$('demo-button').onclick = () => { clearTimeout(poll); demo = true; state = makeDemo(); render(); };
$('exit-demo').onclick = () => { demo = false; load().catch(e => toast(e.message)); };

try {
  const status = await api('/api/status'); $('start-date').value = status.range.start; $('end-date').value = status.range.end; $('redirect-uri').textContent = status.redirectUri;
  if (new URLSearchParams(location.search).has('connected')) { toast('Channel connected. The first sync is running.'); history.replaceState({}, '', '/'); }
  await load();
} catch (e) { toast(e.message); }
