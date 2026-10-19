import type { Register } from 'claude-code'

type Tier = 'haiku' | 'sonnet' | 'opus'
type Mode = 'auto' | 'off' | Tier

const MODELS: Record<Tier, string> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

const TIERS: readonly Tier[] = ['haiku', 'sonnet', 'opus']
const MODES: readonly Mode[] = ['auto', 'off', ...TIERS]
const MODE_KEY = 'mode'

// Short follow-ups ("yes", "go on", "fix it") lean on the conversation, not
// their own words, so they keep the model the previous prompt picked.
const FOLLOW_UP_CHARS = 40

// Origins that are the person typing; notifications and peers keep the route.
const ROUTED_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

const RUBRIC = `You route prompts for a coding agent to the cheapest model that will do the job well.
Answer with exactly one word: haiku, sonnet or opus.

haiku: quick lookups, simple questions, explaining a short snippet, renaming, formatting, one-line fixes, running a known command.
sonnet: ordinary coding work: implementing a feature, writing tests, fixing a bug with a clear cause, refactoring a few files, writing docs.
opus: hard work: architecture and design decisions, debugging an unclear or intermittent failure, large multi-file changes, security review, performance work, tricky algorithms, anything ambiguous or high-stakes.

When unsure between two, pick the stronger one.`

export function parseTier(text: string): Tier | undefined {
  const word = text.trim().toLowerCase().match(/haiku|sonnet|opus/)?.[0]

  return word as Tier | undefined
}

export const register: Register = on => {
  let current: Tier | undefined

  const asMode = (stored: unknown): Mode =>
    MODES.includes(stored as Mode) ? (stored as Mode) : 'auto'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'route',
      description: 'Auto model routing: /route [auto|off|haiku|sonnet|opus]',
    })
    const mode = asMode(await $.store.get(MODE_KEY))
    $.ui.status(mode === 'auto' ? 'route: auto' : `route: ${mode}`)

    return next(e)
  })

  on('command.run', { command: 'route' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === '') {
      const mode = asMode(await $.store.get(MODE_KEY))
      const now = current ? `, last pick ${current}` : ''

      return { text: `Model routing is ${mode}${now}. Use /route auto|off|haiku|sonnet|opus.` }
    }

    if (!MODES.includes(arg as Mode)) {
      return { text: `Unknown mode "${arg}". Use /route auto|off|haiku|sonnet|opus.` }
    }

    const mode = arg as Mode
    await $.store.set(MODE_KEY, mode)
    current = TIERS.includes(mode as Tier) ? (mode as Tier) : undefined
    $.ui.status(mode === 'auto' ? 'route: auto' : `route: ${mode}`)

    return { text: `Model routing set to ${mode}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || !ROUTED_ORIGINS.has(e.origin.kind)) {
      return next(e)
    }

    const mode = asMode(await $.store.get(MODE_KEY))

    if (mode === 'off') {
      current = undefined
      $.ui.status('route: off')
      return next(e)
    }

    if (mode !== 'auto') {
      current = mode
      $.ui.status(`route: ${mode} (pinned)`)
      return next(e)
    }

    if (current !== undefined && e.text.trim().length < FOLLOW_UP_CHARS) {
      $.ui.status(`route: ${current} (follow-up)`)
      return next(e)
    }

    const reply = await $.model.complete({
      model: 'haiku',
      system: RUBRIC,
      prompt: `<prompt>\n${e.text.slice(0, 6000)}\n</prompt>`,
      maxTokens: 8,
      timeoutMs: 6000,
    })
    const picked = reply.isAnswered ? parseTier(reply.text) : undefined

    // A failed or unreadable answer leaves the session's own model in charge.
    current = picked
    $.ui.status(picked ? `route: ${picked}` : 'route: session model (router failed)')

    return next(e)
  }).catch(($, e, next) => next(e))

  // The main loop's requests go to the routed model; subagents keep theirs.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || current === undefined) {
      return yield* next(e)
    }

    return yield* next({ ...e, model: MODELS[current] })
  })
}
