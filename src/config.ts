import fs from 'node:fs';
import path from 'node:path';
import type { ProfileConfig, PRCategory } from './types.js';

export const DEFAULT_CONFIG: ProfileConfig = {
  username: 'nococn',
  headline: 'Publisher @ Korea Youth Media',
  excludeOwners: ['nococn'],
  featured: [],
  maxRepos: 10,
  overrides: {},
};

/**
 * Pure TypeScript YAML-lite parser for profile.config.yml
 * Requires 0 runtime dependencies and supports comments, scalars, lists, and key-value maps.
 */
export function parseConfigYaml(content: string): ProfileConfig {
  const lines = content.split('\n');
  const result: Partial<ProfileConfig> = {};
  let currentKey: keyof ProfileConfig | null = null;
  let currentArray: string[] | null = null;
  let currentMap: Record<string, PRCategory> | null = null;

  for (const rawLine of lines) {
    // Strip comments, unless in quoted string
    const commentIdx = rawLine.indexOf('#');
    let line = rawLine;
    if (commentIdx !== -1) {
      // Basic check: is the '#' inside quotes?
      const before = rawLine.slice(0, commentIdx);
      const quoteCount = (before.match(/"/g) || []).length + (before.match(/'/g) || []).length;
      if (quoteCount % 2 === 0) {
        line = before;
      }
    }
    line = line.trimEnd();
    if (!line.trim()) continue;

    // Check array item
    const listMatch = line.match(/^\s*-\s*(.+)$/);
    if (listMatch && currentArray) {
      const val = stripQuotes(listMatch[1].trim());
      currentArray.push(val);
      continue;
    }

    // Check map item (e.g. within overrides)
    const mapMatch = line.match(/^\s+["']?([^"':]+)["']?\s*:\s*["']?([^"']+)["']?$/);
    if (mapMatch && currentMap) {
      const k = mapMatch[1].trim();
      const v = mapMatch[2].trim() as PRCategory;
      currentMap[k] = v;
      continue;
    }

    // Top-level key
    const topMatch = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (topMatch) {
      const key = topMatch[1].trim() as keyof ProfileConfig;
      const rawVal = topMatch[2].trim();

      if (rawVal === '' || rawVal === '[]') {
        if (key === 'excludeOwners' || key === 'featured') {
          currentArray = [];
          (result as Record<string, unknown>)[key] = currentArray;
          currentKey = key;
          currentMap = null;
          continue;
        } else if (key === 'overrides') {
          currentMap = {};
          result.overrides = currentMap;
          currentKey = key;
          currentArray = null;
          continue;
        }
      }

      if (rawVal === '{}') {
        if (key === 'overrides') {
          result.overrides = {};
          currentKey = key;
          currentMap = result.overrides;
          currentArray = null;
          continue;
        }
      }

      // Inline value
      currentKey = key;
      currentArray = null;
      currentMap = null;

      const val = stripQuotes(rawVal);
      if (key === 'maxRepos') {
        result.maxRepos = parseInt(val, 10) || DEFAULT_CONFIG.maxRepos;
      } else if (key === 'username') {
        result.username = val;
      } else if (key === 'headline') {
        result.headline = val;
      }
    }
  }

  return {
    username: result.username || DEFAULT_CONFIG.username,
    headline: result.headline || DEFAULT_CONFIG.headline,
    excludeOwners: result.excludeOwners ?? DEFAULT_CONFIG.excludeOwners,
    featured: result.featured ?? DEFAULT_CONFIG.featured,
    maxRepos: result.maxRepos ?? DEFAULT_CONFIG.maxRepos,
    overrides: result.overrides ?? DEFAULT_CONFIG.overrides,
  };
}

function stripQuotes(str: string): string {
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

export function loadConfig(configPath?: string): ProfileConfig {
  const resolved = configPath || path.resolve(process.cwd(), 'profile.config.yml');
  if (fs.existsSync(resolved)) {
    const raw = fs.readFileSync(resolved, 'utf-8');
    return parseConfigYaml(raw);
  }
  return { ...DEFAULT_CONFIG };
}
