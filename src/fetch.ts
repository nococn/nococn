import fs from 'node:fs';
import path from 'node:path';
import type {
  ProfileConfig,
  CacheData,
  CachedPR,
  RepoMeta,
  RawPullRequestItem,
} from './types.js';

export interface FetchOptions {
  token?: string;
  cachePath?: string;
  fetchFn?: typeof fetch;
  now?: Date;
}

const DEFAULT_CACHE_PATH = path.resolve(process.cwd(), 'data/cache.json');

/**
 * Loads cache from data/cache.json if present
 */
export function loadCache(cachePath: string = DEFAULT_CACHE_PATH): CacheData {
  if (fs.existsSync(cachePath)) {
    try {
      const content = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(content) as CacheData;
    } catch (e) {
      console.warn(`[cache] Failed to parse cache file at ${cachePath}, starting fresh:`, e);
    }
  }
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    prs: {},
    repos: {},
  };
}

/**
 * Saves cache to data/cache.json
 */
export function saveCache(cache: CacheData, cachePath: string = DEFAULT_CACHE_PATH): void {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  cache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
}

/**
 * Performs fetch with retry, handling 403/429 (rate limits) with exponential backoff and Retry-After
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const res = await fetchFn(url, options);

      // Handle 401 unauthorized (e.g. invalid token header in local test environment)
      if (res.status === 401 && options.headers && 'Authorization' in (options.headers as Record<string, string>)) {
        console.warn(`[fetch] 401 Unauthorized for ${url}. Retrying once without Authorization header...`);
        const headersWithoutAuth = { ...(options.headers as Record<string, string>) };
        delete headersWithoutAuth['Authorization'];
        return fetchWithRetry(url, { ...options, headers: headersWithoutAuth }, maxRetries - 1, fetchFn);
      }

      // Handle rate limits (403 with x-ratelimit-remaining == 0, or 429)
      if (res.status === 429 || res.status === 403) {
        const retryAfterHeader = res.headers.get('retry-after');
        const remaining = res.headers.get('x-ratelimit-remaining');
        const resetHeader = res.headers.get('x-ratelimit-reset');

        if (attempt < maxRetries && (res.status === 429 || remaining === '0')) {
          let delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          if (retryAfterHeader) {
            const seconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(seconds)) delayMs = seconds * 1000;
          } else if (resetHeader) {
            const resetTime = parseInt(resetHeader, 10) * 1000;
            const diff = resetTime - Date.now();
            if (diff > 0 && diff < 60000) delayMs = diff + 1000;
          }

          console.warn(`[fetch] Rate limit encountered (${res.status}). Waiting ${Math.round(delayMs)}ms before retry ${attempt + 1}/${maxRetries}...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          attempt++;
          continue;
        }
      }

      return res;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`[fetch] Network error: ${err}. Retrying in ${Math.round(delayMs)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt++;
    }
  }
  throw new Error(`[fetch] Failed after ${maxRetries} retries for URL: ${url}`);
}

/**
 * Helper to build auth headers
 */
function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'profile-readme-updater',
  };
  const activeToken = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (activeToken && !activeToken.startsWith('pickle-forward-')) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }
  return headers;
}

/**
 * Searches merged PRs authored by username
 * Handles 1000-item ceiling via created: date chunking if necessary.
 */
export async function searchMergedPRs(
  config: ProfileConfig,
  options: FetchOptions = {}
): Promise<RawPullRequestItem[]> {
  const fetchFn = options.fetchFn || fetch;
  const headers = getHeaders(options.token);

  // Build query
  const queryParts = [
    `author:${config.username}`,
    'is:pr',
    'is:merged',
  ];

  for (const owner of config.excludeOwners) {
    queryParts.push(`-user:${owner}`);
  }

  const query = queryParts.join(' ');
  const perPage = 100;
  let page = 1;
  const allItems: RawPullRequestItem[] = [];

  while (true) {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
    const res = await fetchWithRetry(url, { headers }, 3, fetchFn);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[fetch] GitHub Search API failed (${res.status}): ${errText}`);
    }

    const data = await res.json() as { total_count: number; items: RawPullRequestItem[] };
    const items = data.items || [];
    allItems.push(...items);

    if (allItems.length >= data.total_count || items.length === 0 || page * perPage >= 1000) {
      break;
    }
    page++;
  }

  return allItems;
}

/**
 * Fetches changed file names for a given PR
 */
export async function fetchPRFiles(
  repoFullName: string,
  prNumber: number,
  options: FetchOptions = {}
): Promise<string[]> {
  const fetchFn = options.fetchFn || fetch;
  const headers = getHeaders(options.token);
  const files: string[] = [];
  let page = 1;
  const perPage = 100;

  while (page <= 3) { // Cap at 300 files per PR
    const url = `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`;
    const res = await fetchWithRetry(url, { headers }, 3, fetchFn);
    if (!res.ok) {
      console.warn(`[fetch] Could not fetch files for ${repoFullName}#${prNumber} (${res.status})`);
      break;
    }
    const data = await res.json() as Array<{ filename: string }>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const f of data) {
      if (f.filename) files.push(f.filename);
    }
    if (data.length < perPage) break;
    page++;
  }

  return files;
}

/**
 * Fetches repository metadata (stars, description, owner type)
 */
export async function fetchRepoMeta(
  repoFullName: string,
  options: FetchOptions = {}
): Promise<RepoMeta> {
  const fetchFn = options.fetchFn || fetch;
  const headers = getHeaders(options.token);
  const url = `https://api.github.com/repos/${repoFullName}`;

  const res = await fetchWithRetry(url, { headers }, 3, fetchFn);
  if (!res.ok) {
    console.warn(`[fetch] Failed to fetch repo meta for ${repoFullName} (${res.status})`);
    const [owner, name] = repoFullName.split('/');
    return {
      fullName: repoFullName,
      name: name || repoFullName,
      owner: owner || '',
      ownerType: 'User',
      description: null,
      stars: 0,
      html_url: `https://github.com/${repoFullName}`,
    };
  }

  const data = await res.json() as {
    full_name: string;
    name: string;
    owner: { login: string; type: 'User' | 'Organization' };
    description: string | null;
    stargazers_count: number;
    html_url: string;
  };

  return {
    fullName: data.full_name || repoFullName,
    name: data.name || repoFullName.split('/')[1],
    owner: data.owner?.login || repoFullName.split('/')[0],
    ownerType: data.owner?.type || 'User',
    description: data.description || null,
    stars: data.stargazers_count ?? 0,
    html_url: data.html_url || `https://github.com/${repoFullName}`,
  };
}

/**
 * Main collection function: fetches all merged external PRs, caches details, and returns cached PRs & repo metadata
 */
export async function collectContributions(
  config: ProfileConfig,
  options: FetchOptions = {}
): Promise<{ prs: CachedPR[]; repos: Record<string, RepoMeta> }> {
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
  const cache = loadCache(cachePath);

  // 1. Search merged PRs
  const rawPRs = await searchMergedPRs(config, options);

  const matchedPRs: CachedPR[] = [];
  const reposToFetch = new Set<string>();

  for (const raw of rawPRs) {
    // Parse owner/repo from repository_url (e.g. "https://api.github.com/repos/owner/repo")
    const match = raw.repository_url.match(/repos\/([^/]+\/[^/]+)$/);
    if (!match) continue;
    const repoFullName = match[1];

    // Check excludeOwners
    const [owner] = repoFullName.split('/');
    if (config.excludeOwners.some((ex) => ex.toLowerCase() === owner.toLowerCase())) {
      continue;
    }

    reposToFetch.add(repoFullName);

    // Check cache
    const existing = cache.prs[raw.html_url];
    if (existing && existing.changedFiles && existing.changedFiles.length > 0) {
      // Cache hit
      matchedPRs.push(existing);
    } else {
      // Cache miss: fetch files
      console.log(`[cache:miss] Fetching files for ${repoFullName}#${raw.number}...`);
      const changedFiles = await fetchPRFiles(repoFullName, raw.number, options);
      const prRecord: CachedPR = {
        id: raw.id,
        number: raw.number,
        title: raw.title,
        html_url: raw.html_url,
        repoFullName,
        merged_at: raw.pull_request?.merged_at || raw.closed_at || raw.created_at,
        created_at: raw.created_at,
        changedFiles,
      };
      cache.prs[raw.html_url] = prRecord;
      matchedPRs.push(prRecord);
    }
  }

  // 2. Fetch missing or stale repo metadata
  for (const repoFullName of reposToFetch) {
    if (!cache.repos[repoFullName]) {
      console.log(`[cache:miss] Fetching repo metadata for ${repoFullName}...`);
      const meta = await fetchRepoMeta(repoFullName, options);
      cache.repos[repoFullName] = meta;
    }
  }

  // Save updated cache
  saveCache(cache, cachePath);

  return {
    prs: matchedPRs,
    repos: cache.repos,
  };
}
