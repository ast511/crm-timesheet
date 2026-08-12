-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('pending_activation', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "AccountTokenType" AS ENUM ('activation', 'password_reset');

-- AlterTable
-- An account created by an administrator has no password until its owner
-- follows the activation link and chooses one, so the column has to admit that
-- state. Widening a NOT NULL to nullable rewrites no rows and cannot fail.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
-- `status` replaces `is_active`. Added with the schema default first, then
-- back-filled, then the old column dropped — three statements in one
-- transaction, so no moment exists in which a row has neither.
ALTER TABLE "users" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'pending_activation';

-- Every account that exists before this migration was created through the old
-- `POST /users`, which required a password, so none of them is genuinely
-- pending: `is_active` is the whole of what was known about them, and it maps
-- onto exactly two of the three states.
UPDATE "users" SET "status" = CASE WHEN "is_active" THEN 'active'::"AccountStatus" ELSE 'disabled'::"AccountStatus" END;

ALTER TABLE "users" DROP COLUMN "is_active";

-- CreateTable
CREATE TABLE "account_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "AccountTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_tokens_token_hash_key" ON "account_tokens"("token_hash");

-- CreateIndex
-- One outstanding link per purpose per account: a resend upserts on this pair,
-- so the previous link stops working the moment the new one is written.
CREATE UNIQUE INDEX "account_tokens_user_id_type_key" ON "account_tokens"("user_id", "type");

-- AddForeignKey
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
