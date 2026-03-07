/** Profile with computed completion and clarity (from API). */
export interface ProfileWithComputed {
  profile: {
    id: string
    full_name: string | null
    onboarding_completed?: boolean
    nickname: string | null
    avatar_url: string | null
    monthly_income_range: string | null
    primary_goal_category: string | null
    financial_stage: string | null
    savings_confidence: number | null
    risk_comfort: string | null
    motivation_type: string | null
    dream_statement: string | null
    streak_days: number
    clarity_level: number
    badges_json: unknown
    updated_at: string | null
  }
  profile_completion_percentage: number
  clarity_level: number
}

/** Clarity level display info (header badges). */
export const CLARITY_LEVELS: Record<
  number,
  { label: string; tagline: string }
> = {
  1: { label: 'Starter', tagline: "You're getting started." },
  2: { label: 'Organizer', tagline: "You're building structure." },
  3: { label: 'Builder', tagline: "You know where you're going." },
  4: { label: 'Strategist', tagline: "You're staying consistent." },
  5: { label: 'Clarity Master', tagline: "You're leading the way." },
}

export const INCOME_RANGES = [
  { value: '', label: 'Select range' },
  { value: 'under_20k', label: 'Under ₱20,000' },
  { value: '20k_50k', label: '₱20,000 – ₱50,000' },
  { value: '50k_100k', label: '₱50,000 – ₱100,000' },
  { value: '100k_200k', label: '₱100,000 – ₱200,000' },
  { value: 'over_200k', label: 'Over ₱200,000' },
] as const

export const RISK_COMFORT_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const

export const FINANCIAL_STAGES = [
  { value: 'starter', label: 'Starter' },
  { value: 'stabilizing', label: 'Stabilizing' },
  { value: 'building', label: 'Building' },
  { value: 'scaling', label: 'Scaling' },
] as const

export const MOTIVATION_TYPES = [
  { value: 'security', label: 'Security' },
  { value: 'freedom', label: 'Freedom' },
  { value: 'family', label: 'Family' },
  { value: 'growth', label: 'Growth' },
] as const
