import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Markdown } from './markdown'

// EditableMarkdown renders markdown until clicked, then edits its source;
// blur, Escape or ⌘↵ saves, and clearing the text saves null.
export function EditableMarkdown({
  value,
  placeholder,
  onSave,
  className,
}: {
  value: string | null
  placeholder: string
  onSave: (text: string | null) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value ?? '')
  const save = () => {
    setEditing(false)
    if (text !== (value ?? '')) {
      onSave(text.trim() ? text : null)
    }
  }
  if (editing) {
    return (
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        placeholder={placeholder}
        className={cn('field-sizing-content min-h-24 w-full resize-none bg-transparent text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-3', className)}
      />
    )
  }
  return (
    <div onClick={() => setEditing(true)} className={cn('min-h-8 cursor-text', className)}>
      {value ? <Markdown>{value}</Markdown> : <p className="text-[14px] text-ink-3">{placeholder}</p>}
    </div>
  )
}

// EditableLine edits one line in place; blur or Enter saves, Escape reverts.
export function EditableLine({
  value,
  placeholder,
  onSave,
  required = false,
  className,
}: {
  value: string
  placeholder: string
  onSave: (text: string) => void
  required?: boolean
  className?: string
}) {
  const [text, setText] = useState(value)
  return (
    <input
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text.trim()
        if (next === value || (required && !next)) {
          setText(value)
        } else {
          onSave(next)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setText(value)
        }
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      className={cn('w-full bg-transparent text-ink outline-none placeholder:text-ink-3', className)}
    />
  )
}
