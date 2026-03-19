'use client'

export default function LoanCalculatorGuideCard() {
  return (
    <aside className="salary-calc-info-card" aria-label="Loan guide in the Philippines">
      <header className="salary-guide-card-header">
        <h2 className="salary-guide-card-title">Loan Guide in the Philippines</h2>
        <p className="salary-guide-card-badge" aria-hidden="true">
          Plan your borrowing with key amortization factors
        </p>
      </header>

      <div className="salary-guide-card-inner">
        <div className="salary-guide-col salary-guide-col-left">
          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Common Loan Types</h3>
            <ul className="salary-guide-list">
              <li>Personal loans</li>
              <li>Car loans</li>
              <li>Housing loans</li>
            </ul>
          </section>

          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">What Affects Monthly Amortization</h3>
            <ul className="salary-guide-list">
              <li>Loan amount</li>
              <li>Annual interest rate</li>
              <li>Loan term</li>
            </ul>
          </section>
        </div>

        <div className="salary-guide-col">
          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Common Loan Costs</h3>
            <ul className="salary-guide-list">
              <li>Principal repayment</li>
              <li>Interest charges</li>
              <li>Bank fees</li>
            </ul>
          </section>

          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Borrowing Tip</h3>
            <div className="salary-guide-note-box">
              <p>Lower monthly payments often mean longer repayment and higher total interest.</p>
            </div>
          </section>
        </div>
      </div>

      <section className="salary-guide-section salary-guide-disclaimer">
        <p className="salary-guide-disclaimer-text">
          This guide helps you interpret common loan terms. Your final monthly amortization depends on your bank&apos;s
          interest rate, fees, and loan agreement.
        </p>
      </section>
    </aside>
  )
}

