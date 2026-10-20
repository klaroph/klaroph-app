/** Shown once on History when Free is hiding older expenses or income. */
export const OLDER_ENTRIES_LINE = 'Entries older than 90 days are saved. Upgrade to Pro to see them.'

export const UNINSTALL_WARNING = 'Entries saved only on this phone are deleted if you uninstall the app.'

export const SIGN_OUT_WARNING = 'Signing out removes the entries on this phone and the saved sign-in.'

export const MISSING_SUPABASE_CONFIG = 'Add the publishable Supabase key in mobile/.env to sign in.'

export const ISOLATED_ACCOUNT_NOTICE = "Signed in to a different account. The previous account's entries were removed from this phone."

export const FUTURE_DATE_MESSAGE = 'Dates stop at today.'

/** Shown in the pay-period budget sheet. The amount is not a synced budget row. */
export const PERIOD_BUDGET_LINE = "This amount stays on this phone and doesn't sync."

export const DELETE_UNSYNCED_LABEL = 'Delete unsynced entries'

export function unsyncedSignOutLine(count: number): string {
  if (count === 1) return '1 entry has not synced.'
  return `${count} entries have not synced.`
}

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
