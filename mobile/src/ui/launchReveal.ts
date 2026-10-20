/** splash_reveal.json is 84 frames at 60 fps. */
export const SPLASH_REVEAL_MS = 1400

/** Save check is 42 frames at 60 fps, drawn at 64dp (between 56 and 72). */
export const SAVE_CHECK_DP = 64

export function launchRevealPlan(reduceMotion: boolean): 'skip' | 'play' {
  return reduceMotion ? 'skip' : 'play'
}
