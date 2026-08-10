/**
 * Platform permission definitions are application code, not administrator-authored data.
 *
 * Roles may compose these permissions, but management APIs reject unknown keys. Keep descriptions
 * written for administrators because the platform access-control console displays them directly.
 */
export const platformPermissions = [
  {
    key: 'platform.*',
    namespace: 'platform',
    action: '*',
    description: 'Unrestricted platform administration, including future platform capabilities',
  },
  {
    key: 'platform.access-control.read',
    namespace: 'platform.access-control',
    action: 'read',
    description: 'View platform roles, permissions, and role assignments',
  },
  {
    key: 'platform.access-control.manage',
    namespace: 'platform.access-control',
    action: 'manage',
    description: 'Create and update platform roles and their user assignments',
  },
  {
    key: 'platform.analytics.read',
    namespace: 'platform.analytics',
    action: 'read',
    description: 'View platform-wide analytics',
  },
  {
    key: 'platform.audit.read',
    namespace: 'platform.audit',
    action: 'read',
    description: 'View platform-wide audit logs',
  },
  {
    key: 'platform.organizations.read',
    namespace: 'platform.organizations',
    action: 'read',
    description: 'View all organizations on the platform',
  },
  {
    key: 'platform.security.read',
    namespace: 'platform.security',
    action: 'read',
    description: 'View platform-wide login and security events',
  },
  {
    key: 'platform.users.read',
    namespace: 'platform.users',
    action: 'read',
    description: 'View platform users and account details',
  },
  {
    key: 'platform.users.manage',
    namespace: 'platform.users',
    action: 'manage',
    description: 'Activate, deactivate, and administer platform user accounts',
  },
  {
    key: 'platform.users.emulate',
    namespace: 'platform.users',
    action: 'emulate',
    description: 'Emulate another user subject to the platform privilege ceiling',
  },
] as const

export const superAdministratorRole = {
  key: 'system.super-administrator',
  name: 'Super Administrator',
  description: 'Break-glass access to every platform capability',
  isSystem: true,
  permissions: ['platform.*'],
} as const
