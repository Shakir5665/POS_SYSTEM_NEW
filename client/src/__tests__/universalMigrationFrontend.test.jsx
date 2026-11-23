import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MigrationPage from '../pages/MigrationPage'
import { migrationService } from '../services/migration'

// Mock dependencies
vi.mock('../services/migration', () => ({
  migrationService: {
    listApprovedTables: vi.fn(),
    listBatches: vi.fn(),
    listIssues: vi.fn(),
    listUniversalJobs: vi.fn(),
    getTableSchema: vi.fn(),
    inspectUniversalFile: vi.fn(),
    validateUniversalPlan: vi.fn(),
    createJob: vi.fn(),
    confirmJob: vi.fn(),
    getJobStatus: vi.fn(),
    downloadTemplate: vi.fn(),
    getJobErrors: vi.fn(),
    clearDatabase: vi.fn(),
  },
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-admin', full_name: 'Super Admin', role: 'ADMIN' },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}))

describe('Universal Single-Table Excel Migration Frontend', () => {
  const mockApprovedTables = [
    {
      tableName: 'Product',
      modelName: 'Product',
      category: 'Master Data',
      defaultMatchingKey: 'id',
      allowedMatchingKeys: ['id', 'sku', 'barcode'],
      columnCount: 19,
      requiredWritableColumnCount: 3,
      columns: [],
    },
    {
      tableName: 'Customer',
      modelName: 'Customer',
      category: 'Master Data',
      defaultMatchingKey: 'id',
      allowedMatchingKeys: ['id', 'phone', 'email'],
      columnCount: 8,
      requiredWritableColumnCount: 1,
      columns: [],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    migrationService.listApprovedTables.mockResolvedValue({
      data: { data: { approvedTables: mockApprovedTables } },
    })
    migrationService.listBatches.mockResolvedValue({ data: { data: [] } })
    migrationService.listIssues.mockResolvedValue({ data: { data: [] } })
    migrationService.listUniversalJobs.mockResolvedValue({ data: { data: [] } })
    migrationService.getTableSchema.mockResolvedValue({
      data: {
        data: {
          tableName: 'Product',
          columns: [
            { columnName: 'name', type: 'String', classification: 'REQUIRED', nullable: false, guidance: 'Name' },
            { columnName: 'sku', type: 'String', classification: 'REQUIRED', nullable: false, guidance: 'SKU' },
            { columnName: 'price', type: 'Decimal', classification: 'REQUIRED', nullable: false, guidance: 'Price' },
          ],
        },
      },
    })
  })

  it('renders the Database Migration header, subtitle, and upload zone', async () => {
    render(
      <MemoryRouter>
        <MigrationPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Database Migration')).toBeInTheDocument()
    expect(
      screen.getByText(/Import or update database records using Excel files that match your database structure/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Section A — Upload Excel File/i)).toBeInTheDocument()
    expect(screen.getByText(/Drag and drop your Excel workbook here/i)).toBeInTheDocument()
  })

  it('renders automatic table detection and validation metrics upon successful inspection', async () => {
    migrationService.inspectUniversalFile.mockResolvedValueOnce({
      data: {
        data: {
          filename: 'Product.xlsx',
          sheetName: 'Product',
          headers: ['name', 'sku', 'price'],
          totalRows: 25,
          detection: {
            detectedTable: 'Product',
            modelName: 'Product',
            confidence: 'HIGH',
            isAmbiguous: false,
            matchingColumns: [{ columnName: 'name' }, { columnName: 'sku' }, { columnName: 'price' }],
            unknownColumns: [],
            missingRequiredColumns: [],
          },
          rawRows: [
            { name: 'P1', sku: 'SKU1', price: 10 },
            { name: 'P2', sku: 'SKU2', price: 20 },
          ],
        },
      },
    })

    migrationService.validateUniversalPlan.mockResolvedValueOnce({
      data: {
        data: {
          tableName: 'Product',
          mode: 'INSERT',
          matchingKey: 'id',
          isValidPlan: true,
          summary: {
            totalRows: 25,
            validRows: 25,
            invalidRows: 0,
            expectedInserts: 25,
            expectedUpdates: 0,
          },
          matchingColumns: [{ columnName: 'name', type: 'String' }],
          previewRecords: [
            { rowIdx: 1, status: 'INSERT_CANDIDATE', data: { name: 'P1', sku: 'SKU1', price: 10 }, issues: [] },
          ],
          rowIssues: [],
        },
      },
    })

    render(
      <MemoryRouter>
        <MigrationPage />
      </MemoryRouter>
    )

    const file = new File(['mock content'], 'Product.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const input = document.getElementById('excel-file-input')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/Section B — Automatic Table Detection/i)).toBeInTheDocument()
      expect(screen.getByText(/HIGH CONFIDENCE/i)).toBeInTheDocument()
      expect(screen.getByText(/Section E — Validation Summary/i)).toBeInTheDocument()
      expect(screen.getByText(/PLAN APPROVED/i)).toBeInTheDocument()
    })
  })

  it('switches between tabs: Templates and Migration Batches', async () => {
    render(
      <MemoryRouter>
        <MigrationPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText(/Download Templates & Schema/i))
    expect(screen.getByText(/Download Excel Template/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Physical Schema Specification/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Migration Batches/i))
    expect(screen.getByText(/No migration batches recorded yet/i)).toBeInTheDocument()
  })

  it('handles Clear Database modal flow with confirmation text validation', async () => {
    migrationService.clearDatabase.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Database contents cleared successfully, preserving user accounts',
      },
    })

    render(
      <MemoryRouter>
        <MigrationPage />
      </MemoryRouter>
    )

    // Clear Database button should be visible in the header
    const openBtn = screen.getByTestId('open-clear-database-modal-button')
    expect(openBtn).toBeInTheDocument()
    fireEvent.click(openBtn)

    // Modal pops up
    expect(screen.getByText('Clear Database Confirmation')).toBeInTheDocument()
    expect(screen.getByText(/All user accounts in the/i)).toBeInTheDocument()
    expect(screen.getByText(/Please type/i)).toBeInTheDocument()

    // The confirm button in modal should be disabled initially
    const confirmBtn = screen.getByTestId('confirm-clear-database-button')
    expect(confirmBtn).toBeDisabled()

    const input = screen.getByPlaceholderText('Clear Database')
    // Type incorrect text
    fireEvent.change(input, { target: { value: 'clear' } })
    expect(confirmBtn).toBeDisabled()

    // Type exact required text: "Clear Database"
    fireEvent.change(input, { target: { value: 'Clear Database' } })
    expect(confirmBtn).not.toBeDisabled()

    // Submit confirmation
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(migrationService.clearDatabase).toHaveBeenCalledWith('Clear Database')
    })
  })
})
