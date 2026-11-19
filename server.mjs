import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { vault, defaultRange, dateRange, importStudioCSV, googleJSON, queryReport, fetchVideos } from './lib.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const BASE_METRICS = 'views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost';
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'];

export function createApp({ dataDir = path.join(root, 'data'), fetcher = fetch, port = 3010, schedule = true } = {}) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const keyFile = path.join(dataDir, 'vault.key');
  if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const secrets = vault(readFileSync(keyFile));
  const db = new DatabaseSync(path.join(dataDir, 'channels.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, title TEXT NOT NULL, tokens TEXT, metadata TEXT NOT NULL DEFAULT '{}', last_sync TEXT, error TEXT);
    CREATE TABLE IF NOT EXISTS videos (channel TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(channel,id));
    CREATE TABLE IF NOT EXISTS reports (channel TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE, start TEXT NOT NULL, end TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, source TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(channel,start,end,kind));
    CREATE TABLE IF NOT EXISTS retention (channel TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE, video TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, payload TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(channel,video,start,end));`);
  const sessions = new Map(), pending = new Map();
  const origin = `http://localhost:${port}`;
  let activeSync = null;
  const getConfig = () => { const r = db.prepare('SELECT secret FROM config WHERE id=1').get(); return r ? secrets.open(r.secret) : {}; };
  const saveReport = (channel, range, kind, payload, source = 'api') => db.prepare('INSERT OR REPLACE INTO reports VALUES (?,?,?,?,?,?,?)').run(channel, range.start, range.end, kind, JSON.stringify(payload), source, new Date().toISOString());
  const getReport = (channel, range, kind) => { const r = db.prepare('SELECT * FROM reports WHERE channel=? AND start=? AND end=? AND kind=?').get(channel, range.start, range.end, kind); return r ? { ...r, payload: JSON.parse(r.payload) } : null; };

  async function tokenFor(channel) {
    const row = db.prepare('SELECT tokens FROM channels WHERE id=?').get(channel);
    if (!row?.tokens) throw new Error('This channel uses CSV imports. Connect it with Google to enable automatic sync.');
    let tokens = secrets.open(row.tokens);
    if (tokens.expires_at > Date.now() + 60000) return tokens;
    if (!tokens.refresh_token) throw new Error('Reconnect this channel to allow background refresh.');
    const config = getConfig();
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(45000),
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: config.clientId, client_secret: config.clientSecret }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error === 'invalid_grant' ? 'Google authorization expired or was revoked. Reconnect this channel.' : 'Could not refresh Google authorization.');
    tokens = { ...tokens, ...data, expires_at: Date.now() + data.expires_in * 1000 };
    db.prepare('UPDATE channels SET tokens=? WHERE id=?').run(secrets.seal(tokens), channel);
    return tokens;
  }

  async function syncOne(channel, range) {
    const errors = [];
    try {
      const tokens = await tokenFor(channel);
      const access = tokens.access_token;
      const metadata = await fetchVideos(fetcher, access, channel);
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE channels SET title=?,metadata=? WHERE id=?').run(metadata.channel.title, JSON.stringify(metadata.channel), channel);
        db.prepare('DELETE FROM videos WHERE channel=?').run(channel);
        const insert = db.prepare('INSERT INTO videos VALUES (?,?,?)');
        for (const v of metadata.videos) insert.run(channel, v.id, JSON.stringify(v));
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      const reports = [
        ['daily', 'day', BASE_METRICS, { sort: 'day' }],
        ['video', 'video', BASE_METRICS, { sort: '-views' }],
        ['country', 'country', 'views,estimatedMinutesWatched', { sort: '-views' }],
        ['device', 'deviceType', 'views,estimatedMinutesWatched', { sort: '-views' }],
        ['traffic', 'insightTrafficSourceType', 'views,estimatedMinutesWatched', { sort: '-views' }]
      ];
      if ((tokens.scope || '').includes('yt-analytics-monetary.readonly')) reports.push(['revenue', 'video', 'estimatedRevenue,estimatedAdRevenue', { sort: '-estimatedRevenue' }]);
      for (const [kind, dimension, metrics, extra] of reports) {
        try { saveReport(channel, range, kind, await queryReport(fetcher, access, channel, range, dimension, metrics, extra)); }
        catch (e) { errors.push(`${kind}: ${e.message}`); }
      }
      db.prepare('UPDATE channels SET last_sync=?,error=? WHERE id=?').run(new Date().toISOString(), errors.length ? errors.join(' | ') : null, channel);
    } catch (e) { db.prepare('UPDATE channels SET error=? WHERE id=?').run(e.message, channel); }
  }

  function startSync(range, ids) {
    if (activeSync) return false;
    const channels = db.prepare('SELECT id FROM channels WHERE tokens IS NOT NULL').all().map(c => c.id).filter(id => !ids || ids.includes(id));
    activeSync = (async () => { for (const id of channels) await syncOne(id, range); })().finally(() => { activeSync = null; });
    return true;
  }

  function dashboard(range) {
    const channels = db.prepare('SELECT id,title,metadata,last_sync,error,tokens IS NOT NULL AS connected FROM channels ORDER BY title').all();
    return { range, syncing: Boolean(activeSync), configured: Boolean(getConfig().clientId), channels: channels.map(c => {
      const reports = {}; for (const kind of ['daily', 'video', 'country', 'device', 'traffic', 'revenue']) reports[kind] = getReport(c.id, range, kind);
      return { ...c, metadata: JSON.parse(c.metadata), reports, videos: db.prepare('SELECT payload FROM videos WHERE channel=?').all(c.id).map(v => JSON.parse(v.payload)) };
    }) };
  }

  function json(res, status, data, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(data));
  }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('JSON content type required.');
    let total = 0; const chunks = [];
    for await (const chunk of req) { total += chunk.length; if (total > 12 * 1024 * 1024) throw new Error('Request exceeds 12 MB.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON.'); }
  }
  function session(req, res) {
    const cookie = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('desk='))?.slice(5);
    if (cookie && sessions.has(cookie)) { sessions.set(cookie, Date.now()); return cookie; }
    const id = randomBytes(32).toString('hex'); sessions.set(id, Date.now());
    res.setHeader('Set-Cookie', `desk=${id}; HttpOnly; SameSite=Lax; Path=/`); return id;
  }

  const handler = async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://i.ytimg.com data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(req.headers.host)) return json(res, 403, { error: 'Use the local dashboard URL.' });
    if (req.headers.origin && ![origin, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Cross-site requests are blocked.' });
    const sid = session(req, res);
    const url = new URL(req.url, origin);
    try {
      if (url.pathname === '/oauth/callback' && req.method === 'GET') {
        const state = url.searchParams.get('state'), flow = pending.get(state); pending.delete(state);
        if (!flow || flow.sid !== sid || flow.expires < Date.now()) throw new Error('Sign-in session expired. Open the dashboard and connect again.');
        if (url.searchParams.get('error')) throw new Error('Google sign-in was cancelled or not authorized.');
        const code = url.searchParams.get('code'); if (!code) throw new Error('Missing Google authorization code.');
        const config = getConfig();
        const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(45000), body: new URLSearchParams({
          grant_type: 'authorization_code', code, code_verifier: flow.verifier, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: `${origin}/oauth/callback`
        }) });
        const tokens = await response.json(); if (!response.ok) throw new Error('Google code exchange failed. Check the OAuth client and redirect URI.');
        const found = await googleJSON(fetcher, 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', tokens.access_token);
        if (!found.items?.length) throw new Error('The selected Google identity has no accessible YouTube channel.');
        for (const channel of found.items) {
          const old = db.prepare('SELECT tokens FROM channels WHERE id=?').get(channel.id);
          const oldTokens = old?.tokens ? secrets.open(old.tokens) : {};
          const merged = { ...oldTokens, ...tokens, refresh_token: tokens.refresh_token || oldTokens.refresh_token, expires_at: Date.now() + tokens.expires_in * 1000 };
          db.prepare("INSERT INTO channels (id,title,tokens) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,tokens=excluded.tokens,error=NULL").run(channel.id, channel.snippet.title, secrets.seal(merged));
        }
        startSync(defaultRange(), found.items.map(c => c.id));
        res.writeHead(302, { Location: '/?connected=1', 'Cache-Control': 'no-store' }); return res.end();
      }
      if (url.pathname === '/api/dashboard' && req.method === 'GET') return json(res, 200, dashboard(dateRange(url.searchParams.get('start'), url.searchParams.get('end'))));
      if (url.pathname === '/api/status' && req.method === 'GET') return json(res, 200, { configured: Boolean(getConfig().clientId), range: defaultRange(), syncing: Boolean(activeSync), redirectUri: `${origin}/oauth/callback` });
      if (url.pathname === '/api/config' && req.method === 'POST') {
        const value = await body(req); const old = getConfig();
        const clientId = String(value.clientId || '').trim(), clientSecret = String(value.clientSecret || old.clientSecret || '').trim();
        if (!clientId.endsWith('.apps.googleusercontent.com') || !clientSecret) throw new Error('Enter a Google OAuth web client ID and client secret.');
        if (old.clientId && old.clientId !== clientId) throw new Error('Use the original OAuth client for connected channels. Start with a fresh data folder to change clients.');
        db.prepare('INSERT OR REPLACE INTO config VALUES (1,?)').run(secrets.seal({ clientId, clientSecret })); return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/connect' && req.method === 'POST') {
        const value = await body(req), config = getConfig(); if (!config.clientId) throw new Error('Save your free Google OAuth client first.');
        const state = randomBytes(32).toString('hex'), verifier = randomBytes(48).toString('base64url');
        const scopes = [...SCOPES]; if (value.monetary) scopes.push('https://www.googleapis.com/auth/yt-analytics-monetary.readonly');
        pending.set(state, { sid, verifier, expires: Date.now() + 600000 });
        const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${origin}/oauth/callback`, response_type: 'code', scope: scopes.join(' '),
          access_type: 'offline', prompt: 'consent select_account', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
        return json(res, 200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
      }
      if (url.pathname === '/api/sync' && req.method === 'POST') {
        const value = await body(req); const range = dateRange(value.start, value.end);
        const ids = value.channel ? [String(value.channel)] : null;
        return json(res, 202, { started: startSync(range, ids), message: activeSync ? 'Sync is running.' : 'No Google-connected channels.' });
      }
      if (url.pathname === '/api/import' && req.method === 'POST') {
        const value = await body(req); const range = dateRange(value.start, value.end);
        const title = String(value.title || '').trim().slice(0, 150); if (!title) throw new Error('Enter a channel name.');
        let id = String(value.channelId || '').trim();
        if (!id) id = `csv-${createHash('sha256').update(title).digest('hex').slice(0, 16)}`;
        if (!/^(UC[\w-]{22}|csv-[a-f0-9]{16})$/.test(id)) throw new Error('Use a channel ID beginning with UC, or leave the ID empty.');
        const videos = importStudioCSV(String(value.csv || ''));
        db.exec('BEGIN');
        try {
          db.prepare('INSERT INTO channels (id,title) VALUES (?,?) ON CONFLICT(id) DO NOTHING').run(id, title);
          for (const v of videos) db.prepare('INSERT INTO videos VALUES (?,?,?) ON CONFLICT(channel,id) DO NOTHING').run(id, v.video, JSON.stringify({ id: v.video, title: v.title }));
          saveReport(id, range, 'video', videos, 'studio-csv'); db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
        return json(res, 200, { ok: true, channel: id, imported: videos.length });
      }
      if (url.pathname === '/api/channel' && req.method === 'DELETE') {
        const value = await body(req); if (activeSync) throw new Error('Wait for the active sync to finish before removing a channel.');
        db.prepare('DELETE FROM channels WHERE id=?').run(String(value.id)); return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/retention' && req.method === 'GET') {
        const range = dateRange(url.searchParams.get('start'), url.searchParams.get('end'));
        const channel = url.searchParams.get('channel'), video = url.searchParams.get('video');
        if (!/^[\w-]{11}$/.test(video || '') || !db.prepare('SELECT 1 FROM videos WHERE channel=? AND id=?').get(channel, video)) throw new Error('Select a video from a connected channel.');
        const cached = db.prepare('SELECT * FROM retention WHERE channel=? AND video=? AND start=? AND end=?').get(channel, video, range.start, range.end);
        if (cached && Date.now() - Date.parse(cached.updated) < 43200000) return json(res, 200, { rows: JSON.parse(cached.payload), updated: cached.updated });
        const tokens = await tokenFor(channel);
        const rows = await queryReport(fetcher, tokens.access_token, channel, range, 'elapsedVideoTimeRatio', 'audienceWatchRatio,relativeRetentionPerformance', { filters: `video==${video}` });
        const updated = new Date().toISOString();
        db.prepare('INSERT OR REPLACE INTO retention VALUES (?,?,?,?,?,?)').run(channel, video, range.start, range.end, JSON.stringify(rows), updated);
        return json(res, 200, { rows, updated });
      }
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (req.method === 'GET' && files[url.pathname]) {
        const [file, type] = files[url.pathname]; res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }); return res.end(readFileSync(path.join(root, 'public', file)));
      }
      json(res, 404, { error: 'Not found.' });
    } catch (e) { json(res, 400, { error: e.message }); }
  };
  const server = http.createServer(handler);

  // Background monitoring runs while this local server and computer are awake.
  const timer = schedule ? setInterval(() => { startSync(defaultRange());
    for (const [key, flow] of pending) if (flow.expires < Date.now()) pending.delete(key);
    for (const [key, last] of sessions) if (Date.now() - last > 86400000) sessions.delete(key);
  }, 3600000) : null;
  timer?.unref();
  if (schedule) setTimeout(() => startSync(defaultRange()), 1000).unref();
  return { server, db, handler, whenIdle: () => activeSync, close: async () => { if (timer) clearInterval(timer); if (activeSync) await activeSync; if (server.listening) await new Promise(resolve => server.close(resolve)); db.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3010);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
  const app = createApp({ port });
  app.server.on('error', error => { console.error(`Could not start the local server: ${error.message}`); process.exitCode = 1; });
  app.server.listen(port, '127.0.0.1', () => console.log(`Channel Desk: http://localhost:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0)));
}
