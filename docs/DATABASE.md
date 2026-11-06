# Database Schema Documentation

Database: **PostgreSQL 15+**
ORM: **Prisma 5**
All primary keys are UUIDs. Every table has `created_at` and `updated_at` timestamps.

---

## Enums

| Enum | Values |
|---|---|
| `Role` | `ADMIN`, `MANAGER`, `CASHIER` |
| `PaymentMethod` | `CASH`, `MOBILE_MONEY`, `CARD` |
| `PaymentStatus` | `COMPLETED`, `REFUNDED`, `PENDING` |
| `InventoryChangeType` | `SALE`, `RESTOCK`, `ADJUSTMENT`, `RETURN` |

---

## Tables

### User
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `username` | String | Unique |
| `email` | String | Unique |
| `password_hash` | String | bcrypt cost 12 |
| `full_name` | String | |
| `role` | Role | Default: CASHIER |
| `is_active` | Boolean | Default: true |
| `failed_login_attempts` | Int | Default: 0, locked after 5 |
| `locked_until` | DateTime? | Null = not locked |

---

### Category
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | String | Unique |
| `description` | String? | |

---

### Product
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | String | |
| `sku` | String | Unique — indexed |
| `barcode` | String? | Unique — indexed |
| `category_id` | UUID FK | → Category |
| `price` | Decimal(10,2) | |
| `cost_price` | Decimal(10,2)? | Used in profit reports |
| `quantity` | Int | >= 0 |
| `low_stock_threshold` | Int | Default: 10 |
| `image_url` | String? | Served from /uploads/products/ |
| `is_active` | Boolean | Soft-delete flag |

---

### Customer
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | String | |
| `phone` | String? | Unique — indexed |
| `email` | String? | Unique |
| `address` | String? | |
| `loyalty_points` | Int | Default: 0, auto-incremented on sale |

---

### Sale
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `transaction_id` | String | Unique, format: `TXN-YYYYMMDD-NNNN` — indexed |
| `user_id` | UUID FK | → User (cashier) |
| `customer_id` | UUID FK? | → Customer, ON DELETE SET NULL |
| `subtotal` | Decimal(10,2) | Before discount and tax |
| `discount_amount` | Decimal(10,2) | Default: 0 |
| `tax_amount` | Decimal(10,2) | Default: 0 |
| `total_amount` | Decimal(10,2) | Final charged amount |
| `payment_method` | PaymentMethod | |
| `payment_status` | PaymentStatus | Default: COMPLETED |
| `loyalty_points_earned` | Int | Default: 0. Points awarded by this sale; a refund reverses exactly this many |
| `refund_requested_at` | DateTime? | Set while a Paystack refund awaits webhook confirmation |
| `refund_requested_by` | String? | User who requested the pending Paystack refund |
| `notes` | String? | |

Indexes: `transaction_id`, `created_at`

---

### SaleItem
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `sale_id` | UUID FK | → Sale, ON DELETE CASCADE |
| `product_id` | UUID FK | → Product, ON DELETE RESTRICT |
| `quantity` | Int | |
| `unit_price` | Decimal(10,2) | Price at time of sale (historical) |
| `discount` | Decimal(10,2) | Item-level discount, Default: 0 |
| `total` | Decimal(10,2) | Line total |

---

### Payment
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `sale_id` | UUID FK | → Sale, ON DELETE CASCADE |
| `method` | PaymentMethod | |
| `amount_paid` | Decimal(10,2) | |
| `change_given` | Decimal(10,2) | Default: 0, cash only |
| `reference` | String? | Mobile money / card ref |

---

### InventoryLog
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `product_id` | UUID FK | → Product, ON DELETE RESTRICT |
| `change_type` | InventoryChangeType | |
| `quantity_change` | Int | Positive = addition, negative = deduction |
| `previous_quantity` | Int | Stock before change |
| `new_quantity` | Int | Stock after change |
| `user_id` | UUID FK | → User (who made the change) |
| `notes` | String? | |

---

### AuthLog
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK? | → User, ON DELETE SET NULL |
| `event_type` | String | `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, etc. |
| `ip_address` | String? | |
| `user_agent` | String? | |
| `details` | String? | |

---

### Settings
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `key` | String | Unique |
| `value` | String | |

**Default keys:** `store_name`, `store_address`, `store_phone`, `tax_rate`, `loyalty_points_rate`, `currency_symbol`, `receipt_footer`

---

## Key Design Decisions

- **Soft deletes on Products** — `is_active = false` instead of hard delete, preserving sale history integrity (`ON DELETE RESTRICT` on `SaleItem.product_id`).
- **Historical unit_price** — `SaleItem.unit_price` stores the price at the time of sale, not a FK to the current product price, so reports remain accurate after price changes.
- **Atomic sale transactions** — Creating a sale, its items, the payment record, and stock deductions all happen in a single Prisma `$transaction`. If any step fails, everything rolls back.
- **Loyalty points** — Awarded automatically inside the sale transaction at `1 point per GHS {loyalty_points_rate}` spent. The points are stored on the sale (`loyalty_points_earned`), so a refund reverses exactly what was earned even if the rate has changed since.
- **Account lockout** — `failed_login_attempts` is incremented on every failed login. When it reaches 5, `locked_until` is set to 30 minutes in the future and logins are refused until then. Once the lock expires, the count starts again from zero. An Admin can unlock the account earlier with `POST /api/users/:id/unlock`. A successful login resets the count.
