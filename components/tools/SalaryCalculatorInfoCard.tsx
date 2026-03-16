'use client'

/**
 * Sticky guide card for the Salary Calculator (public and dashboard).
 * Explains Philippine payroll context and official references. Presentation only.
 */

const OFFICIAL_LINKS = [
  { href: 'https://www.sss.gov.ph/sss-contribution-table/', label: 'Official SSS Contribution Table' },
  { href: 'https://www.philhealth.gov.ph/partners/employers/ContributionTable_v2.pdf', label: 'PhilHealth Premium Contribution Schedule' },
  { href: 'https://www.pagibigfund.gov.ph/', label: 'Pag-IBIG Contribution Guidelines' },
  { href: 'https://www.bir.gov.ph/WithHoldingTax', label: 'BIR Withholding Tax Table' },
] as const

export default function SalaryCalculatorInfoCard() {
  return (
    <aside className="salary-calc-info-card" aria-label="How salary is calculated in the Philippines">
      <header className="salary-guide-card-header">
        <h2 className="salary-guide-card-title">How Salary Is Calculated in the Philippines</h2>
        <p className="salary-guide-card-badge" aria-hidden="true">Based on official Philippine payroll references</p>
      </header>

      <div className="salary-guide-card-inner">
        <div className="salary-guide-col salary-guide-col-left">
          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Gross Taxable Income</h3>
            <ul className="salary-guide-list">
              <li>Basic pay, overtime, holiday pay</li>
              <li>Night differential and commissions</li>
              <li>Bonuses and taxable allowances</li>
            </ul>
            <div className="salary-guide-formula-box">
              Gross Taxable Income = Taxable earnings before deductions
            </div>
          </section>

          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Non-Taxable Income</h3>
            <ul className="salary-guide-list">
              <li>De minimis benefits</li>
              <li>Rice / uniform / laundry allowances</li>
              <li>Medical cash benefits within allowed thresholds</li>
            </ul>
            <div className="salary-guide-note-box">
              <p>Some benefits remain tax-exempt only within annual ceilings. If cumulative Year-to-Date (YTD) amounts exceed thresholds, excess becomes taxable.</p>
              <p className="salary-guide-note-example"><strong>Example:</strong> 13th month pay + bonuses are exempt only up to ₱90,000 annually.</p>
            </div>
          </section>
        </div>

        <div className="salary-guide-col salary-guide-col-right">
          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Mandatory Deductions</h3>
            <div className="salary-calc-table-wrap">
              <table className="salary-calc-table salary-calc-table-compact">
                <thead>
                  <tr>
                    <th>Deduction</th>
                    <th>Rule</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>SSS</td><td>Salary bracket</td></tr>
                  <tr><td>PhilHealth</td><td>% of salary</td></tr>
                  <tr><td>Pag-IBIG</td><td>2% ceiling</td></tr>
                  <tr><td>Tax</td><td>TRAIN table</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Official Government References</h3>
            <ul className="salary-guide-links">
              {OFFICIAL_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="salary-calc-official-link">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="salary-guide-section salary-guide-disclaimer">
        <p className="salary-guide-disclaimer-text">
          This salary calculator estimates take-home pay using current Philippine government contribution tables and withholding tax brackets. Actual payroll may vary depending on employer payroll setup, year-to-date adjustments, benefit classifications, and taxable thresholds.
        </p>
      </section>

      <footer className="salary-guide-footer">
        Maintained using publicly available Philippine government payroll references.
      </footer>
    </aside>
  )
}
