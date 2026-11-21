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
  const { batchId, migrationUser, warehouse, dryRun, issues } = context
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

  // 2. Resolve Category
  const category = await resolveExpenseCategory(expenseData.category_id, expenseData.category_name, tx)
  if (!category && !dryRun) {
    throw new Error(`Cannot import Expense #${expenseData.legacy_id}: No expense category resolved.`)
  }

  if (category && category.name === 'Miscellaneous' && expenseData.category_name !== 'Miscellaneous') {
    issues.push({
      batch_id: batchId,
      entity_type: 'Expense',
      legacy_id: legacyExpenseIdStr,
      issue_code: 'CATEGORY_FALLBACK',
      severity: 'INFO',
      description: `Legacy expense category '${expenseData.category_name}' mapped to fallback category '${category.name}'`,
      source_data: expenseData,
    })
  }

  const expensePayload = {
    category_id: category?.id,
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
