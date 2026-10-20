import {
  GOAL_CREATION_GRACE,
  GOAL_GRACE_BLOCK_MESSAGE,
  GOAL_LIMIT_REACHED,
  goalCapMessage,
} from '../domain/planLimits'

export { GOAL_GRACE_BLOCK_MESSAGE, goalCapMessage }

/** Hides internal cap wording if a stored or server error still contains it. */
export function scrubGoalCopy(message: string, plan: { name: string } | null | undefined): string {
  if (message.toLowerCase().includes('max_goals')) return goalCapMessage(plan)
  return message
}

export function visibleGoalBanner(input: {
  grace: boolean
  engineMessage: string | null
  capMessage: string | null
  plan?: { name: string } | null
}): string | null {
  if (input.grace) return GOAL_GRACE_BLOCK_MESSAGE
  if (input.engineMessage) return scrubGoalCopy(input.engineMessage, input.plan)
  if (input.capMessage) return scrubGoalCopy(input.capMessage, input.plan)
  return null
}

export function engineGoalMessage(
  errors: readonly { code?: string; message: string }[],
  plan?: { name: string } | null,
): string | null {
  for (const error of errors) {
    if (error.code === GOAL_CREATION_GRACE || error.code === GOAL_LIMIT_REACHED) return scrubGoalCopy(error.message, plan)
    if (error.message === GOAL_GRACE_BLOCK_MESSAGE) return error.message
    if (/allows \d+ goals;/.test(error.message)) return scrubGoalCopy(error.message, plan)
  }
  return null
}

export function canAddGoal(banner: string | null): boolean {
  return banner == null
}
