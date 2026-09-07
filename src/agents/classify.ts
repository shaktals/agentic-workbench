/** Deterministic classifier: one label → exactly one specialist (or ignore). */

export type ClassifyLabel =
  'ignore' | 'fuel_log' | 'berth_hold' | 'weather' | 'notice' | 'lookup'

export type SpecialistId = 'catalog' | 'scribe' | 'clerk'

export type ClassifyResult =
  | { label: 'ignore'; specialist: null; reason: string }
  | { label: Exclude<ClassifyLabel, 'ignore'>; specialist: SpecialistId }

function includesAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase()
  return needles.some(n => lower.includes(n))
}

/**
 * Pure rules classifier. The graph owns routing; the model does not pick seats.
 */
export function classify(text: string): ClassifyResult {
  const t = text.trim()
  if (!t) {
    return { label: 'ignore', specialist: null, reason: 'empty' }
  }

  if (
    includesAny(t, [
      'notice',
      'advisory',
      'broadcast',
      'gale',
      'weather',
      'storm',
      'warn',
    ])
  ) {
    if (includesAny(t, ['weather', 'gale', 'storm', 'advisory'])) {
      return { label: 'weather', specialist: 'clerk' }
    }
    return { label: 'notice', specialist: 'clerk' }
  }

  if (includesAny(t, ['fuel', 'pump-out', 'pump out', 'pumpout', 'bunker'])) {
    return { label: 'fuel_log', specialist: 'scribe' }
  }

  if (
    includesAny(t, ['berth hold', 'hold berth', 'hold slip', 'reserve berth'])
  ) {
    return { label: 'berth_hold', specialist: 'scribe' }
  }

  if (
    includesAny(t, [
      'which slip',
      'which vessel',
      'look up',
      'lookup',
      'find ',
      'where is',
      'registration',
    ])
  ) {
    return { label: 'lookup', specialist: 'catalog' }
  }

  // Soft chatter / unclear → ignore (do not invent work).
  if (includesAny(t, ['thanks', 'ok', 'okay', 'lol', 'never mind', 'nm'])) {
    return { label: 'ignore', specialist: null, reason: 'chatter' }
  }

  // Default free-text that looks operational → scribe attempt; else ignore.
  if (includesAny(t, ['log', 'dock', 'slip', 'vessel', 'harbor', 'harbour'])) {
    return { label: 'fuel_log', specialist: 'scribe' }
  }

  return { label: 'ignore', specialist: null, reason: 'no_route' }
}
