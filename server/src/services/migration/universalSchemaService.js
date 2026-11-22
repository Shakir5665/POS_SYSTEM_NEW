'use strict';

const { Prisma } = require('@prisma/client');

/**
 * Explicit allowlist of tables approved for universal Excel migration.
 * Each entry defines business constraints and protected fields.
 */
const APPROVED_TABLES_CONFIG = {
  Category: {
    description: 'Product merchandise categories',
    category: 'Master Data',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'name'],
  },
  Product: {
    description: 'Product catalog, pricing, and unit configurations',
    category: 'Master Data',
    // Stock quantity is protected to prevent silent drift of physical inventory without stock adjustment logs
    protectedColumns: ['quantity'],
    protectedColumnRules: {
      quantity: 'Physical stock modifications via generic spreadsheet updates are restricted. Use standard Stock Adjustment workflow to preserve inventory audit logs.',
    },
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'sku', 'barcode'],
  },
  Customer: {
    description: 'Customer profiles, contact information, and loyalty accounts',
    category: 'Master Data',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'phone', 'email'],
  },
  Supplier: {
    description: 'Procurement suppliers and contact details',
    category: 'Master Data',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'name', 'phone'],
  },
  Warehouse: {
    description: 'Physical inventory locations and warehouses',
    category: 'Master Data',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'code', 'name'],
  },
  ExpenseCategory: {
    description: 'Operational expense classification categories',
    category: 'Finance Master',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'name'],
  },
  Expense: {
    description: 'Operational business expenses',
    category: 'Transactions',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id'],
  },
  BusinessAsset: {
    description: 'Company assets and equipment register',
    category: 'Finance Master',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'asset_code'],
  },
  OwnerTransaction: {
    description: 'Owner equity contributions and capital withdrawals',
    category: 'Finance Master',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id'],
  },
  StockAdjustment: {
    description: 'Inventory adjustment batch headers',
    category: 'Inventory',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'adjustment_number'],
  },
  StockAdjustmentItem: {
    description: 'Inventory adjustment line items',
    category: 'Inventory',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id'],
  },
  Sale: {
    description: 'Historical sales transaction headers',
    category: 'Transactions',
    protectedColumns: ['loyalty_points_earned'],
    protectedColumnRules: {
      loyalty_points_earned: 'Customer loyalty balances cannot be adjusted via raw transaction headers.',
    },
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'transaction_id'],
  },
  SaleItem: {
    description: 'Historical sale line items',
    category: 'Transactions',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id'],
  },
  Purchase: {
    description: 'Historical purchase transaction headers',
    category: 'Transactions',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'purchase_number'],
  },
  PurchaseItem: {
    description: 'Historical purchase line items',
    category: 'Transactions',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id'],
  },
  SalesReturn: {
    description: 'Customer sales return headers',
    category: 'Transactions',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'return_number'],
  },
  SalesReturnItem: {
    description: 'Customer sales return line items',
    category: 'Transactions',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id'],
  },
  PurchaseReturn: {
    description: 'Supplier purchase return headers',
    category: 'Transactions',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id', 'return_number'],
  },
  PurchaseReturnItem: {
    description: 'Supplier purchase return line items',
    category: 'Transactions',
    protectedColumns: [],
    supportsUpsert: true,
    defaultMatchingKey: 'id',
    allowedMatchingKeys: ['id'],
  },
};

/**
 * Restricted tables that must NEVER be modified through the generic Excel importer.
 */
const RESTRICTED_TABLES = {
  User: {
    reason: 'Security Critical: Contains password hashes, security privileges, and user account credentials.',
  },
  AuthLog: {
    reason: 'Audit Trail: System authentication event logs are strictly append-only and generated by the server.',
  },
  Settings: {
    reason: 'Configuration Security: System parameters, financial secrets, and tax rates require dedicated configuration UI.',
  },
  PaystackPayment: {
    reason: 'Financial Gateway: Paystack transactions and webhooks are cryptographically signed and managed externally.',
  },
  MigrationBatch: {
    reason: 'Migration Engine: Internal control record for import batch tracking and auditing.',
  },
  MigrationIssue: {
    reason: 'Migration Engine: Diagnostic tracking table for data issues and quarantined rows.',
  },
  LegacyIdMap: {
    reason: 'Migration Engine: Internal identity mapping lookup between legacy keys and NexTill UUIDs.',
  },
  InventoryLog: {
    reason: 'Authoritative Ledger: Immutable physical inventory movement ledger. Stock changes must be driven through verified operations.',
  },
  Payment: {
    reason: 'Financial Integrity: Tender payments are directly bound to POS sale workflows.',
  },
  CustomerPayment: {
    reason: 'Financial Integrity: Accounts Receivable credit payments require double-entry allocation across invoices.',
  },
  CustomerPaymentAllocation: {
    reason: 'Financial Integrity: AR payment-to-invoice allocation lines require balanced ledger workflows.',
  },
  SupplierPayment: {
    reason: 'Financial Integrity: Accounts Payable disbursements require double-entry invoice allocations.',
  },
  SupplierPaymentAllocation: {
    reason: 'Financial Integrity: AP payment-to-purchase allocations require balanced ledger workflows.',
  },
};

let cachedSchema = null;

/**
 * Introspect Prisma DMMF datamodel to build schema-aware metadata.
 */
function buildSchemaMetadata() {
  if (cachedSchema) {
    return cachedSchema;
  }

  const dmmf = Prisma.dmmf.datamodel;
  const enumsMap = new Map();
  for (const e of dmmf.enums) {
    enumsMap.set(e.name, e.values.map((v) => v.name));
  }

  const tables = {};

  for (const model of dmmf.models) {
    const isApproved = Boolean(APPROVED_TABLES_CONFIG[model.name]);
    const isRestricted = Boolean(RESTRICTED_TABLES[model.name]);
    const config = APPROVED_TABLES_CONFIG[model.name] || {};

    const tableName = model.dbName || model.name;
    const modelName = model.name;

    // Collect relation mappings
    const foreignKeys = [];
    const relationFromFieldsSet = new Set();

    for (const field of model.fields) {
      if (field.kind === 'object' && field.relationFromFields && field.relationFromFields.length > 0) {
        for (let i = 0; i < field.relationFromFields.length; i++) {
          const fromFieldName = field.relationFromFields[i];
          const toFieldName = field.relationToFields[i] || 'id';
          relationFromFieldsSet.add(fromFieldName);

          const targetModel = dmmf.models.find((m) => m.name === field.type);
          const targetTable = targetModel ? targetModel.dbName || targetModel.name : field.type;
          const targetField = targetModel ? targetModel.fields.find((f) => f.name === toFieldName) : null;
          const targetColumn = targetField ? targetField.dbName || targetField.name : toFieldName;

          foreignKeys.push({
            fromField: fromFieldName,
            fromColumn: fromFieldName, // mapped below if field has dbName
            targetModel: field.type,
            targetTable,
            targetField: toFieldName,
            targetColumn,
            isRequired: field.isRequired,
          });
        }
      }
    }

    // Process physical scalar/enum fields
    const columns = [];
    const columnsByName = {};
    const columnsByField = {};
    const primaryKeys = [];
    const uniqueKeys = [];

    for (const field of model.fields) {
      if (field.kind !== 'scalar' && field.kind !== 'enum') {
        continue;
      }

      const columnName = field.dbName || field.name;
      const isId = Boolean(field.isId);
      const isUnique = Boolean(field.isUnique || isId);
      const hasDefault = Boolean(field.hasDefaultValue || field.isUpdatedAt);
      const isRequired = Boolean(field.isRequired);
      const isNullable = !isRequired;
      const isEnum = field.kind === 'enum';
      const enumValues = isEnum ? enumsMap.get(field.type) || [] : null;

      let defaultKind = null;
      if (field.default) {
        if (typeof field.default === 'object' && field.default.name) {
          defaultKind = field.default.name.toLowerCase(); // 'uuid(4)', 'autoincrement', 'now'
        } else {
          defaultKind = 'literal';
        }
      } else if (field.isUpdatedAt) {
        defaultKind = 'now';
      }

      const isProtected = (config.protectedColumns || []).includes(columnName);
      const protectedReason = isProtected ? config.protectedColumnRules?.[columnName] || 'Protected field' : null;

      // Update foreign key column name if mapped
      for (const fk of foreignKeys) {
        if (fk.fromField === field.name) {
          fk.fromColumn = columnName;
        }
      }

      const colDef = {
        columnName,
        fieldName: field.name,
        type: field.type,
        isEnum,
        enumValues,
        isRequired,
        isNullable,
        isId,
        isUnique,
        hasDefault,
        defaultKind,
        defaultValue: typeof field.default !== 'object' ? field.default : null,
        isUpdatedAt: Boolean(field.isUpdatedAt),
        isGenerated: isId || hasDefault || Boolean(field.isUpdatedAt),
        isForeignKey: relationFromFieldsSet.has(field.name),
        isProtected,
        protectedReason,
      };

      columns.push(colDef);
      columnsByName[columnName] = colDef;
      columnsByField[field.name] = colDef;

      if (isId) {
        primaryKeys.push(columnName);
      }
      if (isUnique) {
        uniqueKeys.push(columnName);
      }
    }

    // Compound unique keys / primary keys
    if (model.primaryKey && model.primaryKey.fields) {
      for (const f of model.primaryKey.fields) {
        const col = columnsByField[f]?.columnName || f;
        if (!primaryKeys.includes(col)) primaryKeys.push(col);
      }
    }
    if (model.uniqueFields) {
      for (const group of model.uniqueFields) {
        const cols = group.map((f) => columnsByField[f]?.columnName || f);
        uniqueKeys.push(cols);
      }
    }

    tables[modelName] = {
      modelName,
      tableName,
      description: config.description || `${modelName} table`,
      category: config.category || 'General',
      isApproved,
      isRestricted,
      restrictedReason: RESTRICTED_TABLES[modelName]?.reason || null,
      primaryKeys,
      uniqueKeys,
      foreignKeys,
      columns,
      columnsByName,
      columnsByField,
      supportsUpsert: Boolean(config.supportsUpsert),
      defaultMatchingKey: config.defaultMatchingKey || (primaryKeys[0] || 'id'),
      allowedMatchingKeys: config.allowedMatchingKeys || primaryKeys,
      protectedColumns: config.protectedColumns || [],
    };
  }

  cachedSchema = {
    tables,
    approvedList: Object.keys(APPROVED_TABLES_CONFIG),
    restrictedList: Object.keys(RESTRICTED_TABLES),
    enums: Object.fromEntries(enumsMap),
  };

  return cachedSchema;
}

/**
 * Get all approved tables and their metadata
 */
function getApprovedTables() {
  const schema = buildSchemaMetadata();
  return schema.approvedList.map((modelName) => {
    const table = schema.tables[modelName];
    return {
      modelName: table.modelName,
      tableName: table.tableName,
      description: table.description,
      category: table.category,
      primaryKeys: table.primaryKeys,
      defaultMatchingKey: table.defaultMatchingKey,
      allowedMatchingKeys: table.allowedMatchingKeys,
      columnCount: table.columns.length,
      requiredWritableColumnCount: table.columns.filter((c) => c.isRequired && !c.hasDefault && !c.isId).length,
      columns: table.columns.map((c) => ({
        columnName: c.columnName,
        type: c.type,
        isRequired: c.isRequired,
        isNullable: c.isNullable,
        isId: c.isId,
        isUnique: c.isUnique,
        hasDefault: c.hasDefault,
        defaultKind: c.defaultKind,
        isEnum: c.isEnum,
        enumValues: c.enumValues,
        isForeignKey: c.isForeignKey,
        isProtected: c.isProtected,
        protectedReason: c.protectedReason,
      })),
      foreignKeys: table.foreignKeys,
    };
  });
}

/**
 * Get all restricted tables and reasons
 */
function getRestrictedTables() {
  const schema = buildSchemaMetadata();
  return schema.restrictedList.map((modelName) => ({
    modelName,
    tableName: schema.tables[modelName]?.tableName || modelName,
    reason: schema.tables[modelName]?.restrictedReason || 'Restricted table',
  }));
}

/**
 * Lookup table metadata by Prisma model name or physical table name
 */
function getTableMetadata(name) {
  if (!name) return null;
  const schema = buildSchemaMetadata();
  const normalized = name.trim();

  // Try direct model name
  if (schema.tables[normalized]) {
    return schema.tables[normalized];
  }

  // Try case-insensitive or table name match
  for (const model of Object.values(schema.tables)) {
    if (
      model.modelName.toLowerCase() === normalized.toLowerCase() ||
      model.tableName.toLowerCase() === normalized.toLowerCase()
    ) {
      return model;
    }
  }

  return null;
}

module.exports = {
  buildSchemaMetadata,
  getApprovedTables,
  getRestrictedTables,
  getTableMetadata,
  APPROVED_TABLES_CONFIG,
  RESTRICTED_TABLES,
};
