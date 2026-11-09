# Architectural & Design Decisions

This document records technical decisions, assumptions, and design rationale for the profile contribution updater pipeline.

---

## 1. Zero Runtime Dependencies

- **Decision**: No third-party packages in `dependencies` (`dependencies: {}`).
- **Rationale**: The updater is designed as a standalone, ultra-reliable tool that runs on standard Node.js 20+ environments (local and GitHub Actions runners) without dependency supply-chain risks or version conflicts.
- **Built-in Capabilities**:
  - `fetch` (native in Node.js 18+) for HTTP requests.
  - `fs/promises` and `path` for filesystem operations.
  - Native YAML-lite parser or typed configuration runner with TS (`tsx`).
- **Dev Dependencies**: Strictly limited to `typescript`, `tsx`, `vitest`, and `@types/node`.

---

## 2. Branching & Commit Discipline

- **Decision**: All development takes place on branch `feat/contrib-readme`.
- **Policy**:
  - Work is broken down into small, verified atomic commits corresponding to each phase.
  - No `git push` or PR creation is performed automatically; changes remain local until human review.

---

## 3. Data Fetching & Rate Limit Handling (`src/fetch.ts`)

- **Decision**: Use GitHub Search API combined with GitHub REST API for pull request files and repository details.
- **Target Filter**: `author:<username> is:pr is:merged` with exclusion of self-owned repositories and organizations defined in `config.excludeOwners`.
- **Search API Constraints**:
  - Max 1000 items per search query.
  - Search rate limit: 30 requests/minute for authenticated users.
  - Core API rate limit: 5000 requests/hour for authenticated users.
- **Incremental Cache (`data/cache.json`)**:
  - Each PR's file list and repository metadata are cached by PR node ID / URL upon first retrieval.
  - Successive runs only query the search endpoint to detect newly merged PRs and fetch details exclusively for cache misses.
  - `data/cache.json` is committed to the repository so GitHub Actions workflows benefit from persistent caching without consuming excessive API rate limits.
- **Rate Limit & Error Recovery**:
  - Detect HTTP 403 / 429 status codes.
  - Inspect `Retry-After` header or `x-ratelimit-reset` timestamp.
  - Implement exponential backoff (initial delay 1000ms, doubling up to 16000ms, max 3 retries) with jitter.

---

## 4. PR Classification Rules (`src/classify.ts`)

- **Decision**: Three distinct mutually exclusive categories: `l10n`, `docs`, `code`.
- **Rules Order**:
  1. **Config Override**: If PR URL or `#<number>` matches `config.overrides`, return overridden category.
  2. **Localization (`l10n`)**:
     - Files changed match regex: `/(?:^|\/)(?:locales|i18n|l10n|translations|po)\/|[._-](?:ko|ko-KR)\b|\bREADME\.ko(?:\.md)?$/i`
     - OR PR title matches regex: `/\b(?:korean|ko|ko-KR|l10n|localization|translation)\b|[가-힣]*(?:번역|한글화|한국어)/i`
  3. **Documentation (`docs`)**:
     - All changed files are documentation files (`.md`, `.mdx`, `.rst`, `.adoc`, `.txt`, or located under `docs/`).
  4. **Code & Fixes (`code`)**:
     - Any PR with source code changes, tests, scripts, or workflows not matching `l10n`.

---

## 5. Rendering Layout: Inline Tagged List vs. Separate Subsections (`src/render.ts`)

- **Decision**: Single unified list ordered by significance (featured -> stars desc -> merged PR count desc) with inline category counts and representative PR links.
- **Rationale**:
  - Dividing repositories by category (e.g. separate "Localization", "Code", "Documentation" headings) duplicates repositories when a user contributes both code and translations to the same project (e.g., `stats-organization/github-stats-extended` where both a new `ko` locale module and core logic were contributed).
  - An inline breakdown (`★12.3k · 5 merged · l10n 3 · code 2`) preserves repository identity, avoids fragmenting project impact, and fits GitHub Mobile's vertical reading flow without horizontal scrolling or messy wrapping.
  - High-impact repositories with high star counts (e.g., `tldr-pages/tldr`, `vuejs-translations/docs-ko`, `nushell.github.io`) are immediately visible at the top.

---

## 6. Job Title & Identity Consistency

- **Decision**: Unified to `Publisher @ [Korea Youth Media](https://kym.io.kr)`.
- **Note**: The user requested unifying the title to "Publisher" ("퍼블리셔로 직함통일"). In accordance with the prompt, an explicit `<!-- TODO(owner): 직함 확정 — ”Publisher“ 또는 ”Founder & Publisher“ -->` HTML comment is left directly beneath the headline in `README.md` for owner confirmation.

---

## 7. GitHub Actions Token Sufficiency (`.github/workflows/update-readme.yml`)

- **Decision**: The default `GITHUB_TOKEN` provided by GitHub Actions runner is sufficient.
- **Evaluation**:
  - **Read Operations**: The workflow queries public GitHub Search API (`author:nococn is:pr is:merged`), public PR files, and public repo metadata. The standard `GITHUB_TOKEN` has read permissions for public GitHub data and a rate limit of 1000 requests/hour per repository.
  - **Write Operations**: The workflow updates `README.md` and `data/cache.json` in `nococn/nococn`. Granting `permissions: contents: write` in the workflow YAML grants sufficient push authorization to the repository without requiring a Personal Access Token (PAT).
  - **Loop Prevention**: Workflow commits are authored with `[skip ci]` in the commit message to prevent recursive workflow trigger loops.
- **Edge Case / Future Alternative**: If the number of PRs or repositories increases dramatically, a Personal Access Token (`PAT`) with 5,000 req/hr core rate limit could be configured under repository secrets `GH_TOKEN` as an optional fallback. The script reads `process.env.GITHUB_TOKEN || process.env.GH_TOKEN`.
