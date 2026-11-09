export type PRCategory = 'l10n' | 'docs' | 'code';

export interface ProfileConfig {
  username: string;
  headline: string;
  excludeOwners: string[];
  featured: string[];
  maxRepos: number;
  overrides: Record<string, PRCategory>;
}

export interface RawPullRequestItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  created_at: string;
  closed_at: string | null;
  pull_request?: {
    url: string;
    merged_at: string | null;
  };
}

export interface CachedPR {
  id: number;
  number: number;
  title: string;
  html_url: string;
  repoFullName: string;
  merged_at: string;
  created_at: string;
  changedFiles: string[];
  category?: PRCategory;
}

export interface RepoMeta {
  fullName: string;
  name: string;
  owner: string;
  ownerType: 'User' | 'Organization';
  description: string | null;
  stars: number;
  html_url: string;
}

export interface CacheData {
  version: number;
  lastUpdated: string;
  prs: Record<string, CachedPR>; // Keyed by PR html_url
  repos: Record<string, RepoMeta>; // Keyed by repo fullName
}

export interface EnrichedPR extends CachedPR {
  category: PRCategory;
}

export interface RepoContributionGroup {
  repo: RepoMeta;
  prs: EnrichedPR[];
  stats: {
    total: number;
    l10n: number;
    docs: number;
    code: number;
  };
}

export interface ContributionSummary {
  totalMergedPRs: number;
  totalRepos: number;
  totalL10n: number;
  totalDocs: number;
  totalCode: number;
  groups: RepoContributionGroup[];
}
