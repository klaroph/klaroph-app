/**
 * Shared account wipe for Profile → Delete Account and founder Mission Control.
 *
 * Coverage matches the founder cascade (audited foreign keys):
 * - Rows keyed by user_id with no foreign key to auth.users are removed explicitly
 *   (`premium_confirmation_emails` — see `supabaseUserActionStore.deleteUnlinkedRows`).
 * - Deleting the auth user is one operation. Postgres applies ON DELETE CASCADE to every
 *   auth.users foreign key inside that statement (profiles, subscriptions, income, expenses,
 *   goals, income_allocations, budgets, financial accounts, vouchers, Klaro AI, marketing
 *   sends, support). A cascade failure rolls the statement back.
 * - `payment_events` is not user-keyed and stays as the payment ledger.
 *
 * Fail closed: unlinked rows are removed first. If that delete fails, the auth user is not
 * touched, so profile and child data stay intact. The auth delete is not attempted after a
 * failed cleanup, and it is not preceded by per-table deletes of cascaded data.
 */

export type AccountWipeStore = {
  deleteUnlinkedRows(userId: string): Promise<void>
  deleteAuthUser(userId: string): Promise<void>
}

export async function wipeUserAccount(store: AccountWipeStore, userId: string): Promise<void> {
  await store.deleteUnlinkedRows(userId)
  await store.deleteAuthUser(userId)
}
