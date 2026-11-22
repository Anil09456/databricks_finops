// CalculationExplanationTab.jsx
export default function CalculationExplanationTab() {
  const sections = [
    {
      num: '1', icon: '⚡', title: 'Databricks & Compute',
      color: '#00d4ff',
      content: [
        { label: 'DBU Cost formula:', formula: 'DBU Cost = (DBU Rate) × (Nodes + 1) × (Runtime hrs) × (Runs per Month)' },
        { label: 'EC2 Cost formula:', formula: 'EC2 Cost = (On-Demand Rate) × (Nodes + 1) × (Runtime hrs) × (Runs per Month)' },
        { label: 'Note:', formula: '"Nodes + 1" accounts for the worker nodes plus one driver node.' },
      ],
      link: { label: 'Databricks Pricing Reference', url: 'https://www.databricks.com/product/pricing/product-pricing/instance-types' }
    },
    {
      num: '2', icon: '🗄️', title: 'S3 Storage',
      color: '#00ff88',
      content: [
        { label: 'Direct Storage Cost:', formula: 'Cost = (Storage Amount in GB) × (Tiered Rate)' },
        { label: 'Tiered rates:', formula: '≤50 TB → Rate/GB_50TB · ≤500 TB → Rate/GB_500TB · >500 TB → Rate/GB_over500TB' },
        { label: 'Table-Based Estimate:', formula: 'Size_bytes = Records × Columns × Avg_Column_length × bpc × cr\n(bpc=1, cr=0.5)' },
        { label: 'Convert to GB:', formula: 'Estimated GB = Size_bytes ÷ 1024³' },
        { label: 'Zone Cost:', formula: 'Cost = Estimated GB × Num Tables × $0.023 (Standard Rate)' },
        { label: 'Growth Projection:', formula: 'Yearly = Monthly × [(1+g)¹² - 1] / (g) where g = monthly_growth_pct/100' },
      ],
      link: { label: 'AWS S3 Pricing', url: 'https://aws.amazon.com/s3/pricing/' }
    },
    {
      num: '3', icon: '🏭', title: 'SQL Warehouse',
      color: '#b388ff',
      content: [
        { label: 'DBU Cost:', formula: 'DBU Cost = (DBU Rate per Hour) × (Nodes) × (Hours per Day) × (Days per Month)' },
        { label: 'EC2 Cost:', formula: 'EC2 Cost = Driver_instance_rate + (On-Demand Rate per Hour × Nodes)' },
        { label: 'Total:', formula: 'SQL Total = DBU Cost + EC2 Cost' },
      ],
      link: { label: 'Databricks SQL Warehouse Pricing', url: 'https://docs.databricks.com/aws/en/compute/sql-warehouse/' }
    },
    {
      num: '4', icon: '🛠️', title: 'Development Cost',
      color: '#ffaa00',
      content: [
        { label: 'DBX Cost:', formula: 'DBX = (Driver Rate + Worker Rate × Nodes) × Hours per Month × Num Months' },
        { label: 'EC2 Cost:', formula: 'EC2 = (Driver EC2 Rate + Worker EC2 Rate × Nodes) × Hours per Month × Num Months' },
        { label: 'Total:', formula: 'Total = DBX Cost + EC2 Cost' },
      ],
      link: { label: 'Databricks All-Purpose Compute', url: 'https://docs.databricks.com/aws/en/compute/use-compute' }
    },
  ]

  return (
    <div>
      <div className="cc-tab-header">
        <h2 className="cc-tab-title">📖 Calculation Explanation</h2>
        <p className="cc-tab-desc">
          This tool estimates costs for Databricks, AWS S3, and SQL Warehouses based on on-demand and tiered rates from the Enterprise pricing plan.
        </p>
      </div>

      {sections.map(sec => (
        <div key={sec.num} className="cc-explain-card" style={{ '--explain-color': sec.color }}>
          <div className="cc-explain-header">
            <span className="cc-explain-icon">{sec.icon}</span>
            <h3 className="cc-explain-title">{sec.num}. {sec.title}</h3>
          </div>
          <div className="cc-explain-body">
            {sec.content.map((item, i) => (
              <div key={i} className="cc-explain-row">
                <div className="cc-explain-label">{item.label}</div>
                <code className="cc-explain-formula">{item.formula}</code>
              </div>
            ))}
            <div className="cc-explain-link-row">
              <span className="cc-explain-ref-label">Reference:</span>
              <a href={sec.link.url} target="_blank" rel="noreferrer" className="cc-explain-link">
                🔗 {sec.link.label}
              </a>
            </div>
          </div>
        </div>
      ))}

      {/* Summary note */}
      <div className="cc-explain-note">
        <strong>💡 Note:</strong> All calculations are based on AWS us-east-1 (N. Virginia) Enterprise plan pricing.
        Actual costs may vary based on region, negotiated rates, reserved instances, and savings plans.
      </div>
    </div>
  )
}
