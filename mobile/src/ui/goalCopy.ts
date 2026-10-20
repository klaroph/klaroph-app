import { GOAL_CREATION_GRACE, GOAL_GRACE_BLOCK_MESSAGE, GOAL_LIMIT_REACHED } from '../domain/planLimits'
import { LOCAL_GOAL_CAP_MESSAGE } from './copy'

export { GOAL_GRACE_BLOCK_MESSAGE, LOCAL_GOAL_CAP_MESSAGE }

export function visibleGoalBanner(input: {
  grace: boolean
  engineMessage: string | null
  capMessage: string | null
}): string | null {
  if (input.grace) return GOAL_GRACE_BLOCK_MESSAGE
  if (input.engineMessage) return input.engineMessage
  return input.capMessage
}

export function engineGoalMessage(errors: readonly { code?: string; message: string }[]): string | null {
  for (const error of errors) {
    if (error.code === GOAL_CREATION_GRACE || error.code === GOAL_LIMIT_REACHED) return error.message
    if (error.message === GOAL_GRACE_BLOCK_MESSAGE) return error.message
    if (/allows \d+ goals;/.test(error.message)) return error.message
  }
  return null
}

export function canAddGoal(banner: string | null): boolean {
  return banner == null
}
