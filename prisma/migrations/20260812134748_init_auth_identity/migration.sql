-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('IMPORTED', 'ACTIVE', 'MERGED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'LINK_IDENTITY');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "primaryPhone" TEXT,
    "primaryEmail" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "passwordHash" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "shopifyCustomerId" TEXT,
    "mergedIntoId" UUID,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_identities" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_customer_links" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "matchedVia" TEXT NOT NULL,
    "matchedValue" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_customer_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "identifierType" "IdentifierType" NOT NULL,
    "identifier" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN',
    "customerId" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "deviceId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_primaryPhone_key" ON "customers"("primaryPhone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_primaryEmail_key" ON "customers"("primaryEmail");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopifyCustomerId_key" ON "customers"("shopifyCustomerId");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customer_identities_customerId_idx" ON "customer_identities"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identities_type_value_key" ON "customer_identities"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_customer_links_shopifyCustomerId_key" ON "shopify_customer_links"("shopifyCustomerId");

-- CreateIndex
CREATE INDEX "shopify_customer_links_customerId_idx" ON "shopify_customer_links"("customerId");

-- CreateIndex
CREATE INDEX "otp_codes_identifier_purpose_expiresAt_idx" ON "otp_codes"("identifier", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "otp_codes_expiresAt_idx" ON "otp_codes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_customerId_idx" ON "refresh_tokens"("customerId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_customerId_idx" ON "device_tokens"("customerId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_customer_links" ADD CONSTRAINT "shopify_customer_links_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
