const $ = (id) => document.getElementById(id)

const els = {
  input: $('input'),
  category: $('category'),
  repo: $('repo'),
  en: $('en'),
  zh: $('zh'),
  icon: $('icon'),
  tarball: $('tarball'),
  token: $('token'),
  npmToken: $('npm-token'),
  check: $('check'),
  publishMarket: $('publish-market'),
  result: $('result'),
  status: $('status'),
  issues: $('issues'),
  notes: $('notes'),
  entryBox: $('entry-box'),
  entryPath: $('entry-path'),
  entry: $('entry'),
  npmCheck: $('npm-check'),
  npmResult: $('npm-result'),
}

let lastCheck = null
let lastNpm = null

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function fields() {
  const optional = (value) => (value.trim() === '' ? undefined : value.trim())
  return {
    input: els.input.value.trim(),
    repo: optional(els.repo.value),
    category: optional(els.category.value),
    en: optional(els.en.value),
    zh: optional(els.zh.value),
    icon: optional(els.icon.value),
    tarball: optional(els.tarball.value),
    token: optional(els.token.value),
  }
}

async function api(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data
  try {
    data = await response.json()
  } catch {
    data = { ok: false, message: `服务返回了非 JSON（HTTP ${response.status}）` }
  }
  return { status: response.status, data }
}

function setBusy(button, busy, label) {
  if (busy) {
    button.dataset.label = button.textContent
    button.textContent = label
    button.disabled = true
    return
  }
  if (button.dataset.label) button.textContent = button.dataset.label
  button.disabled = false
}

function clear(node) {
  node.replaceChildren()
}

function renderCheck(data) {
  lastCheck = data
  els.result.hidden = false
  clear(els.status)
  clear(els.issues)
  clear(els.notes)

  const ok = data.ok === true
  els.status.className = `status ${ok ? 'ok' : 'bad'}`
  const headline = ok
    ? '检查通过'
    : data.stage === 'done'
      ? `还差 ${(data.issues ?? []).length} 项才能投稿`
      : '检查没跑起来'
  els.status.append(el('strong', '', headline))
  if (data.repo) els.status.append(el('span', 'meta', `仓库 ${data.repo}`))
  if (data.category) els.status.append(el('span', 'meta', `分类 ${data.category}`))
  if (data.package) els.status.append(el('span', 'meta', `${data.package.name}@${data.package.version}`))

  for (const issue of data.issues ?? []) {
    const item = el('li', 'issue')
    item.append(el('p', 'issue-message', issue.message))
    if (typeof issue.hint === 'string' && issue.hint !== '') {
      item.append(el('p', 'issue-hint', issue.hint))
    }
    els.issues.append(item)
  }

  for (const note of data.notes ?? []) els.notes.append(el('li', '', note))

  const hasEntry = typeof data.entry === 'string' && data.entry !== ''
  els.entryBox.hidden = !hasEntry
  if (hasEntry) {
    els.entryPath.textContent = data.entryPath
    els.entry.textContent = data.entry
  }

  els.publishMarket.disabled = !ok
}

async function onCheck() {
  if (els.input.value.trim() === '') {
    els.input.focus()
    return
  }
  setBusy(els.check, true, '检查中…')
  try {
    const { data } = await api('/api/check', fields())
    renderCheck(data)
  } catch (error) {
    renderCheck({
      ok: false,
      stage: 'error',
      issues: [{ message: error instanceof Error ? error.message : String(error), hint: '确认本机服务还在运行' }],
      notes: [],
      entry: '',
    })
  } finally {
    setBusy(els.check, false)
  }
}

async function onPublishMarket() {
  if (lastCheck === null || lastCheck.ok !== true) return
  const confirmed = window.confirm(
    `确认给 ${lastCheck.repo} 开收录 PR？\n\n会在 awesome-dsh-plugin 上 fork、提交 ${lastCheck.entryPath}，然后开 PR。`,
  )
  if (!confirmed) return

  setBusy(els.publishMarket, true, '提交中…')
  try {
    const { data } = await api('/api/publish/market', fields())
    if (data.ok === true) {
      els.result.hidden = false
      els.status.className = 'status ok'
      clear(els.status)
      els.status.append(el('strong', '', '收录 PR 已创建'))
      const link = el('a', 'pr-link', data.url)
      link.href = data.url
      link.target = '_blank'
      link.rel = 'noreferrer'
      els.status.append(link, el('span', 'meta', `分支 ${data.branch}`))
      els.publishMarket.disabled = true
      return
    }
    renderCheck(data)
  } catch (error) {
    window.alert(`发布失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    setBusy(els.publishMarket, false)
  }
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function renderNpm(data) {
  lastNpm = data
  els.npmResult.hidden = false
  clear(els.npmResult)

  const summary = el('div', 'npm-summary')
  summary.append(el('strong', '', `${data.name}@${data.version}`))
  summary.append(el('span', 'meta', `${data.files} 个文件 · ${formatSize(data.size)}`))
  summary.append(el('span', `badge ${data.published ? 'bad' : 'ok'}`, data.published ? '这个版本已发布' : '未发布'))
  els.npmResult.append(summary)

  if (data.published) return

  const actions = el('div', 'actions')
  const publish = el('button', 'danger', '发布到 npm')
  publish.type = 'button'
  publish.addEventListener('click', () => askNpmPublish(publish, data))
  actions.append(publish)
  els.npmResult.append(actions)
}

function askNpmPublish(button, data) {
  button.disabled = true
  const box = el('div', 'confirm')
  box.append(el('p', 'confirm-text', `确认把 ${data.name}@${data.version} 发布到 npm？发布后公开可见，24 小时外无法撤销。`))

  const actions = el('div', 'actions')
  const yes = el('button', 'danger', '确认发布')
  const no = el('button', 'ghost', '取消')
  yes.type = 'button'
  no.type = 'button'
  no.addEventListener('click', () => {
    box.remove()
    button.disabled = false
  })
  yes.addEventListener('click', async () => {
    yes.disabled = true
    yes.textContent = '发布中…'
    try {
      const { data: result } = await api('/api/npm/publish', {
        input: fields().input,
        token: els.npmToken.value.trim() || undefined,
        confirm: true,
      })
      if (result.ok === true) {
        box.remove()
        button.remove()
        els.npmResult.append(el('p', 'ok-line', result.message))
        if (typeof result.output === 'string' && result.output !== '') {
          els.npmResult.append(el('pre', 'output', result.output))
        }
        lastNpm = { ...data, published: true }
        return
      }
      box.replaceChildren(el('p', 'bad-line', result.message ?? '发布失败'))
    } catch (error) {
      box.replaceChildren(el('p', 'bad-line', `发布失败：${error instanceof Error ? error.message : String(error)}`))
    }
  })

  actions.append(yes, no)
  box.append(actions)
  els.npmResult.append(box)
}

async function onNpmCheck() {
  if (els.input.value.trim() === '') {
    els.input.focus()
    return
  }
  setBusy(els.npmCheck, true, '读取中…')
  try {
    const { data } = await api('/api/npm/preview', { input: fields().input })
    if (data.ok !== true) throw new Error(data.message ?? '读取 npm 包信息失败')
    renderNpm(data)
  } catch (error) {
    els.npmResult.hidden = false
    clear(els.npmResult)
    els.npmResult.append(el('p', 'bad-line', error instanceof Error ? error.message : String(error)))
  } finally {
    setBusy(els.npmCheck, false)
  }
}

async function loadCategories() {
  try {
    const response = await fetch('/api/categories')
    const data = await response.json()
    if (!Array.isArray(data.categories)) return
    for (const name of data.categories) {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      els.category.append(option)
    }
  } catch {
    /* 分类是可选增强，加载失败就留空 */
  }
}

els.check.addEventListener('click', onCheck)
els.publishMarket.addEventListener('click', onPublishMarket)
els.npmCheck.addEventListener('click', onNpmCheck)
els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') onCheck()
})

loadCategories()
