-- CreateEnum
CREATE TYPE "InfluencerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InfluencerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "influencer_applications" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "socialHandle" TEXT NOT NULL,
    "socialPlatform" TEXT NOT NULL,
    "followerCount" INTEGER NOT NULL,
    "panNumber" TEXT NOT NULL,
    "status" "InfluencerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "influencer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencers" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "socialHandle" TEXT NOT NULL,
    "socialPlatform" TEXT NOT NULL,
    "status" "InfluencerStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "influencers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "influencer_applications_customerId_idx" ON "influencer_applications"("customerId");

-- CreateIndex
CREATE INDEX "influencer_applications_status_createdAt_idx" ON "influencer_applications"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "influencers_customerId_key" ON "influencers"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "influencers_applicationId_key" ON "influencers"("applicationId");

-- CreateIndex
CREATE INDEX "influencers_status_idx" ON "influencers"("status");

-- AddForeignKey
ALTER TABLE "influencer_applications" ADD CONSTRAINT "influencer_applications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencers" ADD CONSTRAINT "influencers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- PARTIAL UNIQUE INDEX — Prisma schema thi aa nathi thai shakto.
--
-- Ek grahak ni ek j vakhte EK j PENDING application hovi joiye. Aa vagar
-- user "Apply" be vaar dabaave (ke network retry thay) to be rows bane chhe
-- ane admin ne e j vyakti be vaar queue ma dekhaay chhe.
--
-- APPROVED/REJECTED rows par aa lagu nathi padtu — history saachavvani chhe,
-- ane reject thaya pachhi fari apply karvu e valid chhe.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "influencer_applications_one_pending_per_customer"
    ON "influencer_applications"("customerId")
    WHERE "status" = 'PENDING';
