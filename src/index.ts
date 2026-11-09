import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { collectContributions } from './fetch.js';
import { classifyPR } from './classify.js';
import {
  summarizeContributions,
  renderContributionsMarkdown,
  injectContributions,
} from './render.js';
import type { EnrichedPR } from './types.js';

export async function runBuildReadme(options: {
  configPath?: string;
  readmePath?: string;
  cachePath?: string;
  token?: string;
} = {}): Promise<{
  summary: ReturnType<typeof summarizeContributions>;
  ambiguousPRs: EnrichedPR[];
  hasDiff: boolean;
}> {
  const config = loadConfig(options.configPath);
  const readmePath = options.readmePath || path.resolve(process.cwd(), 'README.md');

  console.log(`[build:readme] Starting contribution scan for @${config.username}...`);
  console.log(`[build:readme] Excluded owners: ${config.excludeOwners.join(', ') || 'none'}`);

  // 1. Fetch & cache
  const { prs, repos } = await collectContributions(config, {
    cachePath: options.cachePath,
    token: options.token,
  });

  console.log(`[build:readme] Collected ${prs.length} external merged PRs across ${Object.keys(repos).length} repositories.`);

  // 2. Classify
  const enrichedPRs: EnrichedPR[] = prs.map((pr) => {
    const category = classifyPR(
      {
        title: pr.title,
        changedFiles: pr.changedFiles,
        htmlUrl: pr.html_url,
        repoFullName: pr.repoFullName,
        number: pr.number,
      },
      config.overrides
    );
    return {
      ...pr,
      category,
    };
  });

  // Track potentially ambiguous classifications for reporting
  // (e.g. PR title has docs but code files, or multiple languages)
  const ambiguousPRs: EnrichedPR[] = enrichedPRs.filter((pr) => {
    const isDocTitle = /\bdocs\b/i.test(pr.title);
    const isL10nTitle = /(?:ko|korean|번역)/i.test(pr.title);
    if (isDocTitle && pr.category === 'code') return true;
    if (isL10nTitle && pr.category === 'code') return true;
    return false;
  });

  // 3. Summarize
  const summary = summarizeContributions(enrichedPRs, repos, config);
  console.log(
    `[build:readme] Summary: ${summary.totalMergedPRs} PRs | l10n: ${summary.totalL10n} | code: ${summary.totalCode} | docs: ${summary.totalDocs}`
  );

  // 4. Render
  const contribMarkdown = renderContributionsMarkdown(summary, config);

  // 5. Inject into README
  if (!fs.existsSync(readmePath)) {
    throw new Error(`[build:readme] README file not found at ${readmePath}`);
  }

  const originalReadme = fs.readFileSync(readmePath, 'utf-8');
  const updatedReadme = injectContributions(originalReadme, contribMarkdown);

  const hasDiff = originalReadme !== updatedReadme;
  if (hasDiff) {
    fs.writeFileSync(readmePath, updatedReadme, 'utf-8');
    console.log(`[build:readme] Successfully updated ${readmePath}`);
  } else {
    console.log(`[build:readme] No changes detected in ${readmePath} (idempotent).`);
  }

  return { summary, ambiguousPRs, hasDiff };
}

// Self-executing CLI when run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('src/index.ts')) {
  runBuildReadme().catch((err) => {
    console.error('[build:readme] Fatal error:', err);
    process.exit(1);
  });
}
