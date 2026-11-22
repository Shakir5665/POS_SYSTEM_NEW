'use strict';

const { v4: uuidv4 } = require('uuid');
const prisma = require('../../utils/prismaClient');
const { getTableMetadata, findMatchingColumn } = require('./universalSchemaService');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a cell contains a potential spreadsheet formula injection.
 */
function isFormulaInjection(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed.length > 1 && (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@'))) {
    // Check if followed by letters or formula symbols
    return /^[=+\-@][a-zA-Z(]/.test(trimmed);
  }
  return false;
}

/**
 * Sanitize formula cell value if detected
 */
function sanitizeFormula(val) {
  if (typeof val === 'string' && isFormulaInjection(val)) {
    // Prepend single quote or reject
    return `'${val}`;
  }
  return val;
}

/**
 * Validate and normalize a single cell value based on its column definition.
 */
function parseAndValidateCell(rawVal, colDef, _rowIdx) {
  // Distinguish omitted, blank/empty, null, zero, false (Rule C)
  const isBlank = rawVal === null || rawVal === undefined || (typeof rawVal === 'string' && rawVal.trim() === '');

  // 1. Blank cell handling
  if (isBlank) {
    if (colDef.isNullable) {
      return { ok: true, value: null };
    }
    if (colDef.hasDefault || colDef.isId) {
      // Omitted or blank default/id will be handled by generation
      return { ok: true, value: undefined, willGenerate: true };
    }
    return {
      ok: false,
      error: `Field "${colDef.columnName}" is required and cannot be blank or null.`,
      code: 'REQUIRED_FIELD_BLANK',
    };
  }

  // Check formula injection
  if (isFormulaInjection(rawVal)) {
    return {
      ok: false,
      error: `Security Alert: Cell contains unsafe formula expression "${rawVal}". Spreadsheet formula execution is blocked.`,
      code: 'FORMULA_INJECTION_DETECTED',
    };
  }

  // 2. Type conversions & validations
  const valType = colDef.type;

  // ID validation (Supports UUID v4, Integer IDs like 1, 1001, and custom string IDs)
  if (colDef.isId && valType === 'String') {
    const strVal = String(rawVal).trim();
    if (UUID_REGEX.test(strVal)) {
      return { ok: true, value: strVal, isExplicitUuid: true, idFormat: 'UUID' };
    }
    // Integer / Numeric ID (e.g. 1, 2, 1001, 99999)
    if (/^\d+$/.test(strVal)) {
      return { ok: true, value: strVal, isExplicitId: true, idFormat: 'INTEGER' };
    }
    // Clean string identifier without formula injection
    if (strVal.length > 0 && strVal.length <= 128 && !isFormulaInjection(strVal)) {
      return { ok: true, value: strVal, isExplicitId: true, idFormat: 'STRING' };
    }
    return {
      ok: false,
      error: `Field "${colDef.columnName}" must be a valid UUID v4 format (e.g. 550e8400-e29b-41d4-a716-446655440000) or an Integer ID (e.g. 1, 1001). Got "${rawVal}".`,
      code: 'INVALID_ID_FORMAT',
    };
  }

  // Enum validation
  if (colDef.isEnum) {
    const strVal = String(rawVal).trim();
    if (colDef.enumValues && colDef.enumValues.includes(strVal)) {
      return { ok: true, value: strVal };
    }
    return {
      ok: false,
      error: `Value "${rawVal}" is invalid for enum "${valType}". Supported values: [${colDef.enumValues.join(', ')}].`,
      code: 'INVALID_ENUM_VALUE',
    };
  }

  // String / Text
  if (valType === 'String') {
    const trimmed = String(rawVal).trim();
    if (trimmed === '' && colDef.isNullable) {
      return { ok: true, value: null };
    }
    return { ok: true, value: trimmed };
  }

  // Int / BigInt
  if (valType === 'Int' || valType === 'BigInt') {
    const num = Number(rawVal);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      return {
        ok: false,
        error: `Field "${colDef.columnName}" must be an integer (got "${rawVal}").`,
        code: 'INVALID_INTEGER',
      };
    }
    return { ok: true, value: valType === 'BigInt' ? BigInt(num) : num };
  }

  // Decimal / Float
  if (valType === 'Decimal' || valType === 'Float') {
    const num = Number(rawVal);
    if (!Number.isFinite(num) || isNaN(num)) {
      return {
        ok: false,
        error: `Field "${colDef.columnName}" must be a valid numeric value (got "${rawVal}").`,
        code: 'INVALID_NUMERIC',
      };
    }
    return { ok: true, value: num };
  }

  // Boolean
  if (valType === 'Boolean') {
    if (typeof rawVal === 'boolean') {
      return { ok: true, value: rawVal };
    }
    const lower = String(rawVal).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 't'].includes(lower)) {
      return { ok: true, value: true };
    }
    if (['false', '0', 'no', 'n', 'f'].includes(lower)) {
      return { ok: true, value: false };
    }
    return {
      ok: false,
      error: `Field "${colDef.columnName}" must be boolean (true/false) (got "${rawVal}").`,
      code: 'INVALID_BOOLEAN',
    };
  }

  // DateTime
  if (valType === 'DateTime') {
    let date;
    if (rawVal instanceof Date) {
      date = rawVal;
    } else if (typeof rawVal === 'number') {
      // Excel serial date format (days since 1899-12-30)
      date = new Date(Math.round((rawVal - 25569) * 86400 * 1000));
    } else {
      date = new Date(String(rawVal).trim());
    }

    if (isNaN(date.getTime())) {
      return {
        ok: false,
        error: `Field "${colDef.columnName}" must be a valid date/time (got "${rawVal}").`,
        code: 'INVALID_DATETIME',
      };
    }
    return { ok: true, value: date.toISOString() };
  }

  // Json
  if (valType === 'Json') {
    if (typeof rawVal === 'object') {
      return { ok: true, value: rawVal };
    }
    try {
      const parsed = JSON.parse(String(rawVal));
      return { ok: true, value: parsed };
    } catch {
      return {
        ok: false,
        error: `Field "${colDef.columnName}" must be valid JSON format.`,
        code: 'INVALID_JSON',
      };
    }
  }

  return { ok: true, value: rawVal };
}

/**
 * Validate an entire dataset against table schema, database foreign keys, and import mode.
 *
 * @param {Object} params
 * @param {string} params.tableName - Database table name or Prisma model name
 * @param {string[]} params.headers - Excel header row
 * @param {Array<Object>} params.rawRows - Raw row objects (columnName -> raw value)
 * @param {string} [params.mode='INSERT'] - 'INSERT', 'UPDATE', or 'UPSERT'
 * @param {string} [params.matchingKey] - Matching unique column for update/upsert (default PK 'id')
 * @returns {Promise<Object>} Comprehensive validation report
 */
async function validateWorkbookData({
  tableName,
  headers = [],
  rawRows = [],
  mode = 'INSERT',
  matchingKey = null,
}) {
  const tableMeta = getTableMetadata(tableName);
  if (!tableMeta) {
    throw new Error(`Table "${tableName}" is not recognized or not available.`);
  }
  if (!tableMeta.isApproved) {
    throw new Error(
      `Table "${tableName}" is restricted and cannot be imported or modified via generic Excel migration. Reason: ${tableMeta.restrictedReason}`
    );
  }

  const selectedMatchingKey = matchingKey || tableMeta.defaultMatchingKey || 'id';
  const effectiveMode = ['INSERT', 'UPDATE', 'UPSERT'].includes(mode.toUpperCase()) ? mode.toUpperCase() : 'INSERT';

  // 1. Header Validation
  const matchingHeaders = [];
  const unknownHeaders = [];
  const headerToColDefMap = {};

  for (const h of headers) {
    const trimmed = String(h || '').trim();
    if (!trimmed) continue;
    const matchedCol = findMatchingColumn(tableMeta, trimmed);
    if (matchedCol) {
      matchingHeaders.push(trimmed);
      headerToColDefMap[trimmed] = matchedCol;
    } else {
      unknownHeaders.push(trimmed);
    }
  }

  // Check required writable columns against matched columns
  const matchedColNames = new Set(Object.values(headerToColDefMap).map((c) => c.columnName));
  const requiredWritableCols = tableMeta.columns.filter((c) => c.isRequired && !c.hasDefault && !c.isId);
  const missingRequiredHeaders = requiredWritableCols
    .filter((c) => !matchedColNames.has(c.columnName))
    .map((c) => c.columnName);

  // If unknown columns exist or required writable columns are missing, record structural issues
  const structuralErrors = [];
  if (unknownHeaders.length > 0) {
    structuralErrors.push({
      code: 'UNKNOWN_COLUMNS_DETECTED',
      message: `File contains ${unknownHeaders.length} unknown column(s) not in database table "${tableMeta.tableName}": [${unknownHeaders.join(', ')}].`,
      columns: unknownHeaders,
    });
  }
  if (missingRequiredHeaders.length > 0) {
    structuralErrors.push({
      code: 'MISSING_REQUIRED_COLUMNS',
      message: `File is missing ${missingRequiredHeaders.length} required database column(s) without default values: [${missingRequiredHeaders.join(', ')}].`,
      columns: missingRequiredHeaders,
    });
  }

  // 2. Row-by-Row Cell Validation & Transformation
  const parsedRows = [];
  const rowIssues = [];
  const uniqueOccurrencesMap = new Map(); // colName -> Map(val -> rowIdx)
  const uniqueDbValueCollections = {}; // colName -> Set of non-null values
  const uniqueColumns = tableMeta.columns.filter((c) => c.isUnique);
  for (const uc of uniqueColumns) {
    uniqueOccurrencesMap.set(uc.columnName, new Map());
    uniqueDbValueCollections[uc.columnName] = new Set();
  }

  // For Foreign Key collection
  const fkValueCollections = {};
  for (const fk of tableMeta.foreignKeys) {
    fkValueCollections[fk.fromColumn] = new Set();
  }

  // For Matching Key collection
  const matchingKeyValues = new Set();

  let duplicateCount = 0;
  let protectedViolationCount = 0;

  for (let r = 0; r < rawRows.length; r++) {
    const rowIdx = r + 1; // 1-based data row number (Excel row = r + 2)
    const rawRow = rawRows[r];
    const transformedRow = {};
    const currentRowIssues = [];

    // Process every header present in file
    for (const h of matchingHeaders) {
      const colDef = headerToColDefMap[h];
      const rawCellVal = rawRow[h];

      // Protected field check
      if (colDef.isProtected) {
        if (rawCellVal !== null && rawCellVal !== undefined && String(rawCellVal).trim() !== '') {
          protectedViolationCount++;
          currentRowIssues.push({
            row: rowIdx,
            column: h,
            originalValue: rawCellVal,
            code: 'PROTECTED_FIELD_VIOLATION',
            severity: 'WARNING',
            message: colDef.protectedReason || `Column "${h}" is protected from generic spreadsheet updates.`,
            recommendation: 'Clear this column or use the approved business workflow.',
          });
        }
      }

      const cellResult = parseAndValidateCell(rawCellVal, colDef, rowIdx);
      if (!cellResult.ok) {
        currentRowIssues.push({
          row: rowIdx,
          column: h,
          originalValue: rawCellVal,
          code: cellResult.code,
          severity: 'ERROR',
          message: cellResult.error,
          recommendation: `Provide a valid ${colDef.type} value matching database constraints.`,
        });
      } else {
        if (cellResult.value !== undefined) {
          transformedRow[colDef.fieldName] = cellResult.value;
          transformedRow[colDef.columnName] = cellResult.value;
        }

        // Collect FK for batch database verification
        if (colDef.isForeignKey && cellResult.value !== null && cellResult.value !== undefined) {
          fkValueCollections[colDef.columnName]?.add(cellResult.value);
        }
      }
    }

    // Auto-generate omitted generated fields (Rule B)
    for (const colDef of tableMeta.columns) {
      if (!headers.includes(colDef.columnName)) {
        if (colDef.isId && colDef.defaultKind === 'uuid(4)') {
          // Omitted UUID PK -> generate
          transformedRow[colDef.columnName] = uuidv4();
        } else if (colDef.isUpdatedAt || (colDef.defaultKind === 'now' && colDef.columnName === 'created_at')) {
          transformedRow[colDef.columnName] = new Date().toISOString();
        }
      } else if (transformedRow[colDef.columnName] === undefined && colDef.isId && colDef.defaultKind === 'uuid(4)') {
        // Provided header but cell was blank -> generate
        transformedRow[colDef.columnName] = uuidv4();
      }
    }

    // Check in-file duplicates for ALL unique columns in the table (including PK and matchingKey)
    for (const uc of uniqueColumns) {
      const uVal =
        transformedRow[uc.fieldName] !== undefined
          ? transformedRow[uc.fieldName]
          : transformedRow[uc.columnName];
      if (uVal !== null && uVal !== undefined && uVal !== '') {
        const valStr = String(uVal).trim();
        if (valStr !== '') {
          const occMap = uniqueOccurrencesMap.get(uc.columnName);
          if (occMap && occMap.has(valStr)) {
            duplicateCount++;
            const prevRow = occMap.get(valStr);
            const isPk = tableMeta.primaryKeys.includes(uc.columnName);
            const issue = {
              row: rowIdx,
              column: uc.columnName,
              originalValue: valStr,
              code: isPk ? 'DUPLICATE_PRIMARY_KEY_IN_FILE' : 'DUPLICATE_UNIQUE_VALUE_IN_FILE',
              severity: 'ERROR',
              message: `Unique column "${uc.columnName}" with value "${valStr}" is duplicated within row ${prevRow} and row ${rowIdx}.`,
              recommendation: `Ensure unique constraints are respected for column "${uc.columnName}", or leave blank if nullable.`,
            };
            currentRowIssues.push(issue);
            rowIssues.push(issue);
          } else if (occMap) {
            occMap.set(valStr, rowIdx);
            uniqueDbValueCollections[uc.columnName]?.add(uVal);
          }
        }
      }
    }

    // Collect matching key for DB query
    const mkVal =
      transformedRow[selectedMatchingKey] !== undefined
        ? transformedRow[selectedMatchingKey]
        : transformedRow[tableMeta.columnsByName[selectedMatchingKey]?.fieldName];
    if (mkVal !== undefined && mkVal !== null && mkVal !== '') {
      matchingKeyValues.add(mkVal);
    }

    parsedRows.push({
      rowIdx,
      data: transformedRow,
      raw: rawRow,
      issues: currentRowIssues,
      status: currentRowIssues.some((i) => i.severity === 'ERROR') ? 'INVALID' : 'PENDING_DB_CHECKS',
    });

    for (const iss of currentRowIssues) {
      rowIssues.push(iss);
    }
  }

  // 3. Batched Foreign Key Database Validation (Section 7)
  let fkErrorCount = 0;
  for (const fk of tableMeta.foreignKeys) {
    const valuesSet = fkValueCollections[fk.fromColumn];
    if (!valuesSet || valuesSet.size === 0) continue;

    const valuesList = Array.from(valuesSet);
    const targetModelPrisma = prisma[fk.targetModel.charAt(0).toLowerCase() + fk.targetModel.slice(1)];

    if (targetModelPrisma && typeof targetModelPrisma.findMany === 'function') {
      try {
        const found = await targetModelPrisma.findMany({
          where: {
            [fk.targetField]: { in: valuesList },
          },
          select: { [fk.targetField]: true },
        });

        const foundSet = new Set(found.map((r) => r[fk.targetField]));

        for (const pr of parsedRows) {
          const val = pr.data[fk.fromColumn];
          if (val !== null && val !== undefined && !foundSet.has(val)) {
            fkErrorCount++;
            const issue = {
              row: pr.rowIdx,
              column: fk.fromColumn,
              originalValue: val,
              code: 'FOREIGN_KEY_NOT_FOUND',
              severity: 'ERROR',
              message: `Column "${fk.fromColumn}" references a ${fk.targetModel} record ("${val}") that does not exist in the database.`,
              recommendation: `Ensure parent ${fk.targetModel} record exists before importing this table. Foreign records must not be fabricated.`,
            };
            pr.issues.push(issue);
            rowIssues.push(issue);
            pr.status = 'INVALID';
          }
        }
      } catch (err) {
        console.warn(`FK check error for ${fk.targetModel}:`, err.message);
      }
    }
  }

  // 4. Batched Matching Key Check & Mode Candidates (Insert / Update / Upsert)
  const existingDbRecords = new Set();
  const targetModelClient = prisma[tableMeta.modelName.charAt(0).toLowerCase() + tableMeta.modelName.slice(1)];
  const matchingKeyField = tableMeta.columnsByName[selectedMatchingKey]?.fieldName || selectedMatchingKey;

  if (targetModelClient && matchingKeyValues.size > 0) {
    try {
      const existing = await targetModelClient.findMany({
        where: {
          [matchingKeyField]: { in: Array.from(matchingKeyValues) },
        },
        select: { [matchingKeyField]: true },
      });
      for (const rec of existing) {
        existingDbRecords.add(rec[matchingKeyField]);
      }
    } catch (err) {
      console.warn(`Existing records query error for ${tableMeta.modelName}:`, err.message);
    }
  }

  // Pre-query database for collisions on ALL unique columns (e.g. phone, email, sku, barcode) in INSERT mode
  const dbUniqueCollisions = new Map(); // colName -> Set of existing values
  if (targetModelClient && effectiveMode === 'INSERT') {
    const uniqueColsToCheck = tableMeta.columns.filter((c) => c.isUnique);
    for (const uc of uniqueColsToCheck) {
      const valsSet = uniqueDbValueCollections[uc.columnName];
      if (!valsSet || valsSet.size === 0) continue;
      try {
        const found = await targetModelClient.findMany({
          where: {
            [uc.fieldName]: { in: Array.from(valsSet) },
          },
          select: { [uc.fieldName]: true },
        });
        if (found.length > 0) {
          dbUniqueCollisions.set(
            uc.columnName,
            new Set(found.map((r) => String(r[uc.fieldName])))
          );
        }
      } catch (err) {
        console.warn(`Unique collision check query error for ${uc.columnName}:`, err.message);
      }
    }
  }

  let expectedInserts = 0;
  let expectedUpdates = 0;
  let expectedConflicts = 0;

  for (const pr of parsedRows) {
    if (pr.status === 'INVALID') continue;

    const mkVal = pr.data[matchingKeyField] !== undefined ? pr.data[matchingKeyField] : pr.data[selectedMatchingKey];
    const existsInDb = mkVal !== undefined && mkVal !== null && existingDbRecords.has(mkVal);

    if (effectiveMode === 'INSERT') {
      let hasConflict = false;
      if (existsInDb) {
        hasConflict = true;
        expectedConflicts++;
        pr.status = 'CONFLICT';
        const issue = {
          row: pr.rowIdx,
          column: selectedMatchingKey,
          originalValue: mkVal,
          code: 'UNIQUE_KEY_CONFLICT',
          severity: 'ERROR',
          message: `Record with ${selectedMatchingKey}="${mkVal}" already exists in database (Insert Only mode).`,
          recommendation: 'Use Upsert or Update Existing mode to modify existing records.',
        };
        pr.issues.push(issue);
        rowIssues.push(issue);
      }

      // Check other unique columns for DB conflicts
      for (const [colName, valSet] of dbUniqueCollisions.entries()) {
        if (colName === selectedMatchingKey) continue;
        const uColDef = tableMeta.columnsByName[colName];
        const val = uColDef && (pr.data[uColDef.fieldName] !== undefined ? pr.data[uColDef.fieldName] : pr.data[colName]);
        if (val !== null && val !== undefined && val !== '' && valSet.has(String(val))) {
          if (!hasConflict) {
            hasConflict = true;
            expectedConflicts++;
            pr.status = 'CONFLICT';
          }
          const issue = {
            row: pr.rowIdx,
            column: colName,
            originalValue: val,
            code: 'UNIQUE_KEY_CONFLICT',
            severity: 'ERROR',
            message: `Record with unique column "${colName}"="${val}" already exists in database (Insert Only mode).`,
            recommendation: `Provide a unique value for ${colName} or use Upsert / Update Existing mode.`,
          };
          pr.issues.push(issue);
          rowIssues.push(issue);
        }
      }

      if (!hasConflict) {
        expectedInserts++;
        pr.status = 'INSERT_CANDIDATE';
      }
    } else if (effectiveMode === 'UPDATE') {
      if (!mkVal) {
        pr.status = 'INVALID';
        const issue = {
          row: pr.rowIdx,
          column: selectedMatchingKey,
          originalValue: mkVal,
          code: 'MISSING_MATCHING_KEY',
          severity: 'ERROR',
          message: `Matching key "${selectedMatchingKey}" is required for Update Existing mode.`,
          recommendation: 'Provide the matching primary key or unique identifier to update existing records.',
        };
        pr.issues.push(issue);
        rowIssues.push(issue);
      } else if (!existsInDb) {
        expectedConflicts++;
        pr.status = 'INVALID';
        const issue = {
          row: pr.rowIdx,
          column: selectedMatchingKey,
          originalValue: mkVal,
          code: 'RECORD_NOT_FOUND',
          severity: 'ERROR',
          message: `Record with ${selectedMatchingKey}="${mkVal}" does not exist in database (Update Existing mode).`,
          recommendation: 'Ensure the record exists in the database or switch to Upsert mode.',
        };
        pr.issues.push(issue);
        rowIssues.push(issue);
      } else {
        expectedUpdates++;
        pr.status = 'UPDATE_CANDIDATE';
      }
    } else if (effectiveMode === 'UPSERT') {
      if (existsInDb) {
        expectedUpdates++;
        pr.status = 'UPDATE_CANDIDATE';
      } else {
        expectedInserts++;
        pr.status = 'INSERT_CANDIDATE';
      }
    }
  }

  // Summary Metrics
  const totalRows = rawRows.length;
  const invalidRows = parsedRows.filter((r) => r.status === 'INVALID' || r.status === 'CONFLICT').length;
  const validRows = totalRows - invalidRows;
  const isValidPlan = structuralErrors.length === 0 && invalidRows === 0;

  // First 50 preview records
  const previewRecords = parsedRows.slice(0, 50).map((r) => ({
    rowIdx: r.rowIdx,
    status: r.status,
    data: r.data,
    issues: r.issues,
  }));

  return {
    tableName: tableMeta.tableName,
    modelName: tableMeta.modelName,
    mode: effectiveMode,
    matchingKey: selectedMatchingKey,
    isValidPlan,
    structuralErrors,
    summary: {
      totalRows,
      validRows,
      invalidRows,
      expectedInserts,
      expectedUpdates,
      expectedSkips: 0,
      duplicateRows: duplicateCount,
      fkErrors: fkErrorCount,
      uniqueConflicts: expectedConflicts,
      missingRequiredColumns: missingRequiredHeaders.length,
      unsupportedColumns: unknownHeaders.length,
      protectedViolations: protectedViolationCount,
    },
    matchingColumns: matchingHeaders.map((h) => ({
      columnName: h,
      dbColumnName: headerToColDefMap[h]?.columnName,
      type: headerToColDefMap[h]?.type || tableMeta.columnsByName[h]?.type,
      isRequired: headerToColDefMap[h]?.isRequired ?? tableMeta.columnsByName[h]?.isRequired,
      isId: headerToColDefMap[h]?.isId ?? tableMeta.columnsByName[h]?.isId,
      isProtected: headerToColDefMap[h]?.isProtected ?? tableMeta.columnsByName[h]?.isProtected,
    })),
    missingRequiredColumns: missingRequiredHeaders,
    unknownColumns: unknownHeaders,
    previewRecords,
    rowIssues: rowIssues.slice(0, 200), // First 200 issues for display
    totalIssueCount: rowIssues.length,
  };
}

module.exports = {
  validateWorkbookData,
  parseAndValidateCell,
  isFormulaInjection,
  sanitizeFormula,
};
