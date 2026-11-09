import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadCache,
  saveCache,
  fetchWithRetry,
  searchMergedPRs,
  fetchPRFiles,
  fetchRepoMeta,
} from '../src/fetch.ts';
import type { CacheData, ProfileConfig } from '../src/types.js';

describe('fetch module', () => {
  const testCacheDir = path.resolve(process.cwd(), 'data/test-cache');
  const testCacheFile = path.join(testCacheDir, 'cache.json');

  beforeEach(() => {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it('initializes and saves empty cache when file does not exist', () => {
    const cache = loadCache(testCacheFile);
    expect(cache.version).toBe(1);
    expect(cache.prs).toEqual({});
    expect(cache.repos).toEqual({});

    cache.prs['https://github.com/foo/bar/pull/1'] = {
      id: 1,
      number: 1,
      title: 'test pr',
      html_url: 'https://github.com/foo/bar/pull/1',
      repoFullName: 'foo/bar',
      merged_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      changedFiles: ['file1.ts'],
    };

    saveCache(cache, testCacheFile);
    expect(fs.existsSync(testCacheFile)).toBe(true);

    const reloaded = loadCache(testCacheFile);
    expect(reloaded.prs['https://github.com/foo/bar/pull/1'].title).toBe('test pr');
  });

  it('retries with exponential backoff on 429 or 403 rate limit', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'retry-after': '1' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await fetchWithRetry('https://api.github.com/test', {}, 2, mockFetch as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('retries without Authorization on 401 Unauthorized', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      callCount++;
      const headers = (opts.headers || {}) as Record<string, string>;
      if (headers['Authorization']) {
        return new Response('Bad credentials', { status: 401 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const res = await fetchWithRetry(
      'https://api.github.com/test',
      { headers: { Authorization: 'Bearer bad_token' } },
      2,
      mockFetch as unknown as typeof fetch
    );
    expect(res.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('searchMergedPRs queries with excludeOwners and parses items', async () => {
    const config: ProfileConfig = {
      username: 'testuser',
      headline: 'Tester',
      excludeOwners: ['self-org'],
      featured: [],
      maxRepos: 10,
      overrides: {},
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total_count: 1,
          items: [
            {
              id: 101,
              number: 42,
              title: 'feat: add feature',
              html_url: 'https://github.com/org/repo/pull/42',
              repository_url: 'https://api.github.com/repos/org/repo',
              created_at: '2026-01-01T00:00:00Z',
              closed_at: '2026-01-02T00:00:00Z',
              pull_request: {
                url: 'https://api.github.com/repos/org/repo/pulls/42',
                merged_at: '2026-01-02T00:00:00Z',
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const items = await searchMergedPRs(config, { fetchFn: mockFetch as unknown as typeof fetch });
    expect(items.length).toBe(1);
    expect(items[0].number).toBe(42);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('author%3Atestuser'),
      expect.any(Object)
    );
  });
});
