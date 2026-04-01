/**
 * Resend "From" header for transactional mail (welcome, premium, account deleted).
 * With SPF/DKIM verified for your domain in Resend, set RESEND_FROM to an address on
 * that domain so the envelope aligns with DNS. Format: "Name <local@domain.com>"
 */
const DEFAULT_FROM = 'KlaroPH <hello@klaroph.com>'

export function getResendFrom(): string {
  const v = process.env.RESEND_FROM?.trim()
  return v && v.length > 0 ? v : DEFAULT_FROM
}
