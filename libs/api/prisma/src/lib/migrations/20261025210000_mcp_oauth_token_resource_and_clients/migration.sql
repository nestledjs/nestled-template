-- MCP OAuth: bind newly issued tokens to their resource, and store Dynamic Client Registrations.
-- Both changes are additive. Existing API tokens get resource NULL and keep working everywhere.

-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN     "resource" TEXT;

-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientName" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpOAuthClient_lastUsedAt_idx" ON "McpOAuthClient"("lastUsedAt");
