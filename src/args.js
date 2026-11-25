/**
 * Argument parsing for the `dsh-market-publish` command.
 *
 * Parsing is kept separate from the work so the CLI can be driven from tests
 * with a plain array of strings.
 */

export const USAGE = `dsh-market-publish — list a DeepSeek Harness plugin on awesome-dsh-plugin

Usage
  dsh-market-publish [options]

The current directory must be the plugin repository: the tool reads
package.json, checks it against the list rules, writes the listing entry, and
with --apply forks the list, commits the entry and opens the pull request.

Options
  --repo <owner/name>   target GitHub repository (default: the origin remote)
  --category <name>     list category (default: a matching package keyword)
  --en <text>           English description (default: package.json description)
  --zh <text>           Chinese description (optional)
  --icon <url>          GitHub-hosted raster tile (png/jpg/webp)
  --tarball <url>       optional release tarball
  --out <path>          where the dry run writes the entry
  --dir <path>          plugin directory (default: current directory)
  --no-check            skip the GitHub side checks (offline)
  --apply               fork + commit + open the pull request
  --json                print the result as JSON
  --help, -h            print this text

Environment
  GITHUB_TOKEN / GH_TOKEN   token with public_repo scope, required by --apply.
                            Without it the tool falls back to \`gh auth token\`.

Exit codes
  0  everything passed
  1  the plugin or the repository still has problems (listed on stdout)
  2  bad usage
`

const FLAGS = new Set(['apply', 'check', 'json', 'help'])

const VALUES = new Set(['repo', 'category', 'en', 'zh', 'icon', 'tarball', 'out', 'dir'])

/**
 * @param {readonly string[]} argv
 * @returns {{ help?: boolean, apply: boolean, check: boolean, json: boolean,
 *   repo?: string, category?: string, en?: string, zh?: string, icon?: string,
 *   tarball?: string, out?: string, dir?: string }}
 */
export function parseArgs(argv) {
  /** @type {any} */
  const options = { apply: false, check: true, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '-h') {
      options.help = true
      continue
    }
    const name = arg.startsWith('--') ? arg.slice(2) : null
    if (name === null) throw new Error(`unexpected argument: ${arg}`)
    if (name === 'no-check') {
      options.check = false
      continue
    }
    if (FLAGS.has(name)) {
      options[name] = true
      continue
    }
    if (!VALUES.has(name)) throw new Error(`unknown option: ${arg}`)
    index += 1
    if (index >= argv.length) throw new Error(`${arg} needs a value`)
    options[name] = argv[index]
  }
  return options
}
