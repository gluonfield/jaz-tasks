import { isMac, matchesKey } from './shortcut-definitions'

export const markdownShortcuts = {
  bold: { label: 'Bold', keys: ['Mod+b'], before: '**', after: '**' },
  italic: { label: 'Italic', keys: ['Mod+i', 'Mod+Shift+.'], before: '_', after: '_' },
  strike: { label: 'Strikethrough', keys: ['Mod+Shift+s'], before: '~~', after: '~~' },
  code: { label: 'Inline code', keys: ['Mod+e'], before: '`', after: '`' },
  link: { label: 'Turn text into a link', keys: ['Mod+k'], before: '[', after: '](url)' },
  codeBlock: { label: 'Code block', keys: ['Mod+Shift+\\'], before: '```\n', after: '\n```' },
  heading1: { label: 'Heading 1', keys: ['Mod+Alt+1'], prefix: '# ' },
  heading2: { label: 'Heading 2', keys: ['Mod+Alt+2'], prefix: '## ' },
  heading3: { label: 'Heading 3', keys: ['Mod+Alt+3'], prefix: '### ' },
  bullets: { label: 'Bulleted list', keys: ['Mod+Shift+8'], prefix: '- ' },
  numbers: { label: 'Numbered list', keys: ['Mod+Shift+9'], prefix: '1. ' },
  checklist: { label: 'Checklist', keys: ['Mod+Shift+7'], prefix: '- [ ] ' },
}

export function handleMarkdownShortcut(event: KeyboardEvent) {
  const input = event.target
  if (!(input instanceof HTMLTextAreaElement) || !input.hasAttribute('data-markdown')) {
    return false
  }
  const format = Object.values(markdownShortcuts).find((format) => format.keys.some((key) => matchesKey(event, key, isMac())))
  if (!format) {
    return false
  }
  event.preventDefault()
  let start = input.selectionStart
  let end = input.selectionEnd
  let replacement: string
  if ('prefix' in format) {
    start = input.value.lastIndexOf('\n', start - 1) + 1
    const newline = input.value.indexOf('\n', end)
    end = newline < 0 ? input.value.length : newline
    const lines = input.value.slice(start, end).split('\n')
    const remove = lines.every((line) => line.startsWith(format.prefix))
    replacement = lines.map((line) => remove ? line.slice(format.prefix.length) : format.prefix + line.replace(/^(#{1,6} |- \[ \] |- |\d+\. )/, '')).join('\n')
  } else {
    const selection = input.value.slice(start, end)
    replacement = selection.startsWith(format.before) && selection.endsWith(format.after)
      ? selection.slice(format.before.length, -format.after.length)
      : format.before + selection + format.after
  }
  input.setSelectionRange(start, end)
  // Native insertion keeps React's input event and the browser's undo stack.
  document.execCommand('insertText', false, replacement)
  input.setSelectionRange(start, start + replacement.length)
  return true
}
