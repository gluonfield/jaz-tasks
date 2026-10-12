import { Button } from '@jaz/ui/button'
import { MessageSquarePlus } from 'lucide-react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { host } from '@/lib/host'
import { cn } from '@/lib/utils'

// <jaz.newthread prompt:"..." /> becomes a link to its prompt's index, which
// the renderer draws as a button, so markdown inside the prompt stays literal;
// code shows the tag as written.
const newThreadTag = /(`+|~{3,})[\s\S]*?\1|<jaz\.newthread\s+prompt:"([^"]*)"\s*\/>/g
const newThreadURL = 'jaz-newthread:'

export function Markdown({ children, className }: { children: string; className?: string }) {
  const prompts: string[] = []
  const markdown = children.replace(newThreadTag, (match, _code, prompt?: string) => {
    if (prompt === undefined) {
      return match
    }
    prompts.push(prompt)
    return `[](${newThreadURL}${prompts.length - 1})`
  })
  return (
    <div className={cn('prose-issue', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith(newThreadURL) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, ...props }) => {
            const prompt = href?.startsWith(newThreadURL) ? prompts[Number(href.slice(newThreadURL.length))] : undefined
            return prompt === undefined ? <a {...props} href={href} target="_blank" rel="noreferrer" /> : <NewThread prompt={prompt} />
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

// NewThread starts a chat with its prompt in hosts that can (Jaz).
function NewThread({ prompt }: { prompt: string }) {
  const start = host.newThread
  return (
    <Button
      size="sm"
      disabled={!start}
      title={prompt}
      onClick={(e) => {
        e.stopPropagation()
        start?.(prompt).catch((error: Error) => toast(error.message))
      }}
      className="max-w-full align-middle"
    >
      <MessageSquarePlus className="size-3.5" />
      New chat
      <span className="min-w-0 truncate font-normal text-ink-3">{prompt}</span>
    </Button>
  )
}
