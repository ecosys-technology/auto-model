import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const USAGE = {
  input_tokens: 1,
  output_tokens: 1,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

// The engine beneath the mod: a router that answers `answer`, a prompt that
// enters as typed, and a model request that records the model it names.
function engine(on: On, answer: string | null) {
  const sent: string[] = []
  const asked: string[] = []

  mock.store(on)

  on('model.complete', (_$, e) => {
    asked.push(String(e.prompt))
    return answer === null
      ? { value: { isAnswered: false as const, reason: 'api-error' as const, status: 529, error: 'overloaded' as const, usage: USAGE } }
      : { value: { isAnswered: true as const, text: answer, usage: USAGE } }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('command.run', () => ({ text: '' }))
  on('turn.step', async function* (_$, e) {
    sent.push(e.model)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })

  return { sent, asked }
}

const SESSION_MODEL = 'claude-opus-5-5'

async function prompt($: Engine, text: string) {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
}

async function step($: Engine, agentId?: string) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: SESSION_MODEL, messageCount: 1, agentId })
  for await (const _ of stream) {
    // drain
  }
}

test('routes a simple prompt to Haiku', async ($, on) => {
  const { sent } = engine(on, 'haiku')
  await prompt($, 'What does the -r flag of grep do exactly?')
  await step($)
  expect(sent).toEqual(['claude-haiku-5-5'])
})

test('a short follow-up keeps the previous pick without asking the router', async ($, on) => {
  const { sent, asked } = engine(on, 'sonnet')
  await prompt($, 'Add a --verbose flag to the CLI parser and wire it to the logger')
  await prompt($, 'yes, go ahead')
  await step($)
  expect(asked).toHaveLength(1)
  expect(sent).toEqual(['claude-sonnet-5-5'])
})

test('subagents keep their own model', async ($, on) => {
  const { sent } = engine(on, 'haiku')
  await prompt($, 'Rename the variable foo to bar in utils.ts please')
  await step($, 'agent-1')
  expect(sent).toEqual([SESSION_MODEL])
})

test('a failed router leaves the session model in charge', async ($, on) => {
  const { sent } = engine(on, null)
  await prompt($, 'Design a sharding strategy for our event store across regions')
  await step($)
  expect(sent).toEqual([SESSION_MODEL])
})

test('/route pins a model and /route off stops routing', async ($, on) => {
  const { sent, asked } = engine(on, 'haiku')
  await $.command.run({ command: 'route', args: 'opus', origin: { kind: 'composer' }, presentation: { layout: 'main', columns: 80 } } as never)
  await prompt($, 'What time zone does the server use for cron jobs here?')
  await step($)
  await $.command.run({ command: 'route', args: 'off', origin: { kind: 'composer' }, presentation: { layout: 'main', columns: 80 } } as never)
  await prompt($, 'And what about the staging environment cron jobs?')
  await step($)
  expect(asked).toHaveLength(0)
  expect(sent).toEqual(['claude-opus-5-5', SESSION_MODEL])
})
