import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase, Progress } from '../types'

const phase = atom({ plugin: 'maps-lists', key: 'phase' } as const, null as Phase)
const since = atom({ plugin: 'maps-lists', key: 'since' } as const, 0)
const frame = atom({ plugin: 'maps-lists', key: 'frame' } as const, 0)
const progress = atom({ plugin: 'maps-lists', key: 'progress' } as const, null as Progress | null)
const searches = atom({ plugin: 'maps-lists', key: 'searches' } as const, 0)
const agents = atom({ plugin: 'maps-lists', key: 'agents' } as const, 0)

// Clawd, as on Claude Code's welcome screen, in two leg poses.
const LEGS = ['  ▘▘ ▝▝  ', '  ▝▘ ▘▝  ']
// Holding an unfolded map: digits are the route, drawn in step by step, X the destination.
const CLAWD = ['         ', ' ▐▛███▜▌ ', '▝▜█████▛▘']
const MAP = [
  ' ┌────┬────┬────┐',
  ' │    │  45│6X  │',
  '─┤ 012│3   │    │',
  ' └────┴────┴────┘',
]
const ROUTE = 7
const BIG_WIDTH = 9 + 17
// Where the band is narrow or short: the small Clawd with a map emoji (two cells).
const SMALL = [' ▐▛███▜▌ 🗺', '▝▜█████▛▘']
const SMALL_WIDTH = 12

const SKILL_PHASE: Record<string, Phase> = {
  'maps-lists:start': 'start',
  'maps-lists:research': 'research',
  'maps-lists:import': 'import',
  'maps-lists:run': 'save',
  'maps-lists:lists': 'lists',
}

const COMMAND = /(?:^|[\s/"'])maps-lists"?\s+([a-z-]+)(?:\s+([a-z-]+))?/

/** The maps-lists subcommand a Bash call runs (and its first argument), if it's one. */
export function maplistsCommand(command: string): { cmd: string; arg?: string } | null {
  const m = command.match(COMMAND)
  return m ? { cmd: m[1]!, arg: m[2] } : null
}

/** The phase a subcommand stands for while it runs; null keeps the skill's own. */
function commandPhase(cmd: string): Phase {
  switch (cmd) {
    case 'apply':
    case 'dry':
      return 'save'
    case 'review':
      return 'review'
    case 'resolve':
      return 'lookup'
    case 'check-chrome':
    case 'chrome':
      return 'chrome'
    default:
      return null
  }
}

// The last step of a flow: the run's report, cleanup after a verified save, the lists table.
const FINAL = new Set(['report', 'clean', 'lists'])

function caption(p: Phase, prog: Progress | null, nSearch: number, nAgent: number): string {
  switch (p) {
    case 'start':
      return 'Getting started'
    case 'research': {
      const bits = [nAgent && `${nAgent} research agent${nAgent > 1 ? 's' : ''}`, nSearch && `${nSearch} search${nSearch > 1 ? 'es' : ''}`]
      return ['Researching places', ...bits.filter(Boolean)].join(' · ')
    }
    case 'import':
      return 'Reading your places'
    case 'review':
      return 'Waiting for you on the review page'
    case 'lookup':
      return 'Looking places up on Google Maps'
    case 'chrome':
      return 'Connecting to Chrome'
    case 'lists':
      return 'Reading your lists'
    case 'save': {
      if (!prog) return 'Saving to Google Maps'
      const what = { saving: 'Saving to Maps', checking: 'Checking the list', notes: 'Writing notes', verifying: 'Checking everything arrived' }[prog.step] ?? 'Saving to Maps'
      const count = prog.step === 'verifying' || !prog.total ? '' : ` · ${Math.min(prog.done + 1, prog.total)}/${prog.total}`
      return `${what}${count}${prog.current ? ` · ${prog.current}` : ''}`
    }
    default:
      return ''
  }
}

/** One map row as text segments around the red X, the route shown up to `shown` steps. */
export function mapRow(row: string, shown: number): [string, string?] {
  const s = row.replace(/\d/g, d => (Number(d) < shown ? '·' : ' '))
  const [a, b] = s.split('X')
  return b === undefined ? [a!] : [a!, b]
}

async function setPhase($: EngineInterface, p: Phase) {
  await update($, phase, () => p)
  await update($, since, () => Date.now())
  if (p !== 'save') await update($, progress, () => null)
}

export const register: Register = on => {
  // A flow spans turns (each answer to a question, "continue" after a model switch). The phase
  // stays across them, and goes when a turn passes with no maps-lists in it or the flow finished.
  let touched = false
  let finished = false

  on('session.start', async ($, e, next) => {
    const home = await $.env.get('HOME')
    const file = `${(await $.env.get('MAPS_LISTS_HOME')) ?? `${home}/.maps-lists`}/artifacts/progress.json`
    let tick = 0
    $.clock.every(220, async () => {
      if ((await read($, phase)) === null) return
      tick += 1
      await update($, frame, f => f + 1)
      // The executor rewrites its progress file per place; a few reads a second is plenty.
      if (tick % 3 === 0 && (await read($, phase)) === 'save') {
        try {
          const p = JSON.parse(await $.fs.read(file)) as Progress
          if (p.at >= (await read($, since)) - 2000) await update($, progress, () => p)
        } catch {
          // No progress file yet, or an older executor: the caption says "Saving" without counts.
        }
      }
    })
    return next(e)
  })

  // Typed as /maps-lists:… or run by the Skill tool: both expand the skill here.
  on('skill.prompt', async ($, e, next) => {
    const name = e.skill.includes(':') ? e.skill : `${e.pluginName ?? ''}:${e.skill}`
    const p = SKILL_PHASE[name]
    if (p) {
      touched = true
      finished = false
      if (p === 'research') {
        await update($, searches, () => 0)
        await update($, agents, () => 0)
      }
      await setPhase($, p)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const current = await read($, phase)
    if (current === 'research') {
      if (e.tool === 'WebSearch' || e.tool === 'WebFetch') await update($, searches, n => n + 1)
      if (e.tool === 'Agent') await update($, agents, n => n + 1)
    }
    if (e.tool !== 'Bash') return next(e)
    const c = maplistsCommand(String((e as { command?: unknown }).command ?? ''))
    if (!c) return next(e)
    touched = true
    if (FINAL.has(c.cmd)) finished = true
    // Reddit threads count like web searches and page reads.
    if (c.cmd === 'reddit' && (c.arg === 'search' || c.arg === 'read') && current === 'research') await update($, searches, n => n + 1)
    const p = commandPhase(c.cmd)
    if (!p && current) return next(e)
    const before = current
    await setPhase($, p ?? 'start')
    try {
      return await next(e)
    } finally {
      // Back to the skill's own step (a lookup inside import, say) once the command is done.
      await setPhase($, before ?? p ?? 'start')
    }
  }).catch(($, e, next) => next(e)) // a buddy never gets in the way of a tool call

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      touched = false
      finished = false
    }
    return next(e)
  })

  // Only the main conversation's turn: research agents finish their own turns mid-research.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && (!touched || finished)) await setPhase($, null)
    return next(e)
  })

  // The spinner line names the step, with progress; the engine keeps its glyph and timer.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const p = await read($, phase)
    if (p === null) return next(e)
    const text = caption(p, await read($, progress), await read($, searches), await read($, agents))
    return next({ ...e, props: { ...e.props, message: text } })
  })

  // Clawd walks back and forth above the prompt with his map while maps-lists works.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, phase)
    if (p === null || !e.props.isWorking || e.props.hasSurvey || e.props.maxRows < 3) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const f = await read($, frame)
    const columns = Math.min(e.props.bodyColumns, 70)
    const big = e.props.maxRows >= 4 && columns >= BIG_WIDTH + 4
    const room = Math.max(0, columns - (big ? BIG_WIDTH : SMALL_WIDTH))
    const span = room * 2 || 1
    const pos = f % span
    const x = pos <= room ? pos : span - pos // there and back
    // On the review page Clawd waits rather than walks, map fully drawn.
    const waiting = p === 'review'
    const legs = waiting ? LEGS[0]! : LEGS[f % 2]!
    const pad = ' '.repeat(waiting ? 0 : x)
    if (!big) {
      return (
        <Box flexDirection="column">
          {[...SMALL, legs].map((line, i) => (
            <Text key={`l${i}`} color="claude" wrap="truncate">{pad}{line}</Text>
          ))}
        </Box>
      )
    }
    const shown = waiting ? ROUTE : f % (ROUTE + 5)
    return (
      <Box flexDirection="column">
        {[...CLAWD, legs].map((body, i) => {
          const [left, right] = mapRow(MAP[i]!, shown)
          return (
            <Box key={`l${i}`} flexDirection="row">
              <Text color="claude" wrap="truncate">{pad}{body}</Text>
              <Text color="warning" wrap="truncate">{left}</Text>
              {right !== undefined && <Text color="error" bold>✕</Text>}
              {right !== undefined && <Text color="warning" wrap="truncate">{right}</Text>}
            </Box>
          )
        })}
      </Box>
    )
  })
}
