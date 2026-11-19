import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export function vault(key) {
  return {
    seal(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    open(value) {
      const bytes = Buffer.from(value, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    }
  };
}

export function dateRange(start, end) {
  const valid = v => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '') && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!valid(start) || !valid(end) || start > end) throw new Error('Choose a valid date range.');
  if ((Date.parse(end) - Date.parse(start)) / 86400000 > 730) throw new Error('Use a date range of at most two years.');
  return { start, end };
}

export function defaultRange() {
  const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const start = new Date(Date.parse(end) - 27 * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

export function reportRows(report) {
  const names = (report.columnHeaders ?? []).map(x => x.name);
  return (report.rows ?? []).map(values => Object.fromEntries(names.map((name, i) => [name, values[i]])));
}

// RFC 4180-style fields: embedded commas, escaped quotes and newlines are preserved.
export function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (!quoted && field.length) throw new Error('Unexpected quote in CSV.');
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\r' || c === '\n') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(x => x.trim())) rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  row.push(field); if (row.some(x => x.trim())) rows.push(row);
  if (!rows.length) throw new Error('CSV is empty.');
  const headers = rows.shift().map(x => x.trim());
  if (new Set(headers).size !== headers.length) throw new Error('CSV has duplicate column names.');
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}

export function number(value) {
  if (value === undefined || value === null || String(value).trim() === '' || String(value).trim() === '—') return null;
  const n = Number(String(value).replace(/[%,$\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function importStudioCSV(text) {
  const rows = parseCSV(text); const videos = [];
  for (const row of rows) {
    const id = (row['Video ID'] || row['Content'] || row['video_id'] || row['video'] || '').trim();
    if (/^(total|totals)$/i.test(id) || !id) continue;
    if (!/^[\w-]{11}$/.test(id)) continue;
    const get = (...keys) => { for (const k of keys) if (row[k] !== undefined) return number(row[k]); return null; };
    const time = row['Average view duration'];
    const duration = time && /^(\d+:)?\d+:\d+(\.\d+)?$/.test(time) ? time.split(':').reduce((a, b) => a * 60 + Number(b), 0) : get('averageViewDuration');
    videos.push({ video: id, title: row['Video title'] || row['Title'] || row['title'] || id,
      views: get('Views', 'views'), engagedViews: get('Engaged views', 'engagedViews'),
      estimatedMinutesWatched: row['Watch time (hours)'] !== undefined ? (get('Watch time (hours)') == null ? null : get('Watch time (hours)') * 60) : get('estimatedMinutesWatched'),
      averageViewDuration: duration, averageViewPercentage: get('Average percentage viewed (%)', 'Average percentage viewed', 'averageViewPercentage'),
      likes: get('Likes', 'likes'), comments: get('Comments', 'comments'), shares: get('Shares', 'shares'),
      subscribersGained: get('Subscribers gained', 'subscribersGained'), subscribersLost: get('Subscribers lost', 'subscribersLost'),
      netSubscribers: get('Subscribers', 'netSubscribers'), impressions: get('Impressions', 'impressions'),
      ctr: get('Impressions click-through rate (%)', 'Impressions click-through rate', 'ctr'),
      estimatedRevenue: get('Estimated revenue (USD)', 'Your estimated revenue (USD)', 'estimatedRevenue') });
  }
  if (!videos.length) throw new Error('No video IDs found. Export the per-video Table data CSV from YouTube Studio Advanced mode (English column headings), not the chart CSV.');
  return videos;
}

export async function googleJSON(fetcher, url, token, options = {}) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(45000), headers: { ...options.headers, Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || data.error_description || 'Google request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function queryReport(fetcher, token, channel, range, dimensions, metrics, extra = {}) {
  const all = []; let startIndex = 1;
  while (true) {
    const query = new URLSearchParams({ ids: `channel==${channel}`, startDate: range.start, endDate: range.end,
      dimensions, metrics, maxResults: '200', startIndex: String(startIndex), ...extra });
    const report = await googleJSON(fetcher, `https://youtubeanalytics.googleapis.com/v2/reports?${query}`, token);
    const rows = reportRows(report); all.push(...rows);
    if (rows.length < 200) break;
    startIndex += rows.length;
    if (startIndex > 100000) throw new Error('Report exceeded the local safety limit; shorten the date range.');
  }
  return all;
}

export async function fetchVideos(fetcher, token, channel) {
  const channels = await googleJSON(fetcher, `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(channel)}`, token);
  const item = channels.items?.[0]; if (!item) throw new Error('Channel is unavailable. Reconnect it.');
  const ids = []; let page = '';
  do {
    const params = new URLSearchParams({ part: 'contentDetails', playlistId: item.contentDetails.relatedPlaylists.uploads, maxResults: '50' });
    if (page) params.set('pageToken', page);
    const data = await googleJSON(fetcher, `https://www.googleapis.com/youtube/v3/playlistItems?${params}`, token);
    ids.push(...(data.items ?? []).map(x => x.contentDetails.videoId)); page = data.nextPageToken || '';
  } while (page);
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const q = new URLSearchParams({ part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(',') });
    const data = await googleJSON(fetcher, `https://www.googleapis.com/youtube/v3/videos?${q}`, token);
    videos.push(...(data.items ?? []).map(v => ({ id: v.id, title: v.snippet.title, publishedAt: v.snippet.publishedAt,
      thumbnail: v.snippet.thumbnails?.medium?.url || '', duration: v.contentDetails.duration,
      lifetimeViews: number(v.statistics.viewCount), lifetimeLikes: number(v.statistics.likeCount), lifetimeComments: number(v.statistics.commentCount) })));
  }
  return { channel: { id: item.id, title: item.snippet.title, subscribers: number(item.statistics.subscriberCount), hiddenSubscribers: item.statistics.hiddenSubscriberCount }, videos };
}
