import { Calculator } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'

/**
 * Billables Calculator — placeholder.
 * Per 19MAY2026 client video: "We're not going to do anything. It's just to have a
 * placeholder there for billable calculator. I know we haven't built that table just
 * yet. Chris asked me to hold on to it. But just have the placeholder there because
 * we're eventually going to do that."
 */
export default function AdminBillablesCalculator() {
  return (
    <div className="page">
      <PageHeader
        title="Billables Calculator"
        subtitle="Calculate client billables by account, period, and rate."
        icon={<Calculator className="w-5 h-5" />}
      />

      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon"><Calculator className="w-5 h-5" /></div>
          <p className="empty-state-title">Coming soon</p>
          <p className="empty-state-description max-w-md mx-auto">
            The Billables Calculator will compute client billable amounts per cycle, per
            account, including regular and premium billable hours. Construction is on hold
            pending final scope from operations.
          </p>
        </div>
      </div>
    </div>
  )
}
