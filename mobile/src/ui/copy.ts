/** Shown once on History when Free is hiding older expenses or income. */
export const OLDER_ENTRIES_LINE = 'Entries older than 90 days are saved. Upgrade to Pro to see them.'

export const UNINSTALL_WARNING = 'Entries saved only on this phone are deleted if you uninstall the app.'

export const SIGN_OUT_WARNING = 'Signing out removes the entries on this phone and the saved sign-in.'

export const MISSING_SUPABASE_CONFIG = 'Add the publishable Supabase key in mobile/.env to sign in.'

export const ISOLATED_ACCOUNT_NOTICE = "Signed in to a different account. The previous account's entries were removed from this phone."

/** Same sentence `createGoal` throws when the device is already at the plan cap. */
export const LOCAL_GOAL_CAP_MESSAGE = 'Goal count is already at the plan max_goals.'

export const FIRST_RUN_PAGES = [
  {
    title: 'Your payday budget, on this phone',
    body: 'Log an expense in a few seconds. Klaro works offline, and an account is optional.',
    action: 'Continue',
  },
  {
    title: 'Before you start',
    points: [
      'The yellow + adds an entry. Amount, category, save.',
      'Home follows this payday period.',
      UNINSTALL_WARNING,
    ],
    action: 'Start',
  },
] as const
