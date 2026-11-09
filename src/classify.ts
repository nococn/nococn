import type { PRCategory } from './types.js';

export interface ClassifyInput {
  title: string;
  changedFiles: string[];
  htmlUrl: string;
  repoFullName?: string;
  number?: number;
}

// Regex for L10N titles
const L10N_TITLE_REGEX = /(?:\b(?:korean|ko|ko-KR|l10n|localization|translation|translations|i18n)\b|\((?:ko|ko-kr)\)|\[(?:ko|ko-kr)\]|[가-힣]*(?:번역|한글화|한국어))/i;

// Regex for L10N file paths
const L10N_FILE_REGEX = /(?:^|\/)(?:locales|i18n|l10n|translations|po)\/|[._\-/](?:ko|ko-KR)(?:[._\-/]|$)|README\.ko(?:\.md)?$/i;

// Regex for docs file extensions and directories
const DOCS_FILE_REGEX = /\.(?:md|mdx|rst|adoc|txt)$/i;
const DOCS_DIR_REGEX = /(?:^|\/)(?:docs|documentation|guides)\//i;

/**
 * Classifies a Pull Request into 'l10n' | 'docs' | 'code'
 */
export function classifyPR(
  pr: ClassifyInput,
  overrides: Record<string, PRCategory> = {}
): PRCategory {
  // 1. Check overrides
  if (overrides[pr.htmlUrl]) {
    return overrides[pr.htmlUrl];
  }
  if (pr.repoFullName && pr.number) {
    const shortKey = `${pr.repoFullName}#${pr.number}`;
    if (overrides[shortKey]) {
      return overrides[shortKey];
    }
  }

  // 2. Check repo-level localization (e.g. vuejs-translations/docs-ko)
  if (pr.repoFullName && /(?:docs-ko|translations|i18n|l10n)/i.test(pr.repoFullName)) {
    return 'l10n';
  }

  // 3. Check L10N via title
  if (L10N_TITLE_REGEX.test(pr.title)) {
    return 'l10n';
  }

  // 4. Check L10N via changed files
  if (pr.changedFiles && pr.changedFiles.length > 0) {
    const hasL10nFile = pr.changedFiles.some((f) => L10N_FILE_REGEX.test(f));
    if (hasL10nFile) {
      return 'l10n';
    }
  }

  // 5. Check Documentation: all files must be documentation files
  if (pr.changedFiles && pr.changedFiles.length > 0) {
    const allDocs = pr.changedFiles.every(
      (f) => DOCS_FILE_REGEX.test(f) || DOCS_DIR_REGEX.test(f)
    );
    if (allDocs) {
      return 'docs';
    }
  }

  // 6. Default to code
  return 'code';
}
