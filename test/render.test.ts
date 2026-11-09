import { describe, it, expect } from 'vitest';
import {
  formatStars,
  summarizeContributions,
  renderContributionsMarkdown,
  injectContributions,
  MARKER_START,
  MARKER_END,
} from '../src/render.ts';
import type { EnrichedPR, RepoMeta, ProfileConfig } from '../src/types.js';

describe('render module', () => {
  it('formats star counts properly', () => {
    expect(formatStars(0)).toBe('★0');
    expect(formatStars(450)).toBe('★450');
    expect(formatStars(1000)).toBe('★1k');
    expect(formatStars(12345)).toBe('★12.3k');
    expect(formatStars(64177)).toBe('★64.2k');
  });

  it('aggregates and sorts repositories by stars and PR count', () => {
    const prs: EnrichedPR[] = [
      {
        id: 1,
        number: 10,
        title: 'Korean docs',
        html_url: 'https://github.com/repoA/proj/pull/10',
        repoFullName: 'repoA/proj',
        merged_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        changedFiles: ['ko.md'],
        category: 'l10n',
      },
      {
        id: 2,
        number: 11,
        title: 'Korean docs 2',
        html_url: 'https://github.com/repoA/proj/pull/11',
        repoFullName: 'repoA/proj',
        merged_at: '2026-01-02T00:00:00Z',
        created_at: '2026-01-02T00:00:00Z',
        changedFiles: ['ko2.md'],
        category: 'l10n',
      },
      {
        id: 3,
        number: 1,
        title: 'Core fix',
        html_url: 'https://github.com/repoB/bigstar/pull/1',
        repoFullName: 'repoB/bigstar',
        merged_at: '2026-01-03T00:00:00Z',
        created_at: '2026-01-03T00:00:00Z',
        changedFiles: ['main.c'],
        category: 'code',
      },
    ];

    const repos: Record<string, RepoMeta> = {
      'repoA/proj': {
        fullName: 'repoA/proj',
        name: 'proj',
        owner: 'repoA',
        ownerType: 'Organization',
        description: 'Repo A',
        stars: 50,
        html_url: 'https://github.com/repoA/proj',
      },
      'repoB/bigstar': {
        fullName: 'repoB/bigstar',
        name: 'bigstar',
        owner: 'repoB',
        ownerType: 'Organization',
        description: 'Repo B Big Star',
        stars: 50000,
        html_url: 'https://github.com/repoB/bigstar',
      },
    };

    const config: ProfileConfig = {
      username: 'testuser',
      headline: 'Tester',
      excludeOwners: [],
      featured: [],
      maxRepos: 10,
      overrides: {},
    };

    const summary = summarizeContributions(prs, repos, config);
    expect(summary.totalMergedPRs).toBe(3);
    expect(summary.totalRepos).toBe(2);
    expect(summary.totalL10n).toBe(2);
    expect(summary.totalCode).toBe(1);
    expect(summary.totalDocs).toBe(0);

    // Repo B has 50k stars, so it should rank first before Repo A (50 stars)
    expect(summary.groups[0].repo.fullName).toBe('repoB/bigstar');
    expect(summary.groups[1].repo.fullName).toBe('repoA/proj');
  });

  it('respects featured list ranking over stars', () => {
    const prs: EnrichedPR[] = [
      {
        id: 1,
        number: 1,
        title: 'PR 1',
        html_url: 'https://github.com/small/feat/pull/1',
        repoFullName: 'small/feat',
        merged_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        changedFiles: [],
        category: 'l10n',
      },
      {
        id: 2,
        number: 2,
        title: 'PR 2',
        html_url: 'https://github.com/big/star/pull/2',
        repoFullName: 'big/star',
        merged_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        changedFiles: [],
        category: 'code',
      },
    ];

    const repos: Record<string, RepoMeta> = {
      'small/feat': {
        fullName: 'small/feat',
        name: 'feat',
        owner: 'small',
        ownerType: 'User',
        description: null,
        stars: 10,
        html_url: 'https://github.com/small/feat',
      },
      'big/star': {
        fullName: 'big/star',
        name: 'star',
        owner: 'big',
        ownerType: 'Organization',
        description: null,
        stars: 100000,
        html_url: 'https://github.com/big/star',
      },
    };

    const config: ProfileConfig = {
      username: 'testuser',
      headline: 'Tester',
      excludeOwners: [],
      featured: ['small/feat'],
      maxRepos: 10,
      overrides: {},
    };

    const summary = summarizeContributions(prs, repos, config);
    expect(summary.groups[0].repo.fullName).toBe('small/feat');
  });

  it('injects markdown idempotently between markers', () => {
    const initialReadme = `# Header\n\n${MARKER_START}\nold content\n${MARKER_END}\n\n# Footer`;
    const newContent = '**3 merged PRs across 2 repositories**\n\n- **[repo](url)**';

    const injected1 = injectContributions(initialReadme, newContent);
    const injected2 = injectContributions(injected1, newContent);

    expect(injected1).toBe(injected2);
    expect(injected1).toContain(newContent);
    expect(injected1).not.toContain('old content');
    expect(injected1).toContain('# Header');
    expect(injected1).toContain('# Footer');
  });
});
