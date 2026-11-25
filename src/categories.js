/**
 * Categories accepted by the awesome-dsh-plugin list.
 * Keep in sync with `data/categories.yml` in awesome-dsh-plugin/awesome-dsh-plugin.
 */
export const CATEGORIES = [
  'agi',
  'ui',
  'usage',
  'theme',
  'model',
  'identity',
  'session',
  'memory',
  'tools',
  'wsl',
  'browser',
  'vision',
  'voice',
  'docs',
  'skill',
  'workflow',
  'git',
  'notify',
  'dev',
  'security',
  'remote',
  'market',
  'fun',
]

export const CATEGORY_SET = new Set(CATEGORIES)

/**
 * Resolve the category: explicit flag first, then a keyword the package already
 * declares, so a plugin that says `"keywords": ["dsh", "git"]` needs no flag.
 *
 * @param {string | undefined} flag
 * @param {unknown} keywords
 * @returns {string | null}
 */
export function resolveCategory(flag, keywords) {
  if (flag !== undefined) return CATEGORY_SET.has(flag) ? flag : null
  if (Array.isArray(keywords)) {
    const found = keywords.find((keyword) => CATEGORY_SET.has(keyword))
    if (found !== undefined) return found
  }
  return null
}
