'use strict'

/**
 * Historical Expenses Importer for Legacy POS Migration
 *
 * Implements historical expense ingestion:
 * - Links to default warehouse and system migration user
 * - Sets is_legacy_import: true
 * - Preserves historical expense_date
 * - Decoupled from cash drawer shifts or live balance deductions
 */

const { Decimal } = require('../../../utils/money')
const { SOURCE_SYSTEM, resolveExpenseCategory } = require('../entityResolvers')

/**
 * Import a single historical legacy expense.
 *
 * @param {Object} expenseData - Source legacy expense record
 * @param {Object} context - Execution context { batchId, migrationUser, warehouse, dryRun, issues }
 * @param {Object} tx - Active Prisma transaction client
 * @returns {Promise<Object>} Import result summary
 */
async function importExpense(expenseData, context, tx) {
  const { batchId, migrationUser, warehouse, dryRun, issues, approvedCategoryMappings } = context
  const legacyExpenseIdStr = String(expenseData.legacy_id)

  // 1. Idempotency Check
  const existingMap = await tx.legacyIdMap.findUnique({
    where: {
      source_system_entity_type_legacy_id: {
        source_system: SOURCE_SYSTEM,
        entity_type: 'Expense',
        legacy_id: legacyExpenseIdStr,
      },
    },
  })

  if (existingMap) {
    return {
      status: 'SKIPPED_DUPLICATE',
      legacy_id: expenseData.legacy_id,
      nextill_id: existingMap.nextill_id,
    }
  }

  // 2. Resolve Category (no automatic fallback to Miscellaneous without approval)
  const category = await resolveExpenseCategory(
    expenseData.category_id,
    expenseData.category_name,
    tx,
    { approvedCategoryMappings }
  )

  if (!category) {
    // Preserve original category identifier & name, record unresolved mapping issue,
    // mark dependent expense as NOT eligible for import.
    issues.push({
      batch_id: batchId || null,
      entity_type: 'Expense',
      legacy_id: legacyExpenseIdStr,
      issue_code: 'UNRESOLVED_CATEGORY_MAPPING',
      severity: 'WARNING',
      description: `Legacy expense category '${expenseData.category_name}' (ID: ${expenseData.category_id}) has no approved mapping. Dependent expense #${expenseData.legacy_id} is marked NOT ELIGIBLE for import.`,
      resolution_status: 'UNRESOLVED',
      metadata: {
        legacy_expense_id: expenseData.legacy_id,
        legacy_category_id: expenseData.category_id,
        legacy_category_name: expenseData.category_name,
        amount: expenseData.amount,
        expense_date: expenseData.expense_date,
      },
    })

    return {
      status: 'NOT_ELIGIBLE',
      legacy_id: expenseData.legacy_id,
      reason: 'UNRESOLVED_CATEGORY_MAPPING',
      original_category_id: expenseData.category_id,
      original_category_name: expenseData.category_name,
    }
  }

  const expensePayload = {
    category_id: category.id,
    user_id: migrationUser.id,
    amount: new Decimal(expenseData.amount || 0).toNumber(),
    expense_date: new Date(expenseData.expense_date || Date.now()),
    notes: expenseData.notes || `Legacy POS Expense #${expenseData.legacy_id}`,
    is_legacy_import: true,
  }

  // 3. Dry-Run Mode
  if (dryRun) {
    return {
      status: 'SIMULATED',
      legacy_id: expenseData.legacy_id,
      expense: expensePayload,
    }
  }

  // 4. Live Import Execution
  const createdExpense = await tx.expense.create({
    data: expensePayload,
  })

  // 5. Record LegacyIdMap
  await tx.legacyIdMap.create({
    data: {
      source_system: SOURCE_SYSTEM,
      entity_type: 'Expense',
      legacy_id: legacyExpenseIdStr,
      target_model: 'Expense',
      nextill_id: createdExpense.id,
      batch_id: batchId,
      metadata: {
        original_category_id: expenseData.category_id,
        original_category_name: expenseData.category_name,
        amount: expenseData.amount,
      },
    },
  })

  return {
    status: 'IMPORTED',
    legacy_id: expenseData.legacy_id,
    nextill_id: createdExpense.id,
  }
}

module.exports = {
  importExpense,
}
