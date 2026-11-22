import { useState, useEffect, useCallback, useId } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { migrationService } from '../services/migration'

export default function MigrationPage() {
  const [activeTab, setActiveTab] = useState('universal') // 'universal', 'templates', 'batches', 'issues', 'excel-import'
  const [loading, setLoading] = useState(false)
  const [approvedTables, setApprovedTables] = useState([])
  const [historicalJobs, setHistoricalJobs] = useState([])

  // Legacy state preserved for backwards compatibility and tests
  const [batches, setBatches] = useState([])
  const [issues, setIssues] = useState([])

  // Universal Importer State
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileSizeStr, setFileSizeStr] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [inspectedFile, setInspectedFile] = useState(null)
  const [targetTable, setTargetTable] = useState('')
  const [importMode, setImportMode] = useState('INSERT') // 'INSERT', 'UPDATE', 'UPSERT'
  const [matchingKey, setMatchingKey] = useState('id')
  const [isValidating, setIsValidating] = useState(false)
  const [validationReport, setValidationReport] = useState(null)
  const [previewPage, setPreviewPage] = useState(1)

  // Confirmation & Job Execution State
  const [showConfirmModal, setShowConfirmModal] = useState(null)
  const [activeJob, setActiveJob] = useState(null)
  const [jobPollInterval, setJobPollInterval] = useState(null)

  // Template Downloader State
  const [templateTable, setTemplateTable] = useState('')
  const [templateVariant, setTemplateVariant] = useState('full')
  const [schemaGuide, setSchemaGuide] = useState(null)

  // Form IDs for accessibility
  const tableSelectId = useId()
  const matchingKeySelectId = useId()
  const templateTableSelectId = useId()
  const templateVariantSelectId = useId()

  // Load initial tables and historical batches
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [tablesRes, batchesRes, issuesRes, jobsRes] = await Promise.all([
        migrationService.listApprovedTables().catch(() => ({ data: { data: { approvedTables: [] } } })),
        migrationService.listBatches().catch(() => ({ data: { data: [] } })),
        migrationService.listIssues().catch(() => ({ data: { data: [] } })),
        migrationService.listUniversalJobs().catch(() => ({ data: { data: [] } })),
      ])

      const appTables = tablesRes.data?.data?.approvedTables || []
      setApprovedTables(appTables)
      if (appTables.length > 0 && !templateTable) {
        setTemplateTable(appTables[0].tableName)
      }

      setBatches(batchesRes.data?.data || [])
      setIssues(issuesRes.data?.data || [])
      setHistoricalJobs(jobsRes.data?.data || [])
    } catch {
      toast.error('Failed to initialize migration data')
    } finally {
      setLoading(false)
    }
  }, [templateTable])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Load schema guide when template table changes
  useEffect(() => {
    if (!templateTable) return
    migrationService
      .getTableSchema(templateTable)
      .then((res) => setSchemaGuide(res.data?.data))
      .catch(() => setSchemaGuide(null))
  }, [templateTable])

  // Handle Drag & Drop / File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    processSelectedFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    processSelectedFile(file)
  }

  const processSelectedFile = async (file) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Only .xlsx Excel files are supported.')
      return
    }

    setSelectedFile(file)
    setFileSizeStr((file.size / 1024).toFixed(1) + ' KB')
    setInspectedFile(null)
    setValidationReport(null)
    setActiveJob(null)

    // Automatically inspect workbook
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await migrationService.inspectUniversalFile(formData)
      const data = res.data?.data
      setInspectedFile(data)

      const detected = data.detection?.detectedTable
      if (detected) {
        setTargetTable(detected)
        setMatchingKey(data.detection?.defaultMatchingKey || 'id')
        toast.success(`Detected table: ${detected}`)

        // Automatically trigger validation
        triggerValidation(detected, data.headers, data.rawRows, importMode, data.detection?.defaultMatchingKey || 'id')
      } else {
        toast.error('Could not automatically determine table. Please select target table manually.')
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to inspect Excel file')
    } finally {
      setIsUploading(false)
    }
  }

  const triggerValidation = async (table, headers, rawRows, mode, matchKey) => {
    if (!table || !rawRows || rawRows.length === 0) return
    setIsValidating(true)
    try {
      const res = await migrationService.validateUniversalPlan({
        tableName: table,
        headers,
        rawRows,
        mode,
        matchingKey: matchKey,
      })
      setValidationReport(res.data?.data)
      setPreviewPage(1)
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Validation failed')
    } finally {
      setIsValidating(false)
    }
  }

  const handleTableChange = (newTable) => {
    setTargetTable(newTable)
    const found = approvedTables.find((t) => t.tableName === newTable)
    const newMatchingKey = found?.defaultMatchingKey || 'id'
    setMatchingKey(newMatchingKey)
    if (inspectedFile) {
      triggerValidation(newTable, inspectedFile.headers, inspectedFile.rawRows, importMode, newMatchingKey)
    }
  }

  const handleModeChange = (newMode) => {
    setImportMode(newMode)
    if (inspectedFile && targetTable) {
      triggerValidation(targetTable, inspectedFile.headers, inspectedFile.rawRows, newMode, matchingKey)
    }
  }

  const handleMatchingKeyChange = (newKey) => {
    setMatchingKey(newKey)
    if (inspectedFile && targetTable) {
      triggerValidation(targetTable, inspectedFile.headers, inspectedFile.rawRows, importMode, newKey)
    }
  }

  const handleClearFile = () => {
    setSelectedFile(null)
    setInspectedFile(null)
    setValidationReport(null)
    setTargetTable('')
    setActiveJob(null)
  }

  // Confirm Import Flow
  const handleOpenConfirm = () => {
    if (!validationReport) return
    setShowConfirmModal(true)
  }

  const handleExecuteImport = async () => {
    setShowConfirmModal(false)
    if (!inspectedFile || !validationReport) return

    try {
      // Step 1: Create Job
      const createRes = await migrationService.createJob({
        tableName: targetTable,
        mode: importMode,
        matchingKey,
        headers: inspectedFile.headers,
        rawRows: inspectedFile.rawRows,
        filename: inspectedFile.filename,
        fileHash: inspectedFile.fileHash,
      })

      const jobData = createRes.data?.data
      const jobId = jobData.jobId

      // Step 2: Confirm & Execute Job
      const confirmRes = await migrationService.confirmJob(jobId)
      setActiveJob(confirmRes.data?.data)
      toast.success('Import job started. Processing batches...')

      // Step 3: Start polling progress
      const interval = setInterval(async () => {
        try {
          const pollRes = await migrationService.getJobStatus(jobId)
          const current = pollRes.data?.data
          setActiveJob(current)

          if (current.status === 'COMPLETED' || current.status === 'FAILED' || current.status === 'CANCELLED') {
            clearInterval(interval)
            setJobPollInterval(null)
            fetchData() // Refresh history
            if (current.status === 'COMPLETED') {
              toast.success(`Import completed! ${current.progress?.inserted || 0} inserted, ${current.progress?.updated || 0} updated.`)
            } else if (current.status === 'CANCELLED') {
              toast('Import was cancelled by user.')
            } else {
              toast.error('Import encountered errors.')
            }
          }
        } catch {
          clearInterval(interval)
        }
      }, 1000)

      setJobPollInterval(interval)
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to start import job')
    }
  }

  const handleCancelActiveJob = async () => {
    if (!activeJob) return
    try {
      await migrationService.cancelJob(activeJob.jobId)
      toast('Cancellation requested. Halting at next batch...')
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to cancel job')
    }
  }

  const handleDownloadTemplate = async () => {
    if (!templateTable) return
    try {
      const res = await migrationService.downloadTemplate(templateTable, templateVariant)
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${templateTable}_template_${templateVariant}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success(`Downloaded ${templateTable} (${templateVariant}) template`)
    } catch {
      toast.error('Failed to download template')
    }
  }

  const handleDownloadErrors = async (jobId) => {
    try {
      const res = await migrationService.getJobErrors(jobId, 'csv')
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `import_errors_${jobId}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Downloaded error report CSV')
    } catch {
      toast.error('Failed to download error report')
    }
  }

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (jobPollInterval) clearInterval(jobPollInterval)
    }
  }, [jobPollInterval])

  // Batch & Issue Management Handlers
  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm('Are you sure you want to delete this migration batch and its associated audit logs?')) return
    try {
      await migrationService.deleteBatch(batchId)
      toast.success('Migration batch deleted successfully')
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete batch')
    }
  }

  const handleClearAllBatches = async () => {
    if (!window.confirm('Are you sure you want to clear ALL migration batches and audit logs? This action cannot be undone.')) return
    try {
      await migrationService.clearAllBatches()
      toast.success('All migration batches and logs cleared')
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to clear batches')
    }
  }

  const handleDeleteIssue = async (issueId) => {
    try {
      await migrationService.deleteIssue(issueId)
      toast.success('Migration issue dismissed')
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete issue')
    }
  }

  const handleClearAllIssues = async () => {
    if (!window.confirm('Are you sure you want to clear ALL migration issues?')) return
    try {
      await migrationService.clearAllIssues()
      toast.success('All migration issues cleared')
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to clear issues')
    }
  }



  // Pagination for Preview Records
  const previewRows = validationReport?.previewRecords || []
  const pageSize = 15
  const totalPreviewPages = Math.ceil(previewRows.length / pageSize) || 1
  const displayedPreviewRows = previewRows.slice((previewPage - 1) * pageSize, previewPage * pageSize)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Main Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Legacy Migration Engine</span>
            <h1 className="text-2xl font-bold text-gray-900">Database Migration</h1>
            <p className="text-sm text-gray-500 mt-1">
              Import or update database records using Excel files that match your database structure.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <span>●</span> Schema-Aware Importer Active
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 gap-2 pb-px overflow-x-auto">
          <button
            onClick={() => setActiveTab('universal')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
              activeTab === 'universal'
                ? 'border-primary-600 text-primary-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Universal Excel Import
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
              activeTab === 'templates'
                ? 'border-primary-600 text-primary-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Download Templates &amp; Schema
          </button>
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
              activeTab === 'batches'
                ? 'border-primary-600 text-primary-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Migration Batches ({batches.length})
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
              activeTab === 'issues'
                ? 'border-primary-600 text-primary-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Issues &amp; Unresolved Mappings ({issues.length})
          </button>

        </div>

        {/* ========================================================================= */}
        {/* TAB 1: Universal Excel Import System */}
        {/* ========================================================================= */}
        {activeTab === 'universal' && (
          <div className="space-y-6">
            {/* Section A — Upload Excel */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Section A — Upload Excel File</h3>
                  <p className="text-xs text-gray-500">
                    Upload a single-table Excel workbook (.xlsx). Exact database column names must be in row 1.
                  </p>
                </div>
                {selectedFile && (
                  <Button variant="secondary" size="sm" onClick={handleClearFile}>
                    Clear File
                  </Button>
                )}
              </div>

              {/* Universal ID Support Info Banner */}
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs flex items-center gap-2.5 text-blue-900">
                <span className="text-base flex-shrink-0">💡</span>
                <div>
                  <span className="font-bold">Flexible Primary Key &amp; Reference Support:</span> The <code>id</code> column and foreign key references accept both <strong>UUID v4</strong> (e.g. <code>550e8400-e29b-41d4-a716-446655440000</code>) and <strong>Integer IDs</strong> (e.g. <code>1</code>, <code>2</code>, <code>1001</code>). If omitted or blank in Excel, an authentic UUID v4 is automatically generated.
                </div>
              </div>

              {!selectedFile ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-gray-300 hover:border-primary-500 rounded-xl p-8 text-center bg-gray-50 hover:bg-white transition cursor-pointer"
                  onClick={() => document.getElementById('excel-file-input')?.click()}
                >
                  <input
                    id="excel-file-input"
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="space-y-2">
                    <div className="mx-auto w-12 h-12 text-gray-400">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-12 h-12">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-700">
                      Drag and drop your Excel workbook here, or <span className="text-primary-600 underline">browse</span>
                    </p>
                    <p className="text-xs text-gray-400">Supports .xlsx up to 30MB</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-primary-50/50 border border-primary-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📊</span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">{fileSizeStr}</p>
                    </div>
                  </div>
                  {isUploading && (
                    <div className="flex items-center gap-2 text-xs text-primary-600 font-medium">
                      <span className="animate-spin">🔄</span> Inspecting workbook...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section B — Automatic Table Detection */}
            {inspectedFile && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Section B — Automatic Table Detection</h3>
                    <p className="text-xs text-gray-500">
                      Inspected worksheet: &quot;{inspectedFile.sheetName}&quot; | Total Rows: {inspectedFile.totalRows} | Total Columns: {inspectedFile.headers?.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        inspectedFile.detection?.confidence === 'HIGH'
                          ? 'success'
                          : inspectedFile.detection?.confidence === 'AMBIGUOUS'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {inspectedFile.detection?.confidence} CONFIDENCE
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <label htmlFor={tableSelectId} className="text-xs text-gray-500 block mb-1">Target Database Table</label>
                    <select
                      id={tableSelectId}
                      value={targetTable}
                      onChange={(e) => handleTableChange(e.target.value)}
                      className="w-full text-sm font-semibold bg-white border border-gray-300 rounded-md px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500"
                    >
                      {approvedTables.map((t) => (
                        <option key={t.tableName} value={t.tableName}>
                          {t.tableName} ({t.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-500">Matching Columns</p>
                    <p className="text-base font-bold text-success-700">
                      {inspectedFile.detection?.matchingColumns?.length || 0} / {inspectedFile.headers?.length || 0}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-500">Unknown / Missing Required</p>
                    <p className="text-base font-bold text-gray-700">
                      <span className={inspectedFile.detection?.unknownColumns?.length > 0 ? 'text-danger-600' : 'text-gray-500'}>
                        {inspectedFile.detection?.unknownColumns?.length || 0} Unknown
                      </span>
                      {' / '}
                      <span className={inspectedFile.detection?.missingRequiredColumns?.length > 0 ? 'text-amber-600' : 'text-gray-500'}>
                        {inspectedFile.detection?.missingRequiredColumns?.length || 0} Missing
                      </span>
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-500">Primary Key Support</p>
                    <p className="text-sm font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                      <span>✓</span> UUID or Integer ID
                    </p>
                    <p className="text-3xs text-gray-400 mt-0.5">Auto-generated if blank</p>
                  </div>
                </div>

                {/* Explanation or warnings */}
                {inspectedFile.detection?.unknownColumns?.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                    <span className="font-bold">Unknown Columns Detected:</span> [
                    {inspectedFile.detection.unknownColumns.join(', ')}]. Excel headers must match physical database column names exactly.
                  </div>
                )}
                {inspectedFile.detection?.missingRequiredColumns?.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <span className="font-bold">Missing Required Columns:</span> [
                    {inspectedFile.detection.missingRequiredColumns.map((c) => c.columnName).join(', ')}].
                  </div>
                )}
                {targetTable === 'Product' && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center gap-2">
                    <span>🛡️</span>
                    <span>
                      <strong>Protected Column Invariant:</strong> Product stock quantities (<code>quantity</code>) cannot be modified via generic spreadsheet imports to prevent inventory drift. Use standard Stock Adjustments.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Section C — Import Mode */}
            {inspectedFile && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Section C — Import Mode &amp; Matching Key</h3>
                    <p className="text-xs text-gray-500">
                      Configure conflict resolution and unique constraint matching behavior.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Matching Column:</span>
                    <label htmlFor={matchingKeySelectId} className="sr-only">Matching Column</label>
                    <select
                      id={matchingKeySelectId}
                      value={matchingKey}
                      onChange={(e) => handleMatchingKeyChange(e.target.value)}
                      className="text-xs font-mono font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                    >
                      {approvedTables.find((t) => t.tableName === targetTable)?.allowedMatchingKeys?.map((k) => (
                        <option key={k} value={k}>
                          {k} {k === 'id' ? '(Primary Key)' : '(Unique Key)'}
                        </option>
                      )) || <option value="id">id (Primary Key)</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div
                    onClick={() => handleModeChange('INSERT')}
                    className={`p-4 rounded-xl border-2 transition cursor-pointer ${
                      importMode === 'INSERT'
                        ? 'border-primary-600 bg-primary-50/30'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">Insert Only (Default)</span>
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'INSERT'}
                        onChange={() => handleModeChange('INSERT')}
                        className="text-primary-600"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Inserts new records only. Conflicting existing primary keys or unique identifiers are quarantined without overwriting.
                    </p>
                  </div>

                  <div
                    onClick={() => handleModeChange('UPDATE')}
                    className={`p-4 rounded-xl border-2 transition cursor-pointer ${
                      importMode === 'UPDATE'
                        ? 'border-primary-600 bg-primary-50/30'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">Update Existing</span>
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'UPDATE'}
                        onChange={() => handleModeChange('UPDATE')}
                        className="text-primary-600"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Updates matching existing records. Requires matching key. Never mutates primary keys or overwrites omitted columns.
                    </p>
                  </div>

                  <div
                    onClick={() => handleModeChange('UPSERT')}
                    className={`p-4 rounded-xl border-2 transition cursor-pointer ${
                      importMode === 'UPSERT'
                        ? 'border-primary-600 bg-primary-50/30'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">Upsert</span>
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'UPSERT'}
                        onChange={() => handleModeChange('UPSERT')}
                        className="text-primary-600"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Inserts missing records and updates existing records matched by primary key or approved unique constraint.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Section E — Validation Summary */}
            {validationReport && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Section E — Validation Summary</h3>
                    <p className="text-xs text-gray-500">
                      Pre-import database constraint verification and integrity checks.
                    </p>
                  </div>
                  <Badge variant={validationReport.isValidPlan ? 'success' : 'danger'}>
                    {validationReport.isValidPlan ? 'PLAN APPROVED' : 'ISSUES DETECTED'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs font-mono">
                  <div className="p-3 bg-gray-50 rounded-lg text-center border border-gray-200">
                    <p className="text-gray-400">Total Rows</p>
                    <p className="text-base font-bold text-gray-900">{validationReport.summary?.totalRows}</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg text-center border border-emerald-200">
                    <p className="text-emerald-700">Valid Rows</p>
                    <p className="text-base font-bold text-emerald-800">{validationReport.summary?.validRows}</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-200">
                    <p className="text-blue-700">Expected Inserts</p>
                    <p className="text-base font-bold text-blue-800">{validationReport.summary?.expectedInserts}</p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-lg text-center border border-indigo-200">
                    <p className="text-indigo-700">Expected Updates</p>
                    <p className="text-base font-bold text-indigo-800">{validationReport.summary?.expectedUpdates}</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg text-center border border-amber-200">
                    <p className="text-amber-700">Conflicts / Dups</p>
                    <p className="text-base font-bold text-amber-800">
                      {(validationReport.summary?.uniqueConflicts || 0) + (validationReport.summary?.duplicateRows || 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center border border-red-200">
                    <p className="text-red-700">Invalid / FK Err</p>
                    <p className="text-base font-bold text-red-800">
                      {(validationReport.summary?.invalidRows || 0) + (validationReport.summary?.fkErrors || 0)}
                    </p>
                  </div>
                </div>

                {/* Row Issues Listing */}
                {validationReport.rowIssues?.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold text-gray-700">
                      Row-Level Validation Messages ({validationReport.totalIssueCount}):
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono">
                      {validationReport.rowIssues.map((iss, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-2xs p-1.5 bg-white rounded border border-gray-100">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              iss.severity === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            Row {iss.row}
                          </span>
                          <span className="font-semibold text-gray-700">{iss.column}:</span>
                          <span className="text-gray-600 flex-1">{iss.message}</span>
                          <span className="text-gray-400 italic">{iss.recommendation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Section D — Data Preview */}
            {validationReport && previewRows.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Section D — Data Preview</h3>
                    <p className="text-xs text-gray-500">
                      Showing records 1–{previewRows.length} of {validationReport.summary?.totalRows} parsed rows.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      disabled={previewPage === 1}
                    >
                      Prev
                    </Button>
                    <span className="font-mono">
                      {previewPage} / {totalPreviewPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                      disabled={previewPage >= totalPreviewPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-xs font-mono">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500">#</th>
                        <th className="px-3 py-2 text-left text-gray-500">Status</th>
                        {validationReport.matchingColumns?.slice(0, 7).map((c) => (
                          <th key={c.columnName} className="px-3 py-2 text-left text-gray-700">
                            {c.columnName}
                            <span className="block text-3xs text-gray-400 font-normal">{c.type}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {displayedPreviewRows.map((r) => (
                        <tr key={r.rowIdx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{r.rowIdx}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                                r.status === 'INSERT_CANDIDATE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.status === 'UPDATE_CANDIDATE'
                                  ? 'bg-blue-100 text-blue-800'
                                  : r.status === 'CONFLICT'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          {validationReport.matchingColumns?.slice(0, 7).map((c) => (
                            <td key={c.columnName} className="px-3 py-2 truncate max-w-xs" title={String(r.data[c.columnName] ?? '')}>
                              {r.data[c.columnName] !== null && r.data[c.columnName] !== undefined
                                ? String(r.data[c.columnName])
                                : <span className="text-gray-300 italic">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section F — Import Confirmation & Action Bar */}
            {validationReport && (
              <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-2xs">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Section F — Import Confirmation</h4>
                  <p className="text-xs text-gray-500">
                    Ready to execute {importMode} for table &quot;{targetTable}&quot;.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    onClick={handleOpenConfirm}
                    disabled={validationReport.summary?.validRows === 0 || isValidating}
                  >
                    Confirm &amp; Execute Import
                  </Button>
                </div>
              </div>
            )}

            {/* Section G — Import Progress */}
            {activeJob && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {activeJob.status === 'RUNNING' ? '🔄' : activeJob.status === 'COMPLETED' ? '✅' : '⚠️'}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Section G — Import Job Progress</h3>
                      <p className="text-xs text-gray-500">Job ID: {activeJob.jobId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        activeJob.status === 'COMPLETED'
                          ? 'success'
                          : activeJob.status === 'RUNNING'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {activeJob.status}
                    </Badge>
                    {activeJob.status === 'RUNNING' && (
                      <Button variant="danger" size="sm" onClick={handleCancelActiveJob}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span>Progress: {activeJob.progress?.percentage || 0}%</span>
                    <span>
                      {activeJob.progress?.processed || 0} / {activeJob.progress?.totalRows || 0} records
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-primary-600 h-full transition-all duration-300"
                      style={{ width: `${activeJob.progress?.percentage || 0}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono text-center">
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <p className="text-gray-400">Inserted</p>
                    <p className="font-bold text-emerald-700">{activeJob.progress?.inserted || 0}</p>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <p className="text-gray-400">Updated</p>
                    <p className="font-bold text-blue-700">{activeJob.progress?.updated || 0}</p>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <p className="text-gray-400">Failed</p>
                    <p className="font-bold text-red-700">{activeJob.progress?.failed || 0}</p>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <p className="text-gray-400">Elapsed Time</p>
                    <p className="font-bold text-gray-800">
                      {((activeJob.progress?.elapsedMs || 0) / 1000).toFixed(1)}s
                    </p>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <p className="text-gray-400">Throughput</p>
                    <p className="font-bold text-gray-800">
                      {activeJob.progress?.throughputRowsPerSec || 0} rows/s
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Section H — Import History */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Section H — Import History &amp; Audit</h3>
                  <p className="text-xs text-gray-500">
                    Recent single-table migration jobs and execution diagnostics.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-xs font-mono">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">Batch #</th>
                      <th className="px-3 py-2 text-left text-gray-500">Target Table</th>
                      <th className="px-3 py-2 text-left text-gray-500">Mode</th>
                      <th className="px-3 py-2 text-left text-gray-500">Records (Ins/Upd/Fail)</th>
                      <th className="px-3 py-2 text-left text-gray-500">Status</th>
                      <th className="px-3 py-2 text-left text-gray-500">Date</th>
                      <th className="px-3 py-2 text-right text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {historicalJobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                          No historical import jobs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      historicalJobs.map((j) => (
                        <tr key={j.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-bold text-primary-600">{j.batchNumber}</td>
                          <td className="px-3 py-2 font-semibold text-gray-900">{j.tableName}</td>
                          <td className="px-3 py-2 text-gray-600">{j.mode}</td>
                          <td className="px-3 py-2">
                            <span className="text-emerald-700 font-bold">{j.inserted}</span> /{' '}
                            <span className="text-blue-700 font-bold">{j.updated}</span> /{' '}
                            <span className={j.failed > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>
                              {j.failed}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-3xs font-bold ${
                                j.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : j.status === 'RUNNING'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {j.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {new Date(j.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {j.failed > 0 && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleDownloadErrors(j.id)}
                                >
                                  Errors (CSV)
                                </Button>
                              )}
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteBatch(j.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: Download Templates & Schema Guidance */}
        {/* ========================================================================= */}
        {activeTab === 'templates' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Download Excel Template</h3>
                <p className="text-xs text-gray-500">
                  Select an approved database table to generate an Excel template workbook (.xlsx) with exact physical column names.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label htmlFor={templateTableSelectId} className="text-xs text-gray-500 block mb-1">Target Table</label>
                  <select
                    id={templateTableSelectId}
                    value={templateTable}
                    onChange={(e) => setTemplateTable(e.target.value)}
                    className="w-full text-sm font-semibold bg-white border border-gray-300 rounded-md px-3 py-2"
                  >
                    {approvedTables.map((t) => (
                      <option key={t.tableName} value={t.tableName}>
                        {t.tableName} ({t.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={templateVariantSelectId} className="text-xs text-gray-500 block mb-1">Template Variant</label>
                  <select
                    id={templateVariantSelectId}
                    value={templateVariant}
                    onChange={(e) => setTemplateVariant(e.target.value)}
                    className="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="full">Full Template (All Supported Columns)</option>
                    <option value="minimal">Minimal Template (Required Writable Columns)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <Button variant="primary" onClick={handleDownloadTemplate} className="w-full">
                    📥 Download .xlsx Template
                  </Button>
                </div>
              </div>
            </div>

            {/* Schema Guide Table */}
            {schemaGuide && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      Physical Schema Specification: &quot;{schemaGuide.tableName}&quot;
                    </h3>
                    <p className="text-xs text-gray-500">{schemaGuide.description}</p>
                  </div>
                  <Badge variant="primary">{schemaGuide.columns?.length || 0} Physical Columns</Badge>
                </div>

                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-xs font-mono">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500">Column Name</th>
                        <th className="px-3 py-2 text-left text-gray-500">Data Type</th>
                        <th className="px-3 py-2 text-left text-gray-500">Classification</th>
                        <th className="px-3 py-2 text-left text-gray-500">Nullability</th>
                        <th className="px-3 py-2 text-left text-gray-500">Import Guidance</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {schemaGuide.columns?.map((c) => (
                        <tr key={c.columnName} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-bold text-gray-900">{c.columnName}</td>
                          <td className="px-3 py-2 text-primary-700">{c.type}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-3xs font-bold ${
                                c.classification === 'PRIMARY_KEY'
                                  ? 'bg-purple-100 text-purple-800'
                                  : c.classification === 'REQUIRED'
                                  ? 'bg-red-100 text-red-800'
                                  : c.classification === 'DEFAULTED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {c.classification}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500">{c.nullable ? 'Nullable' : 'NOT NULL'}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-md">{c.guidance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: Historical Migration Batches (Preserved for tests & diagnostics) */}
        {/* ========================================================================= */}
        {activeTab === 'batches' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Migration Batches</h3>
                <p className="text-xs text-gray-500">
                  Comprehensive audit trail of all historical and universal database migration runs.
                </p>
              </div>
              {batches.length > 0 && (
                <Button variant="danger" size="sm" onClick={handleClearAllBatches}>
                  Clear All Batches
                </Button>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
              <Table
                columns={[
                  {
                    key: 'batch_number',
                    label: 'Batch #',
                    render: (val, row) => (
                      <button
                        onClick={() => toast(`Batch #${row.batch_number} (${row.entity_type}) selected`)}
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
                        <p className="text-xs font-mono text-gray-700">{val || 'Historical Export'}</p>
                        {row.source_sha256 && (
                          <p className="text-2xs font-mono text-gray-400 truncate max-w-xs">
                            SHA-256: {row.source_sha256.slice(0, 16)}...
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
                        <span className="font-semibold text-gray-900">{row.record_count}</span> /{' '}
                        <span className="text-success-600 font-semibold">{row.success_count}</span> /{' '}
                        <span className={row.error_count > 0 ? 'text-danger-600 font-semibold' : 'text-gray-400'}>
                          {row.error_count}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (val) => {
                      if (val === 'COMPLETED') return <Badge variant="success">Completed</Badge>
                      if (val === 'ROLLED_BACK') return <Badge variant="danger">Rolled Back</Badge>
                      if (val === 'RUNNING') return <Badge variant="warning">Running</Badge>
                      return <Badge variant="secondary">{val}</Badge>
                    },
                  },
                  {
                    key: 'created_at',
                    label: 'Date',
                    render: (val) => <span className="text-xs text-gray-500">{new Date(val).toLocaleDateString()}</span>,
                  },
                  {
                    key: 'actions',
                    label: 'Actions',
                    render: (_, row) => (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteBatch(row.id)}
                      >
                        Delete
                      </Button>
                    ),
                  },
                ]}
                data={batches}
                isLoading={loading}
                emptyMessage="No migration batches recorded yet."
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: Issues & Unresolved Mappings (Preserved for tests & diagnostics) */}
        {/* ========================================================================= */}
        {activeTab === 'issues' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Issues &amp; Unresolved Mappings</h3>
                <p className="text-xs text-gray-500">
                  Logged validation errors, reference discrepancies, and quarantined records.
                </p>
              </div>
              {issues.length > 0 && (
                <Button variant="danger" size="sm" onClick={handleClearAllIssues}>
                  Clear All Issues
                </Button>
              )}
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-300 rounded-xl space-y-2">
              <h3 className="font-bold text-amber-900 text-sm">Known Unresolved Legacy Mappings</h3>
              <p className="text-xs text-amber-800">
                Expense Category ID 5 and Orphan Sub-Records remain quarantined per audit protocol DEC-004.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
              <Table
                columns={[
                  {
                    key: 'issue_code',
                    label: 'Code',
                    render: (val) => <span className="font-mono text-xs font-bold text-gray-800">{val}</span>,
                  },
                  {
                    key: 'severity',
                    label: 'Severity',
                    render: (val) => (
                      <Badge variant={val === 'BLOCKING' || val === 'ERROR' ? 'danger' : 'warning'}>{val}</Badge>
                    ),
                  },
                  {
                    key: 'entity_type',
                    label: 'Entity / Legacy ID',
                    render: (_, row) => (
                      <div className="font-mono text-xs">
                        <span className="font-semibold text-gray-700">{row.entity_type}</span>: {row.legacy_id || 'N/A'}
                      </div>
                    ),
                  },
                  {
                    key: 'description',
                    label: 'Description',
                    render: (val) => <p className="text-xs text-gray-700 max-w-md">{val}</p>,
                  },
                  {
                    key: 'actions',
                    label: 'Actions',
                    render: (_, row) => (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteIssue(row.id)}
                      >
                        Delete
                      </Button>
                    ),
                  },
                ]}
                data={issues}
                isLoading={loading}
                emptyMessage="No migration issues found."
              />
            </div>
          </div>
        )}



        {/* Confirmation Modal */}
        {showConfirmModal && (
          <Modal
            isOpen={showConfirmModal}
            onClose={() => setShowConfirmModal(false)}
            title="Confirm Database Import Plan"
          >
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                <p className="font-bold text-amber-900">⚠️ Database Write Confirmation Required</p>
                <p className="text-amber-800">
                  Executing this plan will modify the database. Review the expected operation counts before proceeding.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-2.5 bg-gray-50 rounded">
                  <span className="text-gray-400">Target Table:</span>
                  <p className="font-bold text-gray-900">{targetTable}</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded">
                  <span className="text-gray-400">Import Mode:</span>
                  <p className="font-bold text-gray-900">{importMode}</p>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded">
                  <span className="text-emerald-700">Expected Inserts:</span>
                  <p className="font-bold text-emerald-800">{validationReport?.summary?.expectedInserts || 0}</p>
                </div>
                <div className="p-2.5 bg-blue-50 rounded">
                  <span className="text-blue-700">Expected Updates:</span>
                  <p className="font-bold text-blue-800">{validationReport?.summary?.expectedUpdates || 0}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleExecuteImport}>
                  Execute Import Plan
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  )
}
