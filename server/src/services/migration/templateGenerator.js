'use strict';

const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { getTableMetadata } = require('./universalSchemaService');

/**
 * Generate a realistic sample value for a column based on its definition.
 */
function getSampleValue(colDef, sampleIndex = 0) {
  if (colDef.isId) {
    return sampleIndex === 0 ? uuidv4() : `${1000 + sampleIndex}`;
  }

  if (colDef.isEnum && colDef.enumValues && colDef.enumValues.length > 0) {
    return colDef.enumValues[sampleIndex % colDef.enumValues.length];
  }

  if (colDef.type === 'DateTime') {
    return new Date(Date.now() - sampleIndex * 86400000).toISOString();
  }

  if (colDef.type === 'Boolean') {
    return sampleIndex % 2 === 0;
  }

  if (colDef.type === 'Int' || colDef.type === 'BigInt') {
    return (sampleIndex + 1) * 10;
  }

  if (colDef.type === 'Decimal' || colDef.type === 'Float') {
    return Number(((sampleIndex + 1) * 12.5).toFixed(2));
  }

  // String field heuristics based on column name
  const name = colDef.columnName.toLowerCase();
  if (name.includes('email')) {
    return `user${sampleIndex + 1}@example.com`;
  }
  if (name.includes('phone')) {
    return `+123456789${sampleIndex}`;
  }
  if (name.includes('sku')) {
    return `SKU-${1000 + sampleIndex + 1}`;
  }
  if (name.includes('barcode')) {
    return `89012345678${sampleIndex + 1}`;
  }
  if (name.includes('code')) {
    return `CODE-${100 + sampleIndex + 1}`;
  }
  if (name.includes('name')) {
    return `Sample ${colDef.fieldName} ${sampleIndex + 1}`;
  }
  if (name.includes('address')) {
    return `${100 + sampleIndex} Main Street`;
  }
  if (name.includes('notes') || name.includes('description')) {
    return `Sample notes for record ${sampleIndex + 1}`;
  }
  if (name.includes('unit')) {
    return 'pcs';
  }
  if (colDef.isForeignKey) {
    return uuidv4(); // Placeholder UUID representing parent ID
  }

  return `Sample ${sampleIndex + 1}`;
}

/**
 * Generate an Excel workbook (.xlsx buffer) for a specific table template.
 *
 * @param {string} tableName - Target approved table name
 * @param {string} [variant='full'] - 'minimal' (required writable only) or 'full' (all writable)
 * @returns {Buffer} XLSX file buffer
 */
function generateTemplateWorkbook(tableName, variant = 'full') {
  const tableMeta = getTableMetadata(tableName);
  if (!tableMeta) {
    throw new Error(`Table "${tableName}" not found.`);
  }
  if (!tableMeta.isApproved) {
    throw new Error(`Table "${tableName}" is restricted. Templates cannot be generated for restricted tables.`);
  }

  let selectedColumns;
  if (variant.toLowerCase() === 'minimal') {
    // Only required writable columns
    selectedColumns = tableMeta.columns.filter((c) => c.isRequired && !c.hasDefault && !c.isId);
    // If no required writable columns (all optional or defaulted), include ID and primary identifying field
    if (selectedColumns.length === 0) {
      selectedColumns = tableMeta.columns.slice(0, 3);
    }
  } else {
    // Full template: all columns except internal system columns if any
    selectedColumns = tableMeta.columns;
  }

  // Row 1: Header row with exact database column names
  const headerRow = selectedColumns.map((c) => c.columnName);

  // Row 2 & 3: Sample data rows
  const sampleRow1 = selectedColumns.map((c) => getSampleValue(c, 0));
  const sampleRow2 = selectedColumns.map((c) => getSampleValue(c, 1));

  const aoaData = [headerRow, sampleRow1, sampleRow2];

  const ws = XLSX.utils.aoa_to_sheet(aoaData);

  // Configure column widths
  const colWidths = selectedColumns.map((c) => ({
    wch: Math.max(c.columnName.length + 4, 16),
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  // Name sheet exactly after table name for automatic detection
  XLSX.utils.book_append_sheet(wb, ws, tableMeta.tableName);

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return {
    buffer,
    filename: `${tableMeta.tableName}_template_${variant.toLowerCase()}.xlsx`,
    columns: selectedColumns.map((c) => ({
      columnName: c.columnName,
      type: c.type,
      isRequired: c.isRequired,
      isId: c.isId,
      isForeignKey: c.isForeignKey,
      hasDefault: c.hasDefault,
      defaultKind: c.defaultKind,
      isProtected: c.isProtected,
      protectedReason: c.protectedReason,
      enumValues: c.enumValues,
    })),
  };
}

/**
 * Generate comprehensive schema guidance for a table (for UI display or export)
 */
function getTableSchemaGuide(tableName) {
  const tableMeta = getTableMetadata(tableName);
  if (!tableMeta) return null;

  return {
    tableName: tableMeta.tableName,
    modelName: tableMeta.modelName,
    description: tableMeta.description,
    category: tableMeta.category,
    primaryKeys: tableMeta.primaryKeys,
    defaultMatchingKey: tableMeta.defaultMatchingKey,
    allowedMatchingKeys: tableMeta.allowedMatchingKeys,
    supportsUpsert: tableMeta.supportsUpsert,
    protectedColumns: tableMeta.protectedColumns,
    foreignKeys: tableMeta.foreignKeys.map((fk) => ({
      columnName: fk.fromColumn,
      targetTable: fk.targetTable,
      targetColumn: fk.targetColumn,
      isRequired: fk.isRequired,
      rule: `Must reference an existing record in table "${fk.targetTable}" (${fk.targetColumn}). Missing parent records are rejected.`,
    })),
    columns: tableMeta.columns.map((c) => ({
      columnName: c.columnName,
      type: c.type,
      classification: c.isId
        ? 'PRIMARY_KEY'
        : c.isRequired && !c.hasDefault
        ? 'REQUIRED'
        : c.hasDefault
        ? 'DEFAULTED'
        : 'OPTIONAL',
      nullable: c.isNullable,
      hasDefault: c.hasDefault,
      defaultKind: c.defaultKind,
      isEnum: c.isEnum,
      enumValues: c.enumValues,
      isForeignKey: c.isForeignKey,
      isProtected: c.isProtected,
      protectedReason: c.protectedReason,
      guidance: c.isId
        ? 'Primary key. Accepts either UUID v4 (e.g. 550e8400-...) or Integer ID (e.g. 1001, 1). If omitted or blank in Excel, a new UUID v4 is automatically generated.'
        : c.isProtected
        ? c.protectedReason
        : c.isEnum
        ? `Enum field. Allowed values: ${c.enumValues.join(', ')}`
        : c.type === 'DateTime'
        ? 'ISO 8601 string (e.g. 2026-01-01T12:00:00Z) or Excel Date cell.'
        : c.type === 'Decimal' || c.type === 'Float'
        ? 'Numeric decimal value.'
        : c.type === 'Boolean'
        ? 'Boolean (true/false, 1/0).'
        : 'Text string.',
    })),
  };
}

module.exports = {
  generateTemplateWorkbook,
  getTableSchemaGuide,
};
