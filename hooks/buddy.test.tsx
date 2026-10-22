import { expect, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

import { mapRow, maplistsCommand } from './buddy'

const BAND = {
  plugin: 'maps-lists',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 60, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const SPINNER = {
  plugin: 'maps-lists',
  component: 'Spinner',
  requestId: 'main',
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' },
} as const

const DONE = { answer: '', durationMs: 1, isAborted: false, reason: 'answer' } as const

// Each hook here stands for the engine beneath the mod.
function engine(on: Parameters<TestBody>[1]) {
  on('tool.call', () => ({ result: {} }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.message ?? e.props.word}</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
}

async function clawdShown($: Engine, surface: 'terminal' | 'desktop' = 'terminal', props = {}) {
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, ...props }, surface })
  const found = await band.find({ type: 'Text', text: /▐▛███▜▌/ })
  await band.unmount()
  return found?.text
}

test('typed /maps-lists:research: Clawd with the big map above the prompt, the step on the spinner', async ($, on) => {
  engine(on)
  await $.turn.start({ text: '/maps-lists:research bakeries in Lisbon', turnId: 't1' })
  await $.skill.prompt({ skill: 'research', pluginName: 'maps-lists', text: '…' })
  await $.tool.call({ tool: 'WebSearch', query: 'bakeries lisbon', mode: 'standard' })
  await $.tool.call({ tool: 'Bash', command: "maps-lists reddit search 'best pastel de nata' -r lisbon" })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: /▐▛███▜▌/ })).toBeTruthy()
    expect(await band.find({ type: 'Text', text: /┌────┬────┬────┐/ })).toBeTruthy()
    expect((await band.find({ type: 'Text', text: '✕' }))?.text).toBe('✕')
    await band.unmount()

    const spinner = await $.ui.mount({ ...SPINNER, surface })
    expect((await spinner.find({ type: 'Text', text: /Researching/ }))?.text).toBe('Researching places · 2 searches')
    await spinner.unmount()
  }
})

test('a narrow band gets the small Clawd with the map emoji', async ($, on) => {
  engine(on)
  await $.skill.prompt({ skill: 'maps-lists:import', text: '…' })
  expect(await clawdShown($, 'terminal', { bodyColumns: 24 })).toContain('🗺')
})

test('research agents finishing their turns keep Clawd going', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'research', turnId: 't1' })
  await $.skill.prompt({ skill: 'maps-lists:research', text: '…' })
  await $.tool.call({ tool: 'Agent', description: 'Lisbon bakeries', prompt: '…' })
  await $.turn.complete({ ...DONE, turnId: 'a1-run', agentId: 'a1' })
  expect(await clawdShown($)).toBeTruthy()
})

test('Clawd stays across turns of a flow and leaves after a turn without maps-lists', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'bakeries in Lisbon', turnId: 't1' })
  await $.skill.prompt({ skill: 'maps-lists:research', text: '…' })
  await $.turn.complete({ ...DONE, turnId: 't1' })

  // The user says continue after switching models: still researching.
  await $.turn.start({ text: 'continue', turnId: 't2' })
  expect(await clawdShown($)).toBeTruthy()
  await $.tool.call({ tool: 'Bash', command: 'maps-lists review research/lisbon-bakeries-20261023.json' })
  await $.turn.complete({ ...DONE, turnId: 't2' })

  // Something else entirely: Clawd may show this one turn, then he's gone.
  await $.turn.start({ text: 'what time is it in Tokyo?', turnId: 't3' })
  await $.turn.complete({ ...DONE, turnId: 't3' })
  await $.turn.start({ text: 'thanks', turnId: 't4' })
  expect(await clawdShown($)).toBeUndefined()
})

test('a finished save ends the flow with its turn', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'save', turnId: 't1' })
  await $.skill.prompt({ skill: 'maps-lists:run', text: '…' })
  await $.tool.call({ tool: 'Bash', command: 'maps-lists apply plan.json --cdp auto' })
  await $.tool.call({ tool: 'Bash', command: 'maps-lists report' })
  await $.turn.complete({ ...DONE, turnId: 't1' })
  await $.turn.start({ text: 'thanks', turnId: 't2' })
  expect(await clawdShown($)).toBeUndefined()
})

test('outside maps-lists the engine draws its own band and spinner', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.skill.prompt({ skill: 'commit', text: '…' })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine band')
  await band.unmount()
})

test('command parsing and the route', () => {
  expect(maplistsCommand("cd ~/x && bin/maps-lists reddit read 1r2t97n")).toEqual({ cmd: 'reddit', arg: 'read' })
  expect(maplistsCommand('maps-lists check-chrome')).toEqual({ cmd: 'check-chrome', arg: undefined })
  expect(maplistsCommand('npm run maps-lists-thing')).toBeNull()
  expect(mapRow(' │    │  45│6X  │', 5)).toEqual([' │    │  · │ ', '  │'])
  expect(mapRow(' └────┴────┴────┘', 7)).toEqual([' └────┴────┴────┘'])
})
