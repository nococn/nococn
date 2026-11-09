import type {
  ProfileConfig,
  EnrichedPR,
  RepoMeta,
  RepoContributionGroup,
  ContributionSummary,
} from './types.js';

export const MARKER_START = '<!-- CONTRIB:START -->';
export const MARKER_END = '<!-- CONTRIB:END -->';

/**
 * Formats star count nicely (e.g. 64177 -> ★64.2k, 315 -> ★315)
 */
export function formatStars(stars: number): string {
  if (stars >= 1000) {
    const k = (stars / 1000).toFixed(1).replace(/\.0$/, '');
    return `★${k}k`;
  }
  return `★${stars}`;
}

/**
 * Aggregates PRs and repositories into a structured summary
 */
export function summarizeContributions(
  prs: EnrichedPR[],
  repos: Record<string, RepoMeta>,
  config: ProfileConfig
): ContributionSummary {
  const groupsByRepo: Record<string, EnrichedPR[]> = {};

  for (const pr of prs) {
    if (!groupsByRepo[pr.repoFullName]) {
      groupsByRepo[pr.repoFullName] = [];
    }
    groupsByRepo[pr.repoFullName].push(pr);
  }

  const groups: RepoContributionGroup[] = [];
  let totalL10n = 0;
  let totalDocs = 0;
  let totalCode = 0;

  for (const [fullName, repoPrs] of Object.entries(groupsByRepo)) {
    const repoMeta = repos[fullName] || {
      fullName,
      name: fullName.split('/')[1] || fullName,
      owner: fullName.split('/')[0] || '',
      ownerType: 'User',
      description: null,
      stars: 0,
      html_url: `https://github.com/${fullName}`,
    };

    let l10n = 0;
    let docs = 0;
    let code = 0;

    for (const p of repoPrs) {
      if (p.category === 'l10n') l10n++;
      else if (p.category === 'docs') docs++;
      else if (p.category === 'code') code++;
    }

    totalL10n += l10n;
    totalDocs += docs;
    totalCode += code;

    // Sort PRs by merged_at descending (newest first)
    const sortedPrs = [...repoPrs].sort(
      (a, b) => new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime()
    );

    groups.push({
      repo: repoMeta,
      prs: sortedPrs,
      stats: {
        total: repoPrs.length,
        l10n,
        docs,
        code,
      },
    });
  }

  // Sort groups:
  // 1. config.featured index (if present)
  // 2. Stars descending
  // 3. Merged PR count descending
  // 4. Alphabetical by fullName
  groups.sort((a, b) => {
    const featA = config.featured.indexOf(a.repo.fullName);
    const featB = config.featured.indexOf(b.repo.fullName);

    if (featA !== -1 && featB !== -1) return featA - featB;
    if (featA !== -1) return -1;
    if (featB !== -1) return 1;

    if (b.repo.stars !== a.repo.stars) {
      return b.repo.stars - a.repo.stars;
    }
    if (b.stats.total !== a.stats.total) {
      return b.stats.total - a.stats.total;
    }
    return a.repo.fullName.localeCompare(b.repo.fullName);
  });

  return {
    totalMergedPRs: prs.length,
    totalRepos: groups.length,
    totalL10n,
    totalDocs,
    totalCode,
    groups,
  };
}

/**
 * Formats a single repo entry in clean mobile-friendly markdown
 */
function renderRepoItem(group: RepoContributionGroup): string {
  const { repo, stats, prs } = group;
  const starStr = formatStars(repo.stars);

  const parts: string[] = [`${stats.total} merged`];
  if (stats.l10n > 0) parts.push(`l10n ${stats.l10n}`);
  if (stats.code > 0) parts.push(`code ${stats.code}`);
  if (stats.docs > 0) parts.push(`docs ${stats.docs}`);

  const breakdownStr = parts.join(' · ');
  const repoLine = `- **[${repo.fullName}](${repo.html_url})** ${starStr} · ${breakdownStr}`;

  // Up to 3 representative PRs
  const topPRs = prs.slice(0, 3);
  const prLines = topPRs.map((pr) => {
    // Sanitize title for markdown link
    const cleanTitle = pr.title.replace(/[\[\]]/g, '').trim();
    return `  - [#${pr.number} ${cleanTitle}](${pr.html_url})`;
  });

  return [repoLine, ...prLines].join('\n');
}

/**
 * Generates the dynamic markdown content to place between markers
 */
export function renderContributionsMarkdown(summary: ContributionSummary, config: ProfileConfig): string {
  if (summary.totalMergedPRs === 0) {
    return '_No external merged pull requests found yet._';
  }

  const lines: string[] = [];

  // Summary line
  const summaryLine = `**${summary.totalMergedPRs} merged PRs across ${summary.totalRepos} repositories** · Localization ${summary.totalL10n} · Code ${summary.totalCode} · Docs ${summary.totalDocs}`;
  lines.push(summaryLine);
  lines.push('');

  const visibleGroups = summary.groups.slice(0, config.maxRepos);
  const hiddenGroups = summary.groups.slice(config.maxRepos);

  for (const group of visibleGroups) {
    lines.push(renderRepoItem(group));
  }

  if (hiddenGroups.length > 0) {
    lines.push('');
    lines.push(`<details>`);
    lines.push(`<summary>More repositories (${hiddenGroups.length})</summary>`);
    lines.push('');
    for (const group of hiddenGroups) {
      lines.push(renderRepoItem(group));
    }
    lines.push('');
    lines.push(`</details>`);
  }

  return lines.join('\n');
}

/**
 * Injects generated contribution markdown into README content between markers
 */
export function injectContributions(readmeContent: string, contributionsMd: string): string {
  const startIndex = readmeContent.indexOf(MARKER_START);
  const endIndex = readmeContent.indexOf(MARKER_END);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    throw new Error(
      `Markers ${MARKER_START} and ${MARKER_END} not found or malformed in README content`
    );
  }

  const before = readmeContent.slice(0, startIndex + MARKER_START.length);
  const after = readmeContent.slice(endIndex);

  return `${before}\n\n${contributionsMd}\n\n${after}`;
}
