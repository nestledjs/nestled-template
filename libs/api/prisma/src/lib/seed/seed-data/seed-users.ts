/**
 * Seed users for development/testing
 *
 * IMPORTANT: This array is intentionally empty.
 * The first user to register automatically becomes super admin with proper RBAC setup.
 * See auth.service.ts shouldBecomeSuperAdmin() and register() methods.
 *
 * Seeding users here creates incomplete records (no organization, no RBAC permissions).
 * Instead, register users through the normal signup flow to get:
 * - Super admin status for the first user
 * - A default organization created for each user
 * - Owner role and full RBAC permissions
 */
export const seedUsers: Array<{
  id: string
  firstName: string
  lastName: string
  email: string
  displayName: string
  password: string
}> = []
