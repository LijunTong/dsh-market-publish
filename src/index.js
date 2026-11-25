/**
 * Public surface of the package: the pieces are usable on their own, so the
 * checks can be embedded in a CI job without shelling out to the CLI.
 */
export { parseArgs, USAGE } from './args.js'
export { CATEGORIES, CATEGORY_SET, resolveCategory } from './categories.js'
export { checkDescriptions, checkIcon, checkPackage, checkRepository, daysSince, MIN_AGE_DAYS, REQUIRED_TOPIC } from './checks.js'
export { buildEntry, ENTRY_DIR, entryFileName, yamlString } from './entry.js'
export { API_ORIGIN, createClient, resolveToken } from './github.js'
export { defaultExec, detectRemoteRepo, ghTokenReader, parseGitHubRemote, readPackage } from './repo.js'
export { branchName, pullRequestBody, submitEntry, UPSTREAM, UPSTREAM_BRANCH } from './submit.js'
export { main } from './cli.js'
