import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(process.env.SHORTCUT_TEST_OUTPUT ?? `${root}/runs/shortcuts/browser`)
await mkdir(output, { recursive: true })
const profile = await mkdtemp(`${output}/chrome-`)
const chrome = process.env.CHROME_BIN ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync)
assert.ok(chrome, 'Install Chrome or set CHROME_BIN; the browser checks are required')
const fixture = spawn('go', ['run', './internal/httpapi/gql/testdata/browser'], {
  cwd: `${root}/backend`,
  env: { ...process.env, SHORTCUT_WEB_DIR: process.env.SHORTCUT_WEB_DIR ?? `${root}/frontend/dist/client` },
  stdio: ['pipe', 'pipe', 'pipe'],
})
let fixtureError = ''
fixture.stderr.on('data', (data) => { fixtureError += data })
let browser
let ws
const results = []
const timeout = setTimeout(() => { fixture.stdin.end() }, 600_000)
const pause = (ms) => new Promise((done) => setTimeout(done, ms))
async function until(fn, message, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const result = await fn()
    if (result) {
      return result
    }
    await pause(40)
  }
  throw new Error(message)
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }
  const exited = new Promise((done) => child.once('exit', done))
  child.kill('SIGTERM')
  await Promise.race([exited, pause(3000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}
try {
  const ready = await new Promise((done, reject) => {
    createInterface({ input: fixture.stdout }).once('line', (line) => done(JSON.parse(line)))
    fixture.once('exit', (code) => reject(new Error(`Fixture exited ${code}: ${fixtureError}`)))
  })
  browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  const port = await until(async () => {
    try {
      return (await readFile(`${profile}/DevToolsActivePort`, 'utf8')).split('\n')[0]
    } catch {
      return null
    }
  }, 'Headless Chrome did not start')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((done) => ws.addEventListener('open', done, { once: true }))
  let serial = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.text)
    }
    if (message.id) {
      const operation = pending.get(message.id)
      if (!operation) {
        return
      }
      pending.delete(message.id)
      clearTimeout(operation.timer)
      if (message.error) {
        operation.reject(new Error(JSON.stringify(message.error)))
      } else {
        operation.resolve(message.result)
      }
    }
  })
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    serial += 1
    const id = serial
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP timed out: ${method}`))
    }, 10_000)
    pending.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ id: serial, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    }
    return result.result.value
  }
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true })
  await cdp('Runtime.enable')
  await cdp('Network.enable')
  await cdp('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp('Network.setCookie', { name: 'jt_session', value: ready.session, url: ready.url, httpOnly: true })
  await cdp('Browser.grantPermissions', { origin: ready.url, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(navigator, 'platform', {get: () => 'MacIntel', configurable: true})" })
  const navigate = async (path) => {
    const previous = await evaluate('performance.timeOrigin')
    await cdp('Page.navigate', { url: ready.url + path })
    await until(async () => await evaluate(`performance.timeOrigin !== ${previous} && document.readyState === 'complete' && !!document.querySelector('main')`), `Page did not load: ${path}`)
    await until(async () => await evaluate(`!!document.querySelector('[data-issue-id], [data-issue-edit], [aria-label^="Dismiss update for"]')`), 'App did not hydrate')
    await evaluate('document.activeElement?.blur()')
  }
  const key = async (key, code = '', modifiers = 0) => {
    const commands = modifiers & 6 ? key === 'a' ? ['selectAll'] : key === 'z' ? [modifiers & 8 ? 'redo' : 'undo'] : [] : []
    const windowsVirtualKeyCode = { Enter: 13, Escape: 27, Backspace: 8, Tab: 9, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }[key] ?? 0
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, commands, windowsVirtualKeyCode, text: key === 'Enter' ? '\r' : undefined })
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode })
    await pause(key === 'Escape' ? 250 : 70)
  }
  const sequence = async (...keys) => {
    for (const value of keys) {
      await key(value, `Key${value.toUpperCase()}`)
    }
  }
  const click = async (selector) => {
    const box = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element) {
        return null
      }
      element.scrollIntoView({block: 'nearest'})
      const box = element.getBoundingClientRect()
      return {x: box.x + box.width / 2, y: box.y + box.height / 2}
    })()`)
    assert.ok(box, `Missing ${selector}`)
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box })
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box })
    await pause(100)
  }
  const hover = async (id) => {
    const selector = `[data-issue-id="${id}"]`
    await until(async () => await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), `Missing issue ${id}`)
    const box = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      element.scrollIntoView({block: 'nearest', inline: 'nearest'})
      const box = element.getBoundingClientRect()
      return {x: box.x + box.width / 2, y: box.y + box.height / 2}
    })()`)
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...box })
    await pause(80)
  }
  const clipboard = () => evaluate('navigator.clipboard.readText()')
  const sentinel = () => evaluate("navigator.clipboard.writeText('unchanged')")
  const gql = (query, variables = {}) => evaluate(`fetch('/graphql', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(${JSON.stringify({ query, variables })}),
  }).then(response => response.json()).then(response => {
    if (response.errors) {
      throw new Error(JSON.stringify(response.errors))
    }
    return response.data
  })`)
  await navigate('/issues')
  const catalog = await gql('query { viewer { id } teams { nodes { id key } } projects { nodes { id } } }')
  const team = catalog.teams.nodes.find((team) => team.key === 'ENG')
  const create = async (title, extra = {}) => (await gql('mutation ($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id identifier url title } } }', { input: { teamId: team.id, title, ...extra } })).issueCreate.issue
  const issue = await create('Fix: OAuth / callbacks & retries!')
  const child = await create('Check callback cancellation', { parentId: issue.id })
  const branch = `${issue.identifier.toLowerCase()}-fix-oauth-callbacks-retries`
  const readIssue = async () => (await gql('query ($id: String!) { issue(id: $id) { title description priority estimate dueDate state { name } project { id } cycle { id } assignee { id } labels { nodes { id } } team { id } } }', { id: issue.id })).issue
  const picker = () => evaluate("!!document.querySelector('[data-radix-popper-content-wrapper] input')")
  const tests = {
    async list_copy() {
      await navigate('/issues')
      await hover(issue.id)
      await sentinel()
      await key('>', 'Period', 12)
      assert.equal(await clipboard(), branch, 'list branch')
      assert.ok(await evaluate("document.body.innerText.includes('Branch name copied')"), 'copy toast')
      await key('.', 'Period', 4)
      assert.equal(await clipboard(), issue.identifier, 'ID')
      await key('<', 'Comma', 12)
      assert.equal(await clipboard(), issue.url, 'URL')
    },
    async board_copy() {
      await navigate('/issues')
      await key('b', 'KeyB', 4)
      await until(async () => await evaluate("!document.querySelector('[role=grid]') && !!document.querySelector('[data-issue-id]')"), 'Board did not open')
      await hover(issue.id)
      await sentinel()
      await key('>', 'Period', 12)
      assert.equal(await clipboard(), branch, 'board branch')
      await key('p', 'KeyP')
      assert.ok(await picker(), 'board priority picker opens')
      await key('Escape', 'Escape')
    },
    async board_navigation() {
      await navigate('/team/ENG/all')
      await key('b', 'KeyB', 4)
      await until(async () => await evaluate("!document.querySelector('[role=grid]') && !!document.querySelector('[data-issue-id]')"), 'Board did not open')
      const columns = await evaluate(`Array.from(document.querySelectorAll('[class~="group/column"]')).map(column => Array.from(column.querySelectorAll('[data-issue-id]')).map(card => ({id:card.dataset.issueId,identifier:card.innerText.match(/ENG-\\d+/)[0]}))).filter(column => column.length)`)
      assert.ok(columns.length > 1, 'Board fixture needs multiple populated columns')
      await hover(columns[0][0].id)
      await key('ArrowRight', 'ArrowRight')
      await key('.', 'Period', 4)
      assert.equal(await clipboard(), columns[1][0].identifier, 'Right arrow must move to the next populated column')
      await key('ArrowLeft', 'ArrowLeft')
      await key('.', 'Period', 4)
      assert.equal(await clipboard(), columns[0][0].identifier, 'Left arrow must return to the previous column')
    },
    async page_copy() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Issue did not load')
      await sentinel()
      await key('>', 'Period', 12)
      assert.equal(await clipboard(), branch, 'page branch')
    },
    async typing_isolation() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Title unavailable')
      await click('[data-issue-edit=title]')
      await sentinel()
      await key('>', 'Period', 12)
      assert.equal(await clipboard(), 'unchanged', 'title textarea must not copy')
      await key('c', 'KeyC')
      assert.equal(await evaluate("!!document.querySelector('[role=dialog]')"), false, 'typing must not create')
      await evaluate('document.activeElement.blur()')
      await key('a', 'KeyA')
      await until(picker, 'Assignee picker unavailable')
      await sentinel()
      await key('>', 'Period', 12)
      assert.equal(await clipboard(), 'unchanged', 'picker input must not copy')
      await key('Escape', 'Escape')
      await click('[data-issue-edit=description]')
      await sentinel()
      await key('>', 'Period', 12)
      assert.equal(await clipboard(), 'unchanged', 'markdown textarea must not copy')
    },
    async platform_modifiers() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Issue unavailable')
      await sentinel()
      await key('>', 'Period', 10)
      assert.equal(await clipboard(), 'unchanged', 'Mac Ctrl must not act as Cmd')
      await evaluate("Object.defineProperty(navigator, 'platform', {get: () => 'Linux x86_64', configurable: true})")
      await key('>', 'Period', 12)
      assert.equal(await clipboard(), 'unchanged', 'Linux Meta must not act as Ctrl')
      await key('>', 'Period', 10)
      assert.equal(await clipboard(), branch, 'Linux Ctrl branch')
    },
    async property_actions() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Issue unavailable')
      await key('i', 'KeyI')
      await until(async () => (await readIssue()).assignee?.id === catalog.viewer.id, 'Assign to me did not persist')
      await key('E', 'KeyE', 8)
      await until(picker, 'Shift E did not open estimate')
      await key('3', 'Digit3')
      await until(async () => (await readIssue()).estimate === 2, 'Number selection did not save estimate')
      await until(async () => !(await picker()), 'Estimate picker did not close')
      await key('P', 'KeyP', 8)
      await until(picker, 'Shift P did not open project')
      assert.ok(await evaluate("document.querySelector('[data-radix-popper-content-wrapper] input').placeholder.includes('project')"))
      await key('Escape', 'Escape')
      await key('ArrowDown', 'ArrowDown', 12)
      await until(async () => await evaluate(`location.pathname === '/issue/${child.identifier}'`), 'Open sub-issue failed')
      await key('ArrowUp', 'ArrowUp', 12)
      await until(async () => await evaluate(`location.pathname === '/issue/${issue.identifier}'`), 'Open parent failed')
    },
    async property_values() {
      const values = await gql('query { issueLabels { nodes { id } } projects { nodes { id } } cycles { nodes { id isActive team { id } } } }')
      const label = values.issueLabels.nodes[0]
      const project = values.projects.nodes[0]
      const cycle = values.cycles.nodes.find((item) => item.team.id === team.id && item.isActive)
      assert.ok(cycle, 'Seed must include an active cycle')
      await gql('mutation ($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }', { id: issue.id, input: { labelIds: [label.id], dueDate: '2030-01-01' } })
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Issue unavailable')
      await key('D', 'KeyD', 12)
      await until(async () => (await readIssue()).dueDate === null, 'Clear due date failed')
      await key('L', 'KeyL', 8)
      await until(picker, 'Remove label unavailable')
      await key('1', 'Digit1')
      await until(async () => !(await readIssue()).labels.nodes.length, 'Remove label failed')
      await until(async () => !(await picker()), 'Remove label did not close')
      await key('2', 'Digit2', 5)
      await until(async () => (await readIssue()).state.name === 'Todo', 'Numeric status did not persist')
      await key('P', 'KeyP', 8)
      await until(picker, 'Project unavailable')
      await click(`[cmdk-item][data-value$="${project.id}"]`)
      await until(async () => (await readIssue()).project?.id === project.id, 'Project did not persist')
      await until(async () => !(await picker()), 'Project did not close')
      await key('C', 'KeyC', 12)
      await until(async () => (await readIssue()).cycle?.id === cycle.id, 'Active cycle did not persist')
      await key('C', 'KeyC', 8)
      await until(picker, 'Cycle picker unavailable')
      await key('1', 'Digit1')
      await until(async () => (await readIssue()).cycle === null, 'Cycle picker did not persist')
    },
    async navigation() {
      await navigate('/issues')
      await sequence('g', 'm')
      await until(async () => await evaluate("location.pathname === '/my-issues'"), 'G M failed')
      await sequence('o', 'p')
      await until(async () => await evaluate("document.querySelector('[role=dialog] input')?.placeholder === 'Search projects…'"), 'O P failed')
      await key('Escape', 'Escape')
      await sequence('o', 'i')
      await until(async () => await evaluate("document.querySelector('[role=dialog] input')?.placeholder === 'Search issues…'"), 'O I failed')
      await key('Escape', 'Escape')
      await sequence('g', 'e')
      await until(async () => await evaluate("location.pathname === '/issues'"), 'G E failed')
      await key('j', 'KeyJ')
      await key('Enter', 'Enter')
      await until(async () => await evaluate("location.pathname.startsWith('/issue/')"), 'List keyboard navigation failed')
    },
    async palette_and_stale_context() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Issue unavailable')
      await key('k', 'KeyK', 4)
      await until(async () => await evaluate("!!document.querySelector('[cmdk-item]')"), 'Palette unavailable')
      await sentinel()
      await click('[cmdk-item][data-value="Copy git branch name"]')
      await until(async () => await evaluate("!document.querySelector('[role=dialog]')"), 'Palette did not close')
      assert.equal(await clipboard(), branch, 'palette branch')
      await key('k', 'KeyK', 4)
      await until(async () => await evaluate("!!document.querySelector('[cmdk-item]')"), 'Palette unavailable')
      await click('[cmdk-item][data-value="Change status…"]')
      await until(picker, 'Palette status did not open its picker')
      await key('Escape', 'Escape')
      await sequence('g', 'p')
      await until(async () => await evaluate("location.pathname === '/projects'"), 'Projects unavailable')
      await sentinel()
      await key('>', 'Period', 12)
      assert.equal(await clipboard(), 'unchanged', 'Issue context leaked to Projects')
    },
    async palette_toggle() {
      await navigate('/issues')
      await key('k', 'KeyK', 4)
      await until(async () => await evaluate("!!document.querySelector('[role=dialog] input')"), 'Palette unavailable')
      await key('k', 'KeyK', 4)
      await until(async () => await evaluate("!document.querySelector('[role=dialog]')"), 'Cmd K should close its focused palette')
    },
    async editor() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=description]')"), 'Description unavailable')
      await key('e', 'KeyE', 1)
      await until(async () => await evaluate("document.activeElement?.matches('textarea[data-markdown]')"), 'Option E did not focus description')
      await key('a', 'KeyA', 4)
      await cdp('Input.insertText', { text: 'selected words' })
      await key('a', 'KeyA', 4)
      await key('b', 'KeyB', 4)
      assert.equal(await evaluate('document.activeElement.value'), '**selected words**', 'Markdown bold')
      await key('z', 'KeyZ', 4)
      assert.equal(await evaluate('document.activeElement.value'), 'selected words', 'Native undo')
      await key('b', 'KeyB', 4)
      await key('Enter', 'Enter', 4)
      await until(async () => (await readIssue()).description === '**selected words**', 'Markdown save did not persist')
      assert.equal(await evaluate("document.querySelector('[data-issue-edit=description] strong')?.textContent"), 'selected words', 'Saved markdown must render')
    },
    async delete_confirmation() {
      await navigate(`/issue/${child.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Child unavailable')
      await key('Backspace', 'Backspace', 4)
      await until(async () => await evaluate("!!document.querySelector('[role=dialog]')"), 'Delete must confirm')
      assert.ok((await gql('query ($id: String!) { issue(id: $id) { id } }', { id: child.id })).issue)
      await key('Escape', 'Escape')
      assert.ok((await gql('query ($id: String!) { issue(id: $id) { id } }', { id: child.id })).issue, 'Cancellation keeps issue')
      await key('Backspace', 'Backspace', 4)
      await until(async () => await evaluate("!!document.querySelector('[role=dialog]')"), 'Delete confirmation unavailable')
      await click('[aria-label="Confirm delete issue"]')
      await until(async () => await evaluate("location.pathname === '/issues'"), 'Delete did not finish')
      const remaining = await gql('query { issues { nodes { id } } }')
      assert.equal(remaining.issues.nodes.some((i) => i.id === child.id), false, 'Delete did not persist')
      assert.ok((await gql('query ($id: String!) { issue(id: $id) { archivedAt } }', { id: child.id })).issue.archivedAt, 'Soft deletion preserves the issue for restoration')
    },
    async sequence_cancel() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Issue unavailable')
      await key('g', 'KeyG')
      await key('Escape', 'Escape')
      await key('m', 'KeyM')
      assert.equal(await evaluate('location.pathname'), `/issue/${issue.identifier}`, 'Escape must cancel sequence')
      await key('g', 'KeyG')
      await click('main header')
      await evaluate('document.activeElement.blur()')
      await key('m', 'KeyM')
      assert.equal(await evaluate('location.pathname'), `/issue/${issue.identifier}`, 'Pointer action must cancel sequence')
      await key('g', 'KeyG')
      await pause(900)
      await key('m', 'KeyM')
      assert.equal(await evaluate('location.pathname'), `/issue/${issue.identifier}`, 'Sequence must expire')
    },
    async details_and_rename() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[aria-label=\"Toggle issue details\"]')"), 'Details button unavailable')
      await key('i', 'KeyI', 4)
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Toggle issue details\"]').getAttribute('aria-pressed')"), 'false', 'Details did not hide')
      await key('p', 'KeyP')
      await until(picker, 'Hidden-sidebar shortcut picker unavailable')
      await key('Escape', 'Escape')
      await key('i', 'KeyI', 4)
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Toggle issue details\"]').getAttribute('aria-pressed')"), 'true', 'Details did not reopen')
      await key('r', 'KeyR')
      await until(async () => await evaluate("document.activeElement?.matches('[data-issue-edit=title]')"), 'R did not focus title')
      await evaluate('document.activeElement.blur()')
      await key('m', 'KeyM', 2)
      await until(async () => await evaluate("document.activeElement?.matches('[data-issue-edit=comment]')"), 'Ctrl M did not focus comment')
    },
    async create_submit() {
      await navigate('/my-issues')
      await key('c', 'KeyC')
      await until(async () => await evaluate("document.activeElement?.getAttribute('placeholder') === 'Issue title'"), 'C did not create')
      await cdp('Input.insertText', { text: 'Created entirely from the keyboard' })
      await key('Enter', 'Enter', 4)
      await until(async () => await evaluate("!document.querySelector('[role=dialog]')"), 'Cmd Enter did not submit')
      const data = await gql('query { issues { nodes { title assignee { id } } } }')
      assert.equal(data.issues.nodes.find((item) => item.title === 'Created entirely from the keyboard')?.assignee?.id, catalog.viewer.id, 'Creation must preserve My Issues defaults')
    },
    async team_move() {
      const moving = await create('Move this keyboard fixture')
      const target = catalog.teams.nodes.find((candidate) => candidate.id !== team.id)
      await navigate(`/issue/${moving.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Issue unavailable')
      await key('M', 'KeyM', 12)
      await until(picker, 'Move team picker unavailable')
      await click(`[cmdk-item][data-value$="${target.id}"]`)
      await until(async () => await evaluate(`location.pathname.startsWith('/issue/${target.key}-')`), 'Team move did not update route')
      const moved = await gql('query ($id: String!) { issue(id: $id) { team { id } } }', { id: moving.id })
      assert.equal(moved.issue.team.id, target.id, 'Team move did not persist')
    },
    async restore() {
      const archived = await create('Restore this keyboard fixture')
      await gql('mutation ($id: String!) { issueArchive(id: $id) { success } }', { id: archived.id })
      await navigate(`/issue/${archived.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Archived issue unavailable')
      await key('#', 'Digit3', 8)
      await until(async () => !(await gql('query ($id: String!) { issue(id: $id) { archivedAt } }', { id: archived.id })).issue.archivedAt, 'Restore did not persist')
      assert.ok(await evaluate("document.body.innerText.includes('restored')"), 'Restore must confirm')
    },
    async inbox() {
      await navigate('/inbox')
      await until(async () => await evaluate("!!document.querySelector('[aria-label^=\"Dismiss update for\"]')"), 'Inbox fixture unavailable')
      await key('j', 'KeyJ')
      await until(async () => await evaluate("!!new URLSearchParams(location.search).get('issue') && !!document.querySelector('[data-issue-edit=title]')"), 'Inbox J did not select an update')
      const identifier = await evaluate("new URLSearchParams(location.search).get('issue')")
      await key('e', 'KeyE')
      await until(async () => !(await gql('query { inbox { issue { identifier } } }')).inbox.some((entry) => entry.issue.identifier === identifier), 'Inbox E did not dismiss')
    },
    async inbox_back() {
      await navigate('/inbox')
      await key('j', 'KeyJ')
      await until(async () => await evaluate("!!document.querySelector('[data-issue-edit=title]')"), 'Inbox detail unavailable')
      await key('Escape', 'Escape')
      await until(async () => await evaluate("location.pathname === '/inbox' && !new URLSearchParams(location.search).has('issue')"), 'Inbox Escape must return to its own list')
    },
    async native_enter() {
      await navigate(`/issue/${issue.identifier}`)
      await until(async () => await evaluate("!!document.querySelector('[aria-label=\"Toggle issue details\"]')"), 'Details unavailable')
      await evaluate("document.querySelector('[aria-label=\"Toggle issue details\"]').focus()")
      await key('Enter', 'Enter')
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Toggle issue details\"]').getAttribute('aria-pressed')"), 'false', 'Enter must activate the focused button')
    },
    async help() {
      await navigate('/issues')
      await key('?', 'Slash', 8)
      await until(async () => await evaluate("document.querySelector('[role=dialog]')?.innerText.includes('Keyboard Shortcuts')"), 'Help unavailable')
      assert.ok(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Copy git branch name')"), 'Missing branch help')

      for (const [name, width, dark] of [['help-light', 1280, false], ['help-dark', 1280, true], ['help-narrow', 390, false]]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
        await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
        await pause(200)
        assert.equal(await evaluate('innerWidth'), width, 'Viewport must match the screenshot')
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Help overflows')
        assert.ok(await evaluate(`(() => {
          const panel = document.querySelector('[role=dialog]')
          const scroll = panel.querySelector('.overflow-y-auto')
          scroll.scrollTop = scroll.scrollHeight
          const reachable = scroll.lastElementChild.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom
          scroll.scrollTop = 0
          return reachable
        })()`), 'All help groups must be reachable')
        const shot = await cdp('Page.captureScreenshot', { format: 'png' })
        await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, 'base64'))
      }
      await key('Escape', 'Escape')
      await key('/', 'Slash', 4)
      assert.ok(await evaluate("document.querySelector('[role=dialog]')?.innerText.includes('Keyboard Shortcuts')"), 'Cmd / help unavailable')
    },
  }
  for (const [name, test] of Object.entries(tests)) {
    if (process.env.SHORTCUT_TEST_CASE && !process.env.SHORTCUT_TEST_CASE.split(',').includes(name)) {
      continue
    }
    try {
      await test()
      results.push({ name, passed: true })
      console.log(`PASS ${name}`)
    } catch (error) {
      results.push({ name, passed: false, error: error.message })
      console.error(`FAIL ${name}: ${error.message}`)
      const shot = await cdp('Page.captureScreenshot', { format: 'png' })
      await writeFile(`${output}/failure-${name}.png`, Buffer.from(shot.data, 'base64'))
    }
  }
  assert.deepEqual(errors, [], 'Uncaught browser errors')
  assert.ok(results.length && results.every((result) => result.passed), 'Browser checks failed')
} finally {
  clearTimeout(timeout)
  ws?.close()
  await stop(browser)
  const fixtureExited = new Promise((done) => fixture.once('exit', done))
  fixture.stdin.end()
  if (fixture.exitCode === null && fixture.signalCode === null) {
    await Promise.race([fixtureExited, pause(30_000)])
  }
  await stop(fixture)
  await rm(profile, { recursive: true, force: true })
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
}
