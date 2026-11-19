import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { dateRange, parseCSV, importStudioCSV, vault, reportRows, queryReport, fetchVideos } from '../lib.mjs';
import { createApp } from '../server.mjs';

test('CSV handles quoted commas, escaped quotes, newlines and a BOM', () => {
  const rows = parseCSV('\uFEFFContent,Video title,Views\r\nabcdefghijk,"A, ""real""\nstory",125\r\n');
  assert.equal(rows[0]['Video title'], 'A, "real"\nstory'); assert.equal(rows[0].Views, '125');
  assert.throws(() => parseCSV('a,b\n"broken,1'), /unclosed/);
});
test('Studio importer skips totals and preserves missing metrics', () => {
  const rows = importStudioCSV('Content,Video title,Views,Watch time (hours),Average view duration,Impressions click-through rate (%)\nTotal,,1000,20,0:30,5\nabcdefghijk,One,100,1.5,0:45,4.2\n');
  assert.equal(rows.length, 1); assert.equal(rows[0].estimatedMinutesWatched, 90); assert.equal(rows[0].averageViewDuration, 45);
  assert.equal(rows[0].likes, null); assert.equal(rows[0].ctr, 4.2);
});
test('date ranges reject impossible dates, reverse dates and oversized windows', () => {
  assert.throws(() => dateRange('2026-02-30', '2026-03-01')); assert.throws(() => dateRange('2026-03-01', '2026-02-01'));
  assert.throws(() => dateRange('2000-01-01', '2026-01-01')); assert.deepEqual(dateRange('2026-01-01', '2026-01-28'), { start: '2026-01-01', end: '2026-01-28' });
});
test('vault authenticates encrypted data and rejects tampering', () => {
  const v = vault(randomBytes(32)), encrypted = v.seal({ refresh_token: 'secret' });
  assert.ok(!encrypted.includes('secret')); assert.deepEqual(v.open(encrypted), { refresh_token: 'secret' });
  const tampered = Buffer.from(encrypted, 'base64'); tampered[tampered.length - 1] ^= 1; assert.throws(() => v.open(tampered.toString('base64')));
});
test('report normalization follows column names rather than fixed positions', () => {
  assert.deepEqual(reportRows({ columnHeaders: [{ name: 'views' }, { name: 'video' }], rows: [[12, 'abcdefghijk']] }), [{ views: 12, video: 'abcdefghijk' }]);
});
test('analytics pagination fetches reports beyond the first 200 rows', async () => {
  const starts = [];
  const mock = async url => { const q = new URL(url).searchParams; starts.push(q.get('startIndex')); const n = q.get('startIndex') === '1' ? 200 : 2;
    return Response.json({ columnHeaders: [{ name: 'video' }, { name: 'views' }], rows: Array.from({ length: n }, (_, i) => [`video${i}`, i]) }); };
  const rows = await queryReport(mock, 'token', 'channel', { start: '2026-01-01', end: '2026-01-28' }, 'video', 'views');
  assert.equal(rows.length, 202); assert.deepEqual(starts, ['1', '201']);
});
test('video inventory follows uploads pagination and batches video IDs', async () => {
  const calls = [];
  const mock = async url => { const u = new URL(url); calls.push(u);
    if (u.pathname.endsWith('/channels')) return Response.json({ items: [{ id: 'UC1', snippet: { title: 'Test' }, statistics: { subscriberCount: '50' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
    if (u.pathname.endsWith('/playlistItems')) return Response.json(u.searchParams.has('pageToken') ? { items: [{ contentDetails: { videoId: 'second' } }] } : { items: Array.from({ length: 50 }, (_, i) => ({ contentDetails: { videoId: `id${i}` } })), nextPageToken: 'next' });
    return Response.json({ items: u.searchParams.get('id').split(',').map(id => ({ id, snippet: { title: id, publishedAt: '2026-01-01', thumbnails: {} }, statistics: { viewCount: '123' }, contentDetails: { duration: 'PT30S' } })) }); };
  const result = await fetchVideos(mock, 'token', 'UC1'); assert.equal(result.videos.length, 51);
  assert.equal(calls.filter(u => u.pathname.endsWith('/videos')).length, 2); assert.equal(result.videos[0].lifetimeViews, 123);
});
test('request handler isolates channel data, blocks foreign origins and never exposes secrets', async t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'channel-desk-'));
  const app = createApp({ dataDir: temp, port: 31987, schedule: false });
  t.after(async () => { await app.close(); rmSync(temp, { recursive: true, force: true }); });
  // Drive the same HTTP handler without opening sockets (the Work sandbox blocks loopback).
  const request = async (url, data, method = 'GET', headers = {}) => {
    const req = Readable.from(data === undefined ? [] : [Buffer.from(JSON.stringify(data))]);
    req.url = url; req.method = method; req.headers = { host: 'localhost:31987', ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...headers };
    let status = 200, response = '', returnedHeaders = {};
    const res = { setHeader(k, v) { returnedHeaders[k.toLowerCase()] = v; }, writeHead(s, h) { status = s; for (const [k, v] of Object.entries(h || {})) returnedHeaders[k.toLowerCase()] = v; }, end(v) { response = v?.toString() || ''; } };
    await app.handler(req, res);
    return { status, headers: returnedHeaders, json: async () => JSON.parse(response), text: async () => response };
  };
  const post = (url, data, headers = {}) => request(url, data, 'POST', Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])));
  const csv = 'Content,Video title,Views\nabcdefghijk,One,125';
  const dates = { start: '2026-01-01', end: '2026-01-28' };
  const first = await (await post('/api/import', { ...dates, csv, title: 'A' })).json();
  const second = await (await post('/api/import', { ...dates, csv: csv.replace('125', '300'), title: 'B' })).json();
  assert.notEqual(first.channel, second.channel);
  const result = await (await request('/api/dashboard?' + new URLSearchParams(dates))).json();
  assert.deepEqual(result.channels.map(c => c.reports.video.payload[0].views), [125, 300]);
  const other = await (await request('/api/dashboard?start=2026-02-01&end=2026-02-28')).json();
  assert.equal(other.channels[0].reports.video, null);
  const blocked = await post('/api/config', { clientId: 'test.apps.googleusercontent.com', clientSecret: 'do-not-expose' }, { Origin: 'https://evil.invalid' }); assert.equal(blocked.status, 403);
  const saved = await post('/api/config', { clientId: 'test.apps.googleusercontent.com', clientSecret: 'do-not-expose' }); assert.equal(saved.status, 200);
  const dashboard = await (await request('/api/dashboard?' + new URLSearchParams(dates))).text(); assert.ok(!dashboard.includes('do-not-expose'));
  const signIn = await (await post('/api/connect', {})).json(); const q = new URL(signIn.url).searchParams;
  assert.equal(q.get('code_challenge_method'), 'S256'); assert.equal(q.get('access_type'), 'offline'); assert.ok(q.get('state'));
  const callback = await request('/oauth/callback?state=made-up&code=fake'); assert.equal(callback.status, 400);
});

test('OAuth callback binds state to its browser session and a mocked sync stores real-shaped reports', async t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'channel-desk-auth-'));
  const channel = 'UCabcdefghijklmnopqrstuv', video = 'abcdefghijk';
  const mock = async (url, options) => {
    const u = new URL(url);
    if (u.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'private-token', refresh_token: 'private-refresh', expires_in: 3600, scope: 'https://www.googleapis.com/auth/yt-analytics.readonly' });
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    if (u.pathname.endsWith('/channels')) return Response.json({ items: [{ id: channel, snippet: { title: 'Authorized channel' }, statistics: { subscriberCount: '25' }, contentDetails: { relatedPlaylists: { uploads: 'uploads' } } }] });
    if (u.pathname.endsWith('/playlistItems')) return Response.json({ items: [{ contentDetails: { videoId: video } }] });
    if (u.pathname.endsWith('/videos')) return Response.json({ items: [{ id: video, snippet: { title: 'Actual fixture video', publishedAt: '2026-01-01', thumbnails: {} }, contentDetails: { duration: 'PT45S' }, statistics: { viewCount: '900' } }] });
    const dimension = u.searchParams.get('dimensions'), metrics = u.searchParams.get('metrics').split(',');
    const names = [dimension, ...metrics];
    const first = { video, day: '2026-01-02', country: 'PK', deviceType: 'MOBILE', insightTrafficSourceType: 'SHORTS' }[dimension];
    return Response.json({ columnHeaders: names.map(name => ({ name })), rows: [[first, ...metrics.map(name => name === 'views' ? 125 : name === 'estimatedMinutesWatched' ? 60 : 1)]] });
  };
  const app = createApp({ dataDir: temp, port: 31988, schedule: false, fetcher: mock });
  t.after(async () => { await app.close(); rmSync(temp, { recursive: true, force: true }); });
  let cookie = '';
  const request = async (url, data, useCookie = true) => {
    const req = Readable.from(data ? [Buffer.from(JSON.stringify(data))] : []);
    req.method = data ? 'POST' : 'GET'; req.url = url; req.headers = { host: 'localhost:31988', cookie: useCookie ? cookie : '', 'content-type': 'application/json' };
    let status, raw = '', headers = {};
    await app.handler(req, { setHeader(k, v) { headers[k.toLowerCase()] = v; }, writeHead(s, h) { status = s; Object.assign(headers, h); }, end(v) { raw = v?.toString() || ''; } });
    if (headers['set-cookie'] && useCookie) cookie = headers['set-cookie'].split(';')[0];
    return { status, raw, json: () => JSON.parse(raw), headers };
  };
  await request('/api/config', { clientId: 'test.apps.googleusercontent.com', clientSecret: 'secret' });
  let start = (await request('/api/connect', {})).json();
  let state = new URL(start.url).searchParams.get('state');
  const stolenState = await request(`/oauth/callback?state=${state}&code=fixture`, undefined, false); assert.equal(stolenState.status, 400);
  start = (await request('/api/connect', {})).json(); state = new URL(start.url).searchParams.get('state');
  const callback = await request(`/oauth/callback?state=${state}&code=fixture`); assert.equal(callback.status, 302);
  await app.whenIdle();
  const status = (await request('/api/status')).json();
  const dashboard = (await request('/api/dashboard?' + new URLSearchParams(status.range))).json();
  assert.equal(dashboard.channels[0].reports.video.payload[0].views, 125);
  assert.equal(dashboard.channels[0].videos[0].lifetimeViews, 900);
  assert.equal(dashboard.channels[0].error, null);
  assert.ok(!JSON.stringify(dashboard).includes('private-token')); assert.ok(!JSON.stringify(dashboard).includes('private-refresh'));
});
