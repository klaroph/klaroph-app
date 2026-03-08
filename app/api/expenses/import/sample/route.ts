import { NextResponse } from 'next/server'

/** GET /api/expenses/import/sample — download a sample CSV for expenses import. */
const SAMPLE_CSV = `date,amount,category,description
2025-01-15,3500,Groceries,Weekly groceries
2025-01-18,250,Transportation,Journey to work
2025-01-20,180,Dining Out,Lunch with colleagues
2025-01-22,1200,Utilities,Electric bill
2025-01-25,500,Entertainment,Movie night
`

export async function GET() {
  return new NextResponse(SAMPLE_CSV, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="klaroph-expenses-sample.csv"',
    },
  })
}
