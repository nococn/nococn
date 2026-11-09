import { describe, it, expect } from 'vitest';
import { classifyPR } from '../src/classify.js';

describe('classifyPR', () => {
  it('classifies PR with Korean title as l10n', () => {
    const pr = {
      title: 'colab, colab-run: add Korean translation',
      changedFiles: ['pages/common/colab.md'],
      htmlUrl: 'https://github.com/tldr-pages/tldr/pull/25071',
    };
    expect(classifyPR(pr)).toBe('l10n');
  });

  it('classifies PR with ko in file path as l10n', () => {
    const pr = {
      title: 'sync cheatsheet',
      changedFiles: ['commands/docs/cheat_sheet.ko.md'],
      htmlUrl: 'https://github.com/nushell/nushell.github.io/pull/2285',
    };
    expect(classifyPR(pr)).toBe('l10n');
  });

  it('classifies PR in translation repo as l10n', () => {
    const pr = {
      title: '원문 동기화 (vuejs/docs b75d188a..40aa88af)',
      changedFiles: ['src/guide/essentials/application.md'],
      htmlUrl: 'https://github.com/vuejs-translations/docs-ko/pull/631',
      repoFullName: 'vuejs-translations/docs-ko',
      number: 631,
    };
    expect(classifyPR(pr)).toBe('l10n');
  });

  it('classifies pure docs changes as docs', () => {
    const pr = {
      title: 'docs: fix installation instructions and architecture diagram',
      changedFiles: ['docs/install.md', 'README.md'],
      htmlUrl: 'https://github.com/example/project/pull/10',
    };
    expect(classifyPR(pr)).toBe('docs');
  });

  it('classifies code bug fixes and features as code', () => {
    const pr = {
      title: 'fix(utils): formatKoreanDate invalid date guard',
      changedFiles: ['src/utils/date.ts', 'tests/date.test.ts'],
      htmlUrl: 'https://github.com/ghdtjdwn/ssuAI/pull/315',
    };
    expect(classifyPR(pr)).toBe('code');
  });

  it('respects manual overrides by URL', () => {
    const pr = {
      title: 'fix typo in comments',
      changedFiles: ['src/main.rs'],
      htmlUrl: 'https://github.com/example/repo/pull/99',
    };
    expect(classifyPR(pr, { 'https://github.com/example/repo/pull/99': 'docs' })).toBe('docs');
  });

  it('respects manual overrides by repo#number', () => {
    const pr = {
      title: 'add utility',
      changedFiles: ['src/util.py'],
      htmlUrl: 'https://github.com/example/repo/pull/42',
      repoFullName: 'example/repo',
      number: 42,
    };
    expect(classifyPR(pr, { 'example/repo#42': 'l10n' })).toBe('l10n');
  });
});
