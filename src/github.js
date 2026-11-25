/**
 * Minimal GitHub REST client.
 *
 * The fetch implementation is injected so tests can run without the network.
 */

export const API_ORIGIN = 'https://api.github.com'
export const USER_AGENT = 'dsh-market-publish'
export const TOKEN_VARIABLES = ['GITHUB_TOKEN', 'GH_TOKEN']

/**
 * @typedef {object} ApiResult
 * @property {number} status
 * @property {boolean} ok
 * @property {any} data
 */

/**
 * Convert a failed response into an Error that carries the status code.
 *
 * @param {string} label
 * @param {ApiResult} result
 * @returns {Error}
 */
export function apiError(label, result) {
  const message =
    result.data !== null && typeof result.data === 'object' && typeof result.data.message === 'string'
      ? result.data.message
      : String(result.data ?? '')
  const error = new Error(`${label} -> ${result.status} ${message}`.trim())
  // @ts-expect-error attached for callers that branch on the code
  error.status = result.status
  return error
}

/**
 * @param {{ token?: string, fetchImpl?: typeof fetch, origin?: string }} [options]
 */
export function createClient(options = {}) {
  const token = options.token ?? ''
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const origin = options.origin ?? API_ORIGIN

  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown, auth?: boolean, accept?: string }} [init]
   * @returns {Promise<ApiResult>}
   */
  async function request(path, init = {}) {
    /** @type {Record<string, string>} */
    const headers = { accept: init.accept ?? 'application/vnd.github+json', 'user-agent': USER_AGENT }
    if (init.auth !== false && token !== '') headers.authorization = `Bearer ${token}`
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    const response = await fetchImpl(`${origin}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const text = await response.text()
    let data = null
    if (text !== '') {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    return { status: response.status, ok: response.ok, data }
  }

  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown, auth?: boolean }} [init]
   */
  async function orThrow(path, init = {}) {
    const result = await request(path, init)
    if (!result.ok) throw apiError(`${init.method ?? 'GET'} ${path}`, result)
    return result.data
  }

  return { request, orThrow, token }
}

/**
 * Read a token from the environment, falling back to an authenticated GitHub
 * CLI so users who already ran `gh auth login` need no extra setup.
 *
 * @param {{ env?: Record<string, string | undefined>, readGhToken?: () => string | null }} [options]
 * @returns {string}
 */
export function resolveToken(options = {}) {
  const env = options.env ?? process.env
  for (const name of TOKEN_VARIABLES) {
    const value = env[name]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  if (options.readGhToken) {
    try {
      const value = options.readGhToken()
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    } catch {
      /* gh not installed or not signed in */
    }
  }
  return ''
}
