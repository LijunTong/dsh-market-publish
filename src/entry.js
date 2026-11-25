/**
 * Listing entries: one YAML file per plugin at
 * `data/plugins/<owner>__<repo>.yml` in awesome-dsh-plugin/awesome-dsh-plugin.
 */

export const ENTRY_DIR = 'data/plugins'

/**
 * Single-quote a YAML scalar; the only escape inside single quotes is a doubled
 * quote, which keeps URLs and Chinese text readable.
 *
 * @param {string} value
 */
export function yamlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * @param {string} repo `owner/name`
 */
export function entryFileName(repo) {
  return `${repo.replace('/', '__')}.yml`
}

/**
 * @param {{ repo: string, category: string, en: string, zh?: string, icon?: string, tarball?: string }} entry
 */
export function buildEntry(entry) {
  const lines = [
    `url: https://github.com/${entry.repo}`,
    `name: ${entry.repo}`,
    `category: ${entry.category}`,
    'description:',
    `  en: ${yamlString(entry.en.trim())}`,
  ]
  const zh = (entry.zh ?? '').trim()
  if (zh !== '') lines.push(`  zh: ${yamlString(zh)}`)
  if (entry.icon !== undefined) lines.push(`icon: ${yamlString(entry.icon.trim())}`)
  if (entry.tarball !== undefined) lines.push(`tarball: ${yamlString(entry.tarball.trim())}`)
  return `${lines.join('\n')}\n`
}
