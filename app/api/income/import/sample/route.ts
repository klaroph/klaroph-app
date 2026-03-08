import { NextResponse } from 'next/server'

/** GET /api/income/import/sample — download a sample CSV for income import. */
const SAMPLE_CSV = `date,amount,category,description
2026-03-08,50000,Salary,Monthly payroll
2026-02-28,15000,Bonus / 13th Month,Year-end bonus
2026-02-15,25000,Salary,Monthly payroll
2026-01-31,8000,Freelance / Online Work,Project delivery
`

export async function GET() {
  return new NextResponse(SAMPLE_CSV, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="klaroph-income-sample.csv"',
    },
  })
}
