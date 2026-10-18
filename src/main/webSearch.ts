import type { FetchFn } from './deepseek';

/** Searches the web and returns a compact text summary of the top results.
 *  Uses Tavily when a key is set (stable); otherwise a key-less DuckDuckGo scrape. */
export async function webSearch(query: string, apiKey: string, fetchFn: FetchFn = fetch): Promise<string> {
  const q = query.trim();
  if (!q) return 'No query.';
  return apiKey ? tavily(q, apiKey, fetchFn) : duckDuckGo(q, fetchFn);
}

async function tavily(query: string, apiKey: string, fetchFn: FetchFn): Promise<string> {
  const res = await fetchFn('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: 5 }),
  });
  const data = (await res.json()) as { results?: { title?: string; content?: string; url?: string }[]; detail?: string };
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${data.detail ?? 'search failed'}`);
  const results = (data.results ?? []).slice(0, 5);
  if (results.length === 0) return 'No results.';
  return results.map((r, i) => `${i + 1}. ${r.title ?? ''}\n${r.content ?? ''}\n${r.url ?? ''}`).join('\n\n');
}

async function duckDuckGo(query: string, fetchFn: FetchFn): Promise<string> {
  const res = await fetchFn(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const html = await res.text();
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
  const titles = [...html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
  const links = [...html.matchAll(/class="result__a" href="([^"]+)"/g)].map((m) => cleanUrl(m[1]));
  if (titles.length === 0) return 'No results.';
  return titles.slice(0, 5).map((t, i) => `${i + 1}. ${t}${snippets[i] ? `\n${snippets[i]}` : ''}${links[i] ? `\n${links[i]}` : ''}`).join('\n\n');
}

/** DuckDuckGo wraps result URLs in a `/l/?uddg=…` redirect; extract the real target. */
function cleanUrl(href: string): string {
  try {
    const u = new URL(href.startsWith('//') ? `https:${href}` : href);
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}
