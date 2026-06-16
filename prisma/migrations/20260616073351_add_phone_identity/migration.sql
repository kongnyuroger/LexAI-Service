-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'WHATSAPP');

-- AlterTable: email/passwordHash become optional, add phoneNumber + authProvider
ALTER TABLE "User"
  ALTER COLUMN "email" DROP NOT NULL,
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL';

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- Prisma 7 has no @@check attribute (see schema.prisma comment on User), so
-- this constraint is added by hand. It is the DB-level backstop; application
-- code in AuthService / the WhatsApp-link flow is the primary safeguard.
ALTER TABLE "User" ADD CONSTRAINT "email_or_phone_required"
  CHECK ("email" IS NOT NULL OR "phoneNumber" IS NOT NULL);
