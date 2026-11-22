'use strict';

const path = require('path');
const { buildSchemaMetadata, getApprovedTables, findMatchingColumn } = require('./universalSchemaService');

/**
 * Clean a filename to extract potential table name target
 * e.g., "Product.xlsx" -> "Product", "legacy_customer_2026.xlsx" -> "customer"
 */
function cleanFilename(filename) {
  if (!filename) return '';
  const parsed = path.parse(filename).name;
  return parsed
    .replace(/[_-]?\d{4}[_-]?\d{2}[_-]?\d{2}/g, '') // remove date stamps
    .replace(/[_-]?\d+/g, '') // remove trailing numbers
    .replace(/^legacy[_-]?/i, '')
    .replace(/^tbl[_-]?/i, '')
    .replace(/[_-]?export$/i, '')
    .trim();
}

/**
 * Deterministically detect the matching database table from an Excel sheet's headers and metadata.
 *
 * @param {Object} params
 * @param {string[]} params.headers - Excel header row values
 * @param {string} params.sheetName - Active worksheet name
 * @param {string} params.filename - Original uploaded file name
 * @param {number} params.rowCount - Total data rows parsed
 * @param {string} [params.overrideTable] - Optional manual override selected by user
 * @returns {Object} Detection result
 */
function detectTable({ headers = [], sheetName = '', filename = '', rowCount = 0, overrideTable = null }) {
  const schema = buildSchemaMetadata();
  const approvedTables = getApprovedTables();
  const cleanedHeaders = headers.map((h) => String(h || '').trim()).filter(Boolean);
  const cleanedFile = cleanFilename(filename).toLowerCase();
  const cleanedSheet = String(sheetName || '').trim().toLowerCase();

  // If user explicitly provided a manual override table
  if (overrideTable) {
    const tableMeta = schema.tables[overrideTable];
    if (tableMeta && tableMeta.isApproved) {
      return buildDetectionDetails(tableMeta, cleanedHeaders, sheetName, filename, rowCount, 'MANUAL_OVERRIDE', false, []);
    }
  }

  if (cleanedHeaders.length === 0) {
    return {
      detectedTable: null,
      modelName: null,
      tableName: null,
      sheetName,
      filename,
      rowCount,
      columnCount: 0,
      matchingColumns: [],
      missingRequiredColumns: [],
      unknownColumns: [],
      confidence: 'UNMATCHED',
      isAmbiguous: false,
      candidates: [],
      explanation: 'No column headers were found in the uploaded worksheet.',
    };
  }

  const scores = [];

  for (const table of approvedTables) {
    const tableMeta = schema.tables[table.modelName];
    const matchingColumns = [];
    const unknownColumns = [];

    for (const h of cleanedHeaders) {
      const matched = findMatchingColumn(tableMeta, h);
      if (matched) {
        matchingColumns.push(matched);
      } else {
        unknownColumns.push(h);
      }
    }

    // Required writable columns: required and has no default and not ID
    const matchedNames = new Set(matchingColumns.map((c) => c.columnName));
    const requiredWritable = tableMeta.columns.filter((c) => c.isRequired && !c.hasDefault && !c.isId);
    const missingRequired = requiredWritable.filter((c) => !matchedNames.has(c.columnName));

    const matchRatio = cleanedHeaders.length > 0 ? matchingColumns.length / cleanedHeaders.length : 0;
    const requiredCoverage =
      requiredWritable.length === 0
        ? 1.0
        : (requiredWritable.length - missingRequired.length) / requiredWritable.length;

    // Base scoring formula
    let score = matchRatio * 60 + requiredCoverage * 40;

    // Heavily penalize unknown columns
    score -= unknownColumns.length * 15;

    // Heavily penalize if required columns are missing
    score -= missingRequired.length * 10;

    // Bonus for exact sheet name match ONLY if headers show viable overlap
    const sheetMatches =
      cleanedSheet === tableMeta.tableName.toLowerCase() || cleanedSheet === tableMeta.modelName.toLowerCase();
    if (sheetMatches && matchingColumns.length > 0) {
      score += 25;
    }

    // Bonus for filename match ONLY if headers show viable overlap
    const fileMatches =
      cleanedFile === tableMeta.tableName.toLowerCase() || cleanedFile === tableMeta.modelName.toLowerCase();
    if (fileMatches && matchingColumns.length > 0) {
      score += 15;
    }

    // Must have at least 1 matching column and non-negative score
    if (matchingColumns.length > 0 && score > 0) {
      scores.push({
        tableMeta,
        score: Math.max(0, Math.round(score)),
        matchingColumns,
        unknownColumns,
        missingRequired,
        matchRatio,
        sheetMatches,
        fileMatches,
      });
    }
  }

  // Sort descending by score
  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0 || (scores[0].score < 20 && !scores[0].sheetMatches && !scores[0].fileMatches)) {
    return {
      detectedTable: null,
      modelName: null,
      tableName: null,
      sheetName,
      filename,
      rowCount,
      columnCount: cleanedHeaders.length,
      matchingColumns: [],
      missingRequiredColumns: [],
      unknownColumns: cleanedHeaders,
      confidence: 'UNMATCHED',
      isAmbiguous: false,
      candidates: [],
      explanation:
        'The column headers in the uploaded Excel file do not match any approved database table. Please check exact database column names or download a template.',
    };
  }

  const top = scores[0];
  const runnerUp = scores[1];

  // Ambiguity criteria:
  // 1. Two top candidates have scores within 15 points
  // 2. Or top candidate has unknown columns and score < 70
  // 3. Or top candidate has multiple missing required columns while runnerUp exists
  const isCloseScore = runnerUp && Math.abs(top.score - runnerUp.score) <= 15;
  const hasUnknownAndLowConfidence = top.unknownColumns.length > 0 && top.score < 75;
  const isAmbiguous = isCloseScore || hasUnknownAndLowConfidence;

  const candidateList = scores.slice(0, 5).map((s) => ({
    tableName: s.tableMeta.tableName,
    modelName: s.tableMeta.modelName,
    description: s.tableMeta.description,
    score: s.score,
    matchedCount: s.matchingColumns.length,
    unknownCount: s.unknownColumns.length,
    missingRequiredCount: s.missingRequired.length,
  }));

  const confidence = isAmbiguous ? 'AMBIGUOUS' : top.score >= 80 ? 'HIGH' : 'MEDIUM';

  return buildDetectionDetails(
    top.tableMeta,
    cleanedHeaders,
    sheetName,
    filename,
    rowCount,
    confidence,
    isAmbiguous,
    candidateList,
    top
  );
}

function buildDetectionDetails(
  tableMeta,
  cleanedHeaders,
  sheetName,
  filename,
  rowCount,
  confidence,
  isAmbiguous,
  candidateList,
  _computedScore = null
) {
  const columnsByName = tableMeta.columnsByName;
  const matchingColumns = [];
  const unknownColumns = [];

  for (const h of cleanedHeaders) {
    const col = findMatchingColumn(tableMeta, h);
    if (col) {
      matchingColumns.push({
        columnName: col.columnName,
        type: col.type,
        isRequired: col.isRequired,
        isId: col.isId,
        isUnique: col.isUnique,
        hasDefault: col.hasDefault,
        defaultKind: col.defaultKind,
        isForeignKey: col.isForeignKey,
        isProtected: col.isProtected,
        protectedReason: col.protectedReason,
      });
    } else {
      unknownColumns.push(h);
    }
  }

  const matchedNames = new Set(matchingColumns.map((c) => c.columnName));
  const requiredWritable = tableMeta.columns.filter((c) => c.isRequired && !c.hasDefault && !c.isId);
  const missingRequiredColumns = requiredWritable
    .filter((c) => !matchedNames.has(c.columnName))
    .map((c) => ({
      columnName: c.columnName,
      type: c.type,
      description: c.isForeignKey ? `Foreign key to ${c.type}` : `${c.type} field`,
    }));

  let explanation = `Successfully detected table "${tableMeta.tableName}" (${tableMeta.description}).`;
  if (isAmbiguous) {
    explanation = `Detection is ambiguous between multiple candidate tables. Please verify or manually select the intended target table.`;
  } else if (unknownColumns.length > 0) {
    explanation = `Detected table "${tableMeta.tableName}", but the uploaded file contains ${unknownColumns.length} unrecognized column(s): [${unknownColumns.join(', ')}].`;
  }

  return {
    detectedTable: tableMeta.tableName,
    modelName: tableMeta.modelName,
    tableName: tableMeta.tableName,
    sheetName,
    filename,
    rowCount,
    columnCount: cleanedHeaders.length,
    matchingColumns,
    missingRequiredColumns,
    unknownColumns,
    confidence,
    isAmbiguous,
    candidates: candidateList,
    explanation,
    supportsUpsert: tableMeta.supportsUpsert,
    defaultMatchingKey: tableMeta.defaultMatchingKey,
    allowedMatchingKeys: tableMeta.allowedMatchingKeys,
    protectedColumns: tableMeta.protectedColumns,
  };
}

module.exports = {
  detectTable,
  cleanFilename,
};
