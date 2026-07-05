// Export all types and client from Prisma v7 generated files
export * from './lib/prisma-generated/client'
export * from './lib/prisma-generated/models'

// Explicitly export Prisma namespace for better CI compatibility
export { Prisma } from './lib/prisma-generated/client'

// Re-export commonly used Prisma utility types for direct import
// This fixes webpack resolution issues with Prisma.JsonValue etc.
import { Prisma as PrismaNamespace } from './lib/prisma-generated/client'
export type JsonValue = PrismaNamespace.JsonValue
export type JsonObject = PrismaNamespace.JsonObject
export type JsonArray = PrismaNamespace.JsonArray
export type InputJsonValue = PrismaNamespace.InputJsonValue
export type InputJsonObject = PrismaNamespace.InputJsonObject
export type InputJsonArray = PrismaNamespace.InputJsonArray

// Re-export commonly used Prisma runtime error classes for direct import, so app
// code doesn't reach into '@prisma/client/runtime/client' (the resolution path the
// wrapper exists to avoid). Exported as both value and type, matching the client.
export const PrismaClientKnownRequestError = PrismaNamespace.PrismaClientKnownRequestError
export type PrismaClientKnownRequestError = PrismaNamespace.PrismaClientKnownRequestError

export { defaultRoles, defaultPermissions } from './lib/seed/seed-data/seed-roles-permissions'
