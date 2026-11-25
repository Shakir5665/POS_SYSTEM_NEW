ALTER TYPE "Role" ADD VALUE 'SUPERADMIN';

ALTER TABLE "User"
ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "SystemControl" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "access_enabled" BOOLEAN NOT NULL DEFAULT true,
    "owner_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemControl_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemControl_owner_user_id_key" ON "SystemControl"("owner_user_id");
ALTER TABLE "SystemControl"
ADD CONSTRAINT "SystemControl_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SystemControl"
ADD CONSTRAINT "SystemControl_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SystemControl" ("id", "access_enabled", "updated_at")
VALUES ('global', true, CURRENT_TIMESTAMP);
