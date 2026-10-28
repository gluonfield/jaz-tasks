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
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      console.error(message.params.args.map((arg) => arg.description ?? arg.value).join(' '))
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
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Network.enable')
  await cdp('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp('Network.setCookie', { name: 'jt_session', value: ready.session, url: ready.url, httpOnly: true })
  await cdp('Browser.grantPermissions', { origin: ready.url, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(navigator, 'platform', {get: () => 'MacIntel', configurable: true})" })
  const navigate = async (path, hasIssues = true) => {
    const previous = await evaluate('performance.timeOrigin')
    await cdp('Page.navigate', { url: ready.url + path })
    await until(async () => await evaluate(`performance.timeOrigin !== ${previous} && document.readyState === 'complete' && !!document.querySelector('main')`), `Page did not load: ${path}`)
    if (hasIssues) {
      await until(async () => await evaluate(`!!document.querySelector('[data-issue-id], [data-issue-edit], [aria-label^="Dismiss update for"]')`), 'App did not hydrate')
    }
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
  const select = (label, value) => evaluate(`(() => {
    const control = Array.from(document.querySelectorAll('label')).find(label => label.querySelector('span')?.textContent === ${JSON.stringify(label)}).querySelector('select')
    control.value = ${JSON.stringify(value)}
    control.dispatchEvent(new Event('change', {bubbles: true}))
  })()`)
  const toggle = (text) => evaluate(`Array.from(document.querySelectorAll('label')).find(label => label.textContent.trim() === ${JSON.stringify(text)}).querySelector('input[type=checkbox]').click()`)
  const dateClock = async (run) => {
    await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Europe/London' })
    const script = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "Date.now = () => window.__tasksNow ?? Date.parse('2026-10-25T23:59:59.500Z')" })
    try {
      await run()
    } finally {
      await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier })
      await cdp('Emulation.setTimezoneOverride', { timezoneId: '' })
      await evaluate('Date.now = () => new Date().getTime()')
    }
  }
  let labelData
  const labelBoard = async () => {
    if (!labelData) {
      const labels = {}
      for (const name of ['Product', 'Admin', 'Customers']) {
        labels[name] = (await gql('mutation ($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id } } }', { input: { name, teamId: team.id } })).issueLabelCreate.issueLabel.id
      }
      const otherTeam = catalog.teams.nodes.find((candidate) => candidate.id !== team.id)
      await gql('mutation ($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success } }', { input: { name: 'Other team label', teamId: otherTeam.id } })
      const states = (await gql('query { workflowStates { nodes { id type team { id } } } }')).workflowStates.nodes
      const done = states.find((state) => state.team.id === team.id && state.type === 'completed')
      const open = await create('Ship customer dashboard', { labelIds: [labels.Product] })
      const completed = await create('Publish product release', { labelIds: [labels.Product, labels.Admin], stateId: done.id })
      const unlabelled = await create('Triage incoming work')
      labelData = { labels, open, completed, unlabelled }
    }
    await navigate('/team/ENG/all')
    await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Display').click()")
    await until(async () => await evaluate("Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'board')"), 'Display unavailable')
    await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'board').click()")
    await select('Group by', 'label')
    await key('Escape', 'Escape')
    await until(async () => await evaluate(`!!document.querySelector('[data-issue-group="${labelData.labels.Product}"]')`), 'Label board unavailable')
    return labelData
  }
  const drag = async (source, destination) => {
    const boxes = await evaluate(`(() => {
      const bounds = selector => {
        const box = document.querySelector(selector).getBoundingClientRect()
        return {x: box.x + box.width / 2, y: box.y + box.height / 2}
      }
      return [bounds(${JSON.stringify(source)}), bounds(${JSON.stringify(destination)})]
    })()`)
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...boxes[0] })
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...boxes[0] })
    for (let step = 1; step <= 12; step += 1) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, x: boxes[0].x + (boxes[1].x - boxes[0].x) * step / 12, y: boxes[0].y + (boxes[1].y - boxes[0].y) * step / 12 })
      await pause(40)
    }
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...boxes[1] })
  }
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
      await gql('mutation ($id: String!) { issueDelete(id: $id) { success } }', { id: moving.id })
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
    async label_grouping() {
      const { labels, open, completed, unlabelled } = await labelBoard()
      const card = (group, issue) => `[data-issue-group="${group}"] [data-issue-id="${issue.id}"]`
      assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(card(labels.Product, open))})`), 'Product must contain its open issue')
      assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(card(labels.Product, completed))}) && !!document.querySelector(${JSON.stringify(card(labels.Admin, completed))})`), 'Multi-label completed issue must appear in both columns')
      assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(card('no-label', unlabelled))})`), 'Unlabelled issue must remain visible')
      assert.ok(await evaluate(`!!document.querySelector('[data-issue-group="${labels.Customers}"]')`), 'Empty labels must have a column')
      assert.equal(await evaluate("document.querySelector('main').innerText.includes('Other team label')"), false, 'Team view must exclude another team’s labels')
      await navigate('/team/ENG/all')
      assert.ok(await evaluate(`!!document.querySelector('[data-issue-group="${labels.Product}"]')`), 'Grouping must survive reload')
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Display').click()")
      await toggle('Show empty groups')
      assert.equal(await evaluate(`!!document.querySelector('[data-issue-group="${labels.Customers}"]')`), false, 'Empty label columns must be hidden')
      await key('Escape', 'Escape')
      await navigate('/team/ENG/all')
      assert.equal(await evaluate(`!!document.querySelector('[data-issue-group="${labels.Customers}"]')`), false, 'Empty-column setting must survive reload')
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Display').click()")
      await toggle('Show empty groups')
      await select('Completed tasks', 'hidden')
      assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(card(labels.Product, completed))}) || !!document.querySelector(${JSON.stringify(card(labels.Admin, completed))})`), false, 'Completed toggle must hide every occurrence')
      assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(card(labels.Product, open))})`), 'Completed toggle must keep open work')
      await select('Completed tasks', '7d')
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'list').click()")
      await key('Escape', 'Escape')
      assert.ok(await evaluate(`!!document.querySelector('[role=grid]') && !!document.querySelector(${JSON.stringify(card(labels.Admin, completed))})`), 'List must use label grouping too')
      await key('b', 'KeyB', 4)
      await click(`[data-issue-group="${labels.Customers}"] button[aria-label="Create issue in Customers"]`)
      await until(async () => await evaluate("document.activeElement?.getAttribute('placeholder') === 'Issue title'"), 'Column create unavailable')
      await cdp('Input.insertText', { text: 'Follow up with customer' })
      await key('Enter', 'Enter', 4)
      await until(async () => !(await evaluate("!!document.querySelector('[role=dialog]')")), 'Column create did not submit')
      const created = (await gql('query { issues { nodes { title labelIds team { id } } } }')).issues.nodes.find((issue) => issue.title === 'Follow up with customer')
      assert.deepEqual(created.labelIds, [labels.Customers], 'Column create must assign its label')
      assert.equal(created.team.id, team.id, 'Column create must preserve its team')
      const columns = await evaluate(`Array.from(document.querySelectorAll('[data-issue-group]')).map(column => Array.from(column.querySelectorAll('[data-issue-id]')).map(card => ({id: card.dataset.issueId, identifier: card.innerText.match(/ENG-\\d+/)[0]}))).filter(column => column.length)`)
      const first = columns.findIndex((column) => column.some((issue) => issue.id === completed.id))
      let row = columns[first].findIndex((issue) => issue.id === completed.id)
      await hover(completed.id)
      await key('p', 'KeyP')
      assert.equal(await evaluate("document.querySelectorAll('[data-radix-popper-content-wrapper] input').length"), 1, 'Repeated cards must open one visible-property picker')
      await key('Escape', 'Escape')
      await key('l', 'KeyL')
      assert.equal(await evaluate("document.querySelectorAll('[data-radix-popper-content-wrapper] input').length"), 1, 'Repeated cards must open one hidden-property picker')
      await key('Escape', 'Escape')
      for (const column of columns.slice(first + 1)) {
        row = Math.min(row, column.length - 1)
        await key('ArrowRight', 'ArrowRight')
        await key('.', 'Period', 4)
        assert.equal(await clipboard(), column[row].identifier, 'Navigation must progress past repeated cards')
      }
    },
    async label_drag() {
      const { labels, completed } = await labelBoard()
      await cdp('Emulation.setDeviceMetricsOverride', { width: 4000, height: 900, deviceScaleFactor: 1, mobile: false })
      const read = async () => (await gql('query ($id: String!) { issue(id: $id) { labelIds state { id type } } }', { id: completed.id })).issue
      const original = await read()
      const source = `[data-issue-group="${labels.Product}"] [data-issue-id="${completed.id}"]`
      const target = `[data-issue-group="${labels.Customers}"] > div`
      await evaluate(`document.querySelector(${JSON.stringify(source)}).scrollIntoView({block: 'nearest', inline: 'nearest'})`)
      await drag(source, target)
      await until(async () => {
        const value = await read()
        return value.labelIds.includes(labels.Customers) && !value.labelIds.includes(labels.Product)
      }, 'Drag must replace the source label')
      assert.ok((await read()).labelIds.includes(labels.Admin), 'Drag must preserve other labels')
      assert.equal((await read()).state.id, original.state.id, 'Drag must preserve completion status')
      await navigate('/team/ENG/all')
      await drag(`[data-issue-group="${labels.Customers}"] [data-issue-id="${completed.id}"]`, `[data-issue-group="${labels.Admin}"] [data-issue-id="${completed.id}"]`)
      await until(async () => (await read()).labelIds.length === 1, 'Dropping onto an existing occurrence must remove the source label without duplication')
      assert.deepEqual((await read()).labelIds, [labels.Admin])
      await navigate('/team/ENG/all')
      await evaluate("document.querySelector('[data-issue-group=\"no-label\"]').scrollIntoView({inline: 'nearest'})")
      const origin = `[data-issue-group="${labels.Admin}"] [data-issue-id="${completed.id}"]`
      await evaluate(`document.querySelector(${JSON.stringify(origin)}).scrollIntoView({block: 'nearest', inline: 'nearest'})`)
      await drag(origin, '[data-issue-group="no-label"] > div')
      await until(async () => !(await read()).labelIds.length, 'No label drop must clear labels')
      assert.equal((await read()).state.id, original.state.id, 'Clearing labels must preserve status')
    },
    async status_drag() {
      await navigate('/team/ENG/all')
      await cdp('Emulation.setDeviceMetricsOverride', { width: 2800, height: 900, deviceScaleFactor: 1, mobile: false })
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Display').click()")
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'board').click()")
      await select('Group by', 'state')
      await key('Escape', 'Escape')
      const before = await create('Reorder before this task')
      const moving = await create('Move across workflow columns')
      await navigate('/team/ENG/all')
      await drag(`[data-issue-id="${moving.id}"]`, `[data-issue-id="${before.id}"]`)
      await until(async () => {
        const sortOrders = (await gql('query { issues { nodes { id sortOrder } } }')).issues.nodes
        return sortOrders.find((issue) => issue.id === moving.id).sortOrder > sortOrders.find((issue) => issue.id === before.id).sortOrder
      }, 'Manual reordering must move below the target')
      await navigate('/team/ENG/all')
      await drag(`[data-issue-id="${moving.id}"]`, '[data-issue-group="completed:Done"] > div')
      await until(async () => (await gql('query ($id: String!) { issue(id: $id) { state { type } } }', { id: moving.id })).issue.state.type === 'completed', 'Status drag must persist the destination workflow state')
      await until(async () => await evaluate(`document.querySelectorAll('[data-issue-id="${moving.id}"]').length === 1`), 'Drop animation must finish before targeting the card')
      await hover(moving.id)
      await key('s', 'KeyS')
      await until(picker, 'Status picker unavailable')
      const todo = (await gql('query { workflowStates { nodes { id type team { id } } } }')).workflowStates.nodes.find((state) => state.team.id === team.id && state.type === 'unstarted')
      await click(`[cmdk-item][data-value$="${todo.id}"]`)
      await until(async () => (await gql('query ($id: String!) { issue(id: $id) { state { id } } }', { id: moving.id })).issue.state.id === todo.id, 'Status shortcut did not move the task')
      await key('p', 'KeyP')
      await until(picker, 'Keyboard focus must follow the task into its new group')
      await key('Escape', 'Escape')
    },
    async saved_views() {
      const { labels, open } = await labelBoard()
      const states = (await gql('query { workflowStates { nodes { id type team { id } } } }')).workflowStates.nodes
      const done = states.find((state) => state.team.id === team.id && state.type === 'completed')
      await create('Publish customer release', { labelIds: [labels.Product], stateId: done.id })
      await create('Review supplier invoices', { labelIds: [labels.Admin] })
      await create('File supplier invoice', { labelIds: [labels.Admin], stateId: done.id })
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
      await navigate('/views', false)
      await until(async () => await evaluate("Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Create view')"), 'Views unavailable')
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Create view').click()")
      await until(async () => await evaluate("!!document.querySelector('[role=dialog] form')"), 'View creation unavailable')
      await click('[role=dialog] input:not([type=checkbox])')
      await cdp('Input.insertText', { text: 'Customer delivery' })
      await select('Team', team.id)
      for (const name of ['Product', 'Admin', 'Customers']) {
        await toggle(name)
      }
      await select('Ordering', 'priority')
      await click('[role=dialog] button[type=submit]')
      await until(async () => await evaluate("location.pathname.startsWith('/view/') && !!document.querySelector('[data-issue-id]')"), 'Created view did not open')
      const id = await evaluate("location.pathname.split('/').pop()")
      const read = async () => (await gql('query { savedViews { id name teamId labelIds layout grouping ordering completedFilter dueDateFilter showEmpty } }')).savedViews.find((view) => view.id === id)
      const saved = await read()
      assert.equal(saved.name, 'Customer delivery')
      assert.equal(saved.teamId, team.id)
      assert.deepEqual(new Set(saved.labelIds), new Set(Object.values(labels)))
      assert.equal(saved.layout, 'board')
      assert.equal(saved.grouping, 'label')
      assert.equal(saved.ordering, 'priority')
      assert.equal(saved.completedFilter, '7d')
      assert.equal(saved.dueDateFilter, 'any')
      assert.equal(saved.showEmpty, false)
      assert.ok(await evaluate(`!!document.querySelector('[data-issue-group="${labels.Product}"] [data-issue-id="${open.id}"]')`), 'Saved filter must keep matching tasks')
      await evaluate(`localStorage.setItem('jaz-tasks:layout:view:${id}', 'list'); localStorage.setItem('jaz-tasks:grouping:view:${id}', 'state')`)
      await navigate(`/view/${id}`)
      assert.ok(await evaluate(`!document.querySelector('[role=grid]') && !!document.querySelector('[data-issue-group="${labels.Product}"]')`), 'Shared settings must override personal browser preferences')
      await gql('mutation ($id: String!) { savedViewUpdate(id: $id, input: {name: "Teammate edit"}) { id } }', { id })
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Display').click()")
      await toggle('Show empty groups')
      await until(async () => (await read()).showEmpty, 'Display edit must persist in the server')
      assert.equal((await read()).name, 'Teammate edit', 'Display edits must preserve a teammate’s unsynced rename')
      for (const [name, width, dark] of [['labels-light', 1400, false], ['labels-dark', 1400, true], ['labels-narrow', 390, false]]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
        await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
        await pause(200)
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Label board overflows the page')
        const shot = await cdp('Page.captureScreenshot', { format: 'png' })
        await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, 'base64'))
      }
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
      await select('Group by', 'state')
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'list').click()")
      await until(async () => {
        const view = await read()
        return view.grouping === 'state' && view.layout === 'list'
      }, 'Shared display update did not save')
      await key('Escape', 'Escape')
      await navigate(`/view/${id}`)
      assert.ok(await evaluate("!!document.querySelector('[role=grid]')"), 'Shared layout must survive reload')
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Edit view').click()")
      await gql('mutation ($id: String!) { savedViewUpdate(id: $id, input: {grouping: "label", showEmpty: false}) { id } }', { id })
      await click('[role=dialog] input:not([type=checkbox])')
      await key('a', 'KeyA', 4)
      await cdp('Input.insertText', { text: 'Customer work' })
      await click('[role=dialog] button[type=submit]')
      await until(async () => (await read()).name === 'Customer work', 'View rename did not save')
      assert.equal((await read()).grouping, 'label', 'Form submission must preserve an unsynced display change')
      assert.equal((await read()).showEmpty, false, 'Form submission must only send edited fields')
      await navigate('/views', false)
      await until(async () => await evaluate(`!!document.querySelector('a[href="/view/${id}"]')`), 'Saved view missing from Views')
      await click(`a[href="/view/${id}"]`)
      await until(async () => await evaluate("Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Edit view')"), 'Saved view did not reopen')
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Edit view').click()")
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Delete view').click()")
      assert.ok(await read(), 'Deletion must require confirmation')
      await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Confirm delete').click()")
      await until(async () => !(await read()), 'View deletion did not persist')
    },
    async date_filters() {
      await dateClock(async () => {
        const dateTeam = catalog.teams.nodes.find((candidate) => candidate.key === 'DATE')
        const preference = `jaz-tasks:completed:team:${dateTeam.id}:all`
        await evaluate(`localStorage.setItem(${JSON.stringify(preference)}, 'yes')`)
        await navigate('/team/DATE/all')
        const fixtures = (await gql('query { issues(first: 250) { nodes { id title team { id } } } }')).issues.nodes.filter((item) => item.team.id === dateTeam.id)
        const visible = async () => {
          const ids = await evaluate("Array.from(document.querySelectorAll('[data-issue-id]')).map(row => row.dataset.issueId)")
          return fixtures.filter((item) => ids.includes(item.id)).map((item) => item.title).sort()
        }
        const expect = async (titles) => {
          const expected = [...titles].sort()
          await until(async () => JSON.stringify(await visible()) === JSON.stringify(expected), `Expected ${expected.join(', ')}; saw ${(await visible()).join(', ')}`)
        }
        const display = () => evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Display').click()")
        const open = ['Open without date', 'Due Monday', 'Due Sunday', 'Due next Monday', 'Due previous Sunday', 'Reopened work']
        await expect(fixtures.map((item) => item.title))
        await evaluate(`localStorage.setItem(${JSON.stringify(preference)}, 'no')`)
        await navigate('/team/DATE/all')
        await expect(open)
        await evaluate(`localStorage.removeItem(${JSON.stringify(preference)})`)
        await navigate('/team/DATE/all')
        assert.equal(await evaluate('Date.now()'), Date.parse('2026-10-25T23:59:59.500Z'), 'Date scenario must run on Sunday')
        await expect([...open, 'Done Tuesday', 'Done Sunday', 'Done seven days ago', 'Canceled Sunday'])
        await display()
        await select('Completed tasks', 'week')
        await expect([...open, 'Done Monday midnight', 'Done Tuesday', 'Done Sunday', 'Done seven days ago', 'Done before seven days', 'Canceled Sunday'])
        await select('Completed tasks', 'hidden')
        await expect(open)
        await select('Completed tasks', '30d')
        await expect([...open, 'Done Monday midnight', 'Done previous Sunday', 'Done Tuesday', 'Done Sunday', 'Done seven days ago', 'Done before seven days', 'Done this month', 'Canceled Sunday'])
        await select('Completed tasks', 'all')
        await expect(fixtures.map((item) => item.title))
        await select('Due date', 'week')
        await expect(['Due Monday', 'Due Sunday', 'Done Monday midnight', 'Done Sunday', 'Done long ago'])
        await select('Completed tasks', 'hidden')
        await expect(['Due Monday', 'Due Sunday'])
        await select('Completed tasks', 'week')
        const weekly = ['Due Monday', 'Due Sunday', 'Done Monday midnight', 'Done Sunday']
        await expect(weekly)
        await key('Escape', 'Escape')
        await navigate('/team/DATE/all')
        await expect(weekly)
        await display()
        for (const [name, width, dark] of [['dates-light', 1280, false], ['dates-dark', 1280, true], ['dates-narrow', 390, false]]) {
          await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
          await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
          await pause(150)
          assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Date controls overflow the page')
          const shot = await cdp('Page.captureScreenshot', { format: 'png' })
          await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, 'base64'))
        }
        await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
        await key('Escape', 'Escape')
        const input = { name: 'Weekly delivery', teamId: dateTeam.id, labelIds: [], layout: 'board', grouping: 'state', ordering: 'manual', completedFilter: 'week', dueDateFilter: 'week', showEmpty: false }
        const id = (await gql('mutation ($input: SavedViewInput!) { savedViewCreate(input: $input) { id } }', { input })).savedViewCreate.id
        await navigate(`/view/${id}`)
        await expect(weekly)
        await navigate('/views', false)
        await until(async () => await evaluate(`document.querySelector('a[href="/view/${id}"]')?.textContent.includes('4 issues')`), 'Saved-view count ignores date filters')
        await click(`a[href="/view/${id}"]`)
        await expect(weekly)
        await evaluate(`window.__tasksNow = Date.parse('2026-10-26T00:00:00Z')
          window.dispatchEvent(new Event('focus'))`)
        await expect(['Due next Monday'])
        await click('a[href="/views"]')
        await until(async () => await evaluate(`document.querySelector('a[href="/view/${id}"]')?.textContent.includes('1 issues')`), 'Week did not advance automatically in the view count')
        await gql('mutation ($id: String!) { savedViewDelete(id: $id) { success } }', { id })
      })
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
      const detail = await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Show Error')
        button?.click()
        return button ? document.body.innerText : ''
      })()`)
      if (detail) {
        await pause(100)
        console.error(await evaluate('document.body.innerText'))
      }
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
