# Repository Audit & Migration Plan

## 1. Current Repository State

- **Repository**: `nococn/nococn` (Special profile repository for GitHub Profile README)
- **Files**:
  - `README.md`: Bilingual profile document with centered HTML headers, external SVG shields/badges, manual project links, tech stack, and third-party dynamic image widgets (`github-stats-extended`, `github-readme-streak-stats`, `github-profile-trophy`).
  - No existing GitHub Actions workflows (`.github/workflows/` did not exist).
  - No existing Node.js build pipeline or package configuration.
- **Git History**:
  - Commits `ebecc45` through `d0311bc` were manual profile edits.
  - Latest commit on `main` was `d0311bc` ("docs: update bilingual profile readme, remove ID from title and remove unmerged open source references").

## 2. Retained vs. Removed Content

### Retained Static Content (Normalized)
1. **Name & Identity**:
   - `Do-hyeong Kim (김도형)`
   - Headline: `Korean localization & open-source contributor`
   - Title: `Publisher @ [Korea Youth Media](https://kym.io.kr) · Busan, South Korea 🇰🇷`
   - Role description: "I localize open-source software into Korean, contribute fixes and docs upstream, and run a digital news outlet for young Koreans."
2. **Projects**:
   - **Korea Youth Media** (`https://kym.io.kr`): Digital news platform for youth, covering news and policy. Next.js · Vercel.
   - **Hangul Fast Search** (`https://github.com/nococn/hangul-fast-search`): Zero-dependency Korean chosung search library *(in progress)*.
   - **Gen5W Sound Suite** (`https://github.com/nococn/gen5w-sound-suite`): ALSA 10-band parametric EQ for factory audio, tested on Kia The New Seltos (merged with previous Seltos research line).
3. **Tech Stack**:
   - `TypeScript · Next.js · React · Node.js · Python · Tailwind CSS · Supabase · Vercel · Cloudflare · ALSA`
4. **Korean Summary**:
   - Folded in `<details><summary>한국어 소개</summary>`.

### Removed Elements
- Third-party dynamic stats and streak images (`github-stats-extended.vercel.app`, `github-readme-streak-stats.herokuapp.com`).
- Third-party trophy SVG widget (`github-profile-trophy.screw-hand.vercel.app`).
- External badges relying on shields.io ("GitHub Developer Program", "Email Contact").
- Plaintext email display (`nococn@kym.io.kr` removed from public text to prevent bot scraping).
- Centered HTML layout (`<div align="center">`), which breaks readability on mobile GitHub apps and markdown parsers.

## 3. Automation Architecture
- **Markers**: Replaceable dynamic region bounded by `<!-- CONTRIB:START -->` and `<!-- CONTRIB:END -->`.
- **Pipeline Structure**:
  - `src/fetch.ts`: Fetches merged PRs for `nococn` excluding owned repos, manages cache in `data/cache.json`, handles rate limits with backoff.
  - `src/classify.ts`: Rules-based classification (`l10n` | `docs` | `code`) with manual overrides from config.
  - `src/render.ts`: Generates clean, mobile-optimized markdown list with calculated metrics.
  - `profile.config.yml`: User configuration for usernames, exclusions, featured repos, and overrides.
  - `.github/workflows/update-readme.yml`: Scheduled daily update via GitHub Actions with idempotent commit behavior.
