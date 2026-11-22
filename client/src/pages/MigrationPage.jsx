import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { migrationService } from '../services/migration'

export default function MigrationPage() {
  const [activeTab, setActiveTab] = useState('batches') // 'batches', 'issues', 'excel-import'
  const [batches, setBatches] = useState([])
  const [issues, setIssues] = useState([])
  const [, setStatusOverview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [issueFilter, setIssueFilter] = useState('ALL') // 'ALL', 'ERROR', 'WARNING'

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [batchesRes, issuesRes, statusRes] = await Promise.all([
        migrationService.listBatches(),
        migrationService.listIssues(),
        migrationService.getStatus(),
      ])
      setBatches(batchesRes.data?.data || [])
      setIssues(issuesRes.data?.data || [])
      setStatusOverview(statusRes.data?.data || null)
    } catch {
      toast.error('Failed to load migration data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredIssues = issues.filter((issue) => {
    if (issueFilter === 'ALL') return true
    return issue.severity === issueFilter
  })

  const totalBatches = batches.length
  const totalSuccess = batches.reduce((acc, b) => acc + (b.successful_records || 0), 0)
  const totalFailed = batches.reduce((acc, b) => acc + (b.failed_records || 0), 0)
  const totalRecords = batches.reduce((acc, b) => acc + (b.total_records || 0), 0)

  const batchColumns = [
    {
      key: 'batch_number',
      label: 'Batch #',
      render: (val, row) => (
        <button
          onClick={() => setSelectedBatch(row)}
          className="font-mono font-semibold text-primary-600 hover:text-primary-800 text-left hover:underline"
        >
          {val}
        </button>
      ),
    },
    {
      key: 'entity_type',
      label: 'Entity Type',
      render: (val) => <span className="font-medium text-gray-800">{val}</span>,
    },
    {
      key: 'source_file',
      label: 'Source / Checksum',
      render: (val, row) => (
        <div>
          <p className="text-xs font-mono text-gray-700">{val || 'legacy_data_template.xlsx'}</p>
          {row.file_checksum && (
            <p className="text-2xs font-mono text-gray-400 truncate max-w-xs" title={row.file_checksum}>
              SHA-256: {row.file_checksum.slice(0, 16)}...
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'records',
      label: 'Records (Total / Ok / Err)',
      render: (_, row) => (
        <div className="text-xs font-mono">
          <span className="font-semibold text-gray-900">{row.total_records}</span> /{' '}
          <span className="text-success-600 font-semibold">{row.successful_records}</span> /{' '}
          <span className={row.failed_records > 0 ? 'text-danger-600 font-semibold' : 'text-gray-400'}>
            {row.failed_records}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => {
        if (val === 'COMPLETED') return <Badge variant="success">Completed</Badge>
        if (val === 'DRY_RUN') return <Badge variant="info">Dry Run</Badge>
        if (val === 'VALIDATED') return <Badge variant="info">Validated</Badge>
        if (val === 'IN_PROGRESS') return <Badge variant="warning">In Progress</Badge>
        return <Badge variant="danger">Failed</Badge>
      },
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (val) => <span className="text-xs text-gray-500">{new Date(val).toLocaleString()}</span>,
    },
    {
      key: 'actions',
      label: 'Action',
      render: (_, row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelectedBatch(row)}>
          Details
        </Button>
      ),
    },
  ]

  const issueColumns = [
    {
      key: 'severity',
      label: 'Severity',
      render: (val) => (
        <Badge variant={val === 'ERROR' ? 'danger' : 'warning'}>{val}</Badge>
      ),
    },
    {
      key: 'entity_type',
      label: 'Entity',
      render: (val) => <span className="font-semibold text-xs text-gray-700">{val}</span>,
    },
    {
      key: 'legacy_id',
      label: 'Legacy ID',
      render: (val) => <span className="font-mono text-xs text-gray-600">{val || '—'}</span>,
    },
    {
      key: 'issue_code',
      label: 'Issue Code',
      render: (val) => <span className="font-mono text-xs font-semibold text-danger-700">{val}</span>,
    },
    {
      key: 'description',
      label: 'Description',
      render: (val) => <span className="text-xs text-gray-600">{val}</span>,
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Legacy Migration Engine</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Phase 4A migration engine audit, verification batches, unresolved mappings & Phase 4B dry-run management
            </p>
          </div>
          <Button variant="secondary" onClick={fetchData} isLoading={loading}>
            Refresh Status
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Migration Batches</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalBatches}</p>
            <p className="text-xs text-gray-400 mt-0.5">Logged audit runs</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Processed Records</p>
            <p className="text-2xl font-bold text-primary-600 mt-1">{totalRecords}</p>
            <p className="text-xs text-gray-400 mt-0.5">Across all legacy tables</p>
          </div>
          <div className="bg-success-50 rounded-xl border border-success-100 p-4">
            <p className="text-xs text-success-700 font-medium uppercase tracking-wider">Successful Records</p>
            <p className="text-2xl font-bold text-success-700 mt-1">{totalSuccess}</p>
            <p className="text-xs text-success-600 mt-0.5">Validated and imported</p>
          </div>
          <div className="bg-danger-50 rounded-xl border border-danger-100 p-4">
            <p className="text-xs text-danger-700 font-medium uppercase tracking-wider">Unresolved Issues</p>
            <p className="text-2xl font-bold text-danger-700 mt-1">{issues.length}</p>
            <p className="text-xs text-danger-600 mt-0.5">{totalFailed} batch errors logged</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-200 pb-2">
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'batches' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Migration Batches ({batches.length})
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'issues' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Issues & Unresolved Mappings ({issues.length})
          </button>
          <button
            onClick={() => setActiveTab('excel-import')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'excel-import' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Excel Import (Phase 4B Readiness)
          </button>
        </div>

        {/* Tab 1: Migration Batches */}
        {activeTab === 'batches' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Table
              columns={batchColumns}
              data={batches}
              isLoading={loading}
              emptyMessage="No migration batches recorded yet. The migration engine has not executed any import batches in this environment."
            />
          </div>
        )}

        {/* Tab 2: Issues & Known Unresolved Mappings */}
        {activeTab === 'issues' && (
          <div className="space-y-6">
            {/* Known Unresolved Mappings Alert Box */}
            <div className="bg-warning-50 border border-warning-200 rounded-xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="text-base font-bold text-warning-900">
                    Known Unresolved Legacy Mappings (Phase 4A Audit Findings)
                  </h3>
                  <p className="text-xs text-warning-800 mt-1">
                    The following structural anomalies and missing definitions were flagged during the Phase 4A
                    canonical dataset verification and must be resolved before live Phase 4B historical execution:
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-white p-3.5 rounded-lg border border-warning-200 shadow-2xs">
                  <p className="text-xs font-bold text-gray-900">1. Expense Category ID 5 (&ldquo;home&rdquo;)</p>
                  <p className="text-2xs text-danger-600 font-mono mt-0.5">UNRESOLVED_CATEGORY_MAPPING</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Legacy expense records reference category &quot;home&quot; which does not exist in standard chart of
                    accounts. Requires user mapping or admin reclassification.
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-lg border border-warning-200 shadow-2xs">
                  <p className="text-xs font-bold text-gray-900">2. Orphan Sub-Records</p>
                  <p className="text-2xs text-danger-600 font-mono mt-0.5">ORPHAN_CHILD_RECORDS</p>
                  <p className="text-xs text-gray-600 mt-1">
                    4 purchase items and 5 stock adjustment items in legacy data reference parent transactions that do
                    not exist in master tables.
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-lg border border-warning-200 shadow-2xs">
                  <p className="text-xs font-bold text-gray-900">3. Legacy Status & Payment Codes</p>
                  <p className="text-2xs text-warning-600 font-mono mt-0.5">UNKNOWN_PAYMENT_STATUS</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Non-standard legacy statuses are safely transformed to PENDING or default to prevent corrupted
                    financial balances.
                  </p>
                </div>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex gap-2">
              {['ALL', 'ERROR', 'WARNING'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setIssueFilter(sev)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                    issueFilter === sev ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

            {/* Issues Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table
                columns={issueColumns}
                data={filteredIssues}
                isLoading={loading}
                emptyMessage="No issues logged in the migration engine."
              />
            </div>
          </div>
        )}

        {/* Tab 3: Future Excel Import (Safe Disabled State) */}
        {activeTab === 'excel-import' && (
          <div className="space-y-6">
            {/* Prominent Lock Banner */}
            <div className="bg-gray-900 text-white rounded-2xl p-6 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-warning-500/20 text-warning-400 text-xs font-bold uppercase tracking-wider">
                    <span>🔒</span> Phase 4B Migration Execution Locked
                  </div>
                  <h2 className="text-xl font-bold">Historical Excel Import Interface (Prepared for Future Live Run)</h2>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Under Phase 5 governance rules, live historical database migration is strictly prohibited from executing
                    in this environment. The upload dropzone below is prepared in a safe disabled state with comprehensive
                    validation schemas ready for the verified migration run.
                  </p>
                </div>
                <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl text-xs space-y-1 font-mono">
                  <p className="text-gray-400">Canonical Workbook SHA-256:</p>
                  <p className="text-primary-400 break-all select-all font-semibold">
                    b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4
                  </p>
                </div>
              </div>
            </div>

            {/* Disabled Dropzone UI */}
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-10 text-center space-y-4 cursor-not-allowed opacity-85">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-2xl text-gray-400">
                🔒
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Historical Excel Workbook Upload (.xlsx)</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Drag and drop the canonical legacy workbook here, or click to browse. Real import execution is disabled in
                  Phase 5 staging until Phase 4B release authorization.
                </p>
              </div>

              <div className="inline-flex gap-3">
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 bg-gray-200 text-gray-400 font-medium text-sm rounded-lg cursor-not-allowed"
                >
                  Choose Excel File (.xlsx)
                </button>
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 bg-gray-100 text-gray-400 font-medium text-sm rounded-lg cursor-not-allowed"
                >
                  Run Zero-Write Dry Run
                </button>
              </div>
            </div>

            {/* Migration Engine Workflow & Pipeline Guarantees */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                10-Step Migration Pipeline & Safety Architecture
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                  <p className="font-bold text-gray-900">1. SHA-256 Checksum Verification</p>
                  <p>Guarantees file integrity before parsing; prevents tampered or corrupted workbooks.</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                  <p className="font-bold text-gray-900">2. Idempotency Key Tracking</p>
                  <p>All imported rows record legacy IDs and batch IDs to prevent duplicate inserts on retry.</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                  <p className="font-bold text-gray-900">3. Global Inventory Balance Safety</p>
                  <p>Preserves Product.quantity as authoritative; legacy import flag prevents erroneous double restock.</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                  <p className="font-bold text-gray-900">4. Synthetic Data Prohibition</p>
                  <p>Synthetic fixture `legacy-dataset.json` is strictly test-only and excluded from production tables.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Batch Details Modal */}
      <Modal
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        title={`Migration Batch: ${selectedBatch?.batch_number || ''}`}
        size="md"
      >
        {selectedBatch && (
          <div className="space-y-4 text-sm">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Entity Type:</span>
                <span className="font-semibold text-gray-900">{selectedBatch.entity_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span className="font-bold">{selectedBatch.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Records:</span>
                <span className="font-mono">{selectedBatch.total_records}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Successful:</span>
                <span className="font-mono text-success-600 font-semibold">{selectedBatch.successful_records}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Failed:</span>
                <span className="font-mono text-danger-600 font-semibold">{selectedBatch.failed_records}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Checksum:</span>
                <span className="font-mono text-2xs truncate max-w-xs">{selectedBatch.file_checksum || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created At:</span>
                <span>{new Date(selectedBatch.created_at).toLocaleString()}</span>
              </div>
            </div>
            {selectedBatch.notes && (
              <div>
                <p className="text-xs text-gray-500 font-medium">Notes:</p>
                <p className="text-xs text-gray-700 mt-1 bg-gray-50 p-2 rounded border">{selectedBatch.notes}</p>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedBatch(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
