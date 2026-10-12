// host is what an embedding MCP host provides: the display settings its
// connection sends as Tasks-Mode, Tasks-View and Tasks-Columns headers, and
// newThread where the host can start a chat (Jaz's jaz/threads).
export const host: {
  minimal?: boolean
  view?: 'list' | 'board'
  columns?: string[]
  newThread?: (prompt: string) => Promise<unknown>
} = {}
