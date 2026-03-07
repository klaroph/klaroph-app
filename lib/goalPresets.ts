/** Preset options for goal creation (onboarding & add goal). No DB change. */
export const GOAL_PRESETS = [
  { id: 'emergency', label: 'Emergency Fund', defaultName: 'Emergency Fund', icon: 'money' },
  { id: 'house', label: 'House', defaultName: 'House', icon: 'house' },
  { id: 'business', label: 'Business', defaultName: 'Business', icon: 'custom' },
  { id: 'travel', label: 'Travel', defaultName: 'Travel', icon: 'travel' },
  { id: 'education', label: 'Education', defaultName: 'Education', icon: 'education' },
  { id: 'custom', label: 'Custom', defaultName: '', icon: 'custom' },
] as const

export type GoalPresetIcon = (typeof GOAL_PRESETS)[number]['icon']

/** Pick icon key from goal name for display. */
export function getIconKeyForGoalName(name: string): GoalPresetIcon {
  const n = (name || '').toLowerCase()
  if (n.includes('travel') || n.includes('trip')) return 'travel'
  if (n.includes('education') || n.includes('school') || n.includes('study')) return 'education'
  if (n.includes('house') || n.includes('home') || n.includes('property')) return 'house'
  if (n.includes('business')) return 'custom'
  if (n.includes('saving') || n.includes('emergency') || n.includes('fund') || n.includes('mp2') || n.includes('retirement')) return 'money'
  return 'custom'
}
