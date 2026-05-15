/**
 * Default roles and permissions for multi-tenant organizations
 *
 * Permissions follow the format: "subject:action"
 * - subject: The resource being accessed (e.g., "member", "billing", "organization")
 * - action: The operation being performed (e.g., "read", "create", "update", "delete", "manage")
 */

export const defaultPermissions = [
  // Organization management
  { action: 'read', subject: 'organization', description: 'View organization details' },
  { action: 'update', subject: 'organization', description: 'Update organization settings' },
  { action: 'delete', subject: 'organization', description: 'Delete organization' },

  // Member management
  { action: 'read', subject: 'member', description: 'View organization members' },
  { action: 'invite', subject: 'member', description: 'Invite new members' },
  { action: 'update', subject: 'member', description: 'Update member roles' },
  { action: 'remove', subject: 'member', description: 'Remove members from organization' },

  // Role management
  { action: 'read', subject: 'role', description: 'View roles' },
  { action: 'create', subject: 'role', description: 'Create custom roles' },
  { action: 'update', subject: 'role', description: 'Update role permissions' },
  { action: 'delete', subject: 'role', description: 'Delete custom roles' },

  // Billing management
  { action: 'read', subject: 'billing', description: 'View billing information' },
  { action: 'manage', subject: 'billing', description: 'Manage subscriptions and payment methods' },

  // Team management
  { action: 'read', subject: 'team', description: 'View teams' },
  { action: 'create', subject: 'team', description: 'Create teams' },
  { action: 'update', subject: 'team', description: 'Update teams' },
  { action: 'delete', subject: 'team', description: 'Delete teams' },

  // Audit logs
  { action: 'read', subject: 'audit', description: 'View audit logs' },
]

export const defaultRoles = [
  {
    name: 'Owner',
    description: 'Full access to all organization features',
    permissions: [
      'organization:read',
      'organization:update',
      'organization:delete',
      'member:read',
      'member:invite',
      'member:update',
      'member:remove',
      'role:read',
      'role:create',
      'role:update',
      'role:delete',
      'billing:read',
      'billing:manage',
      'team:read',
      'team:create',
      'team:update',
      'team:delete',
      'audit:read',
    ],
  },
  {
    name: 'Admin',
    description: 'Can invite members and manage teams, but cannot change member roles, remove members, modify organization settings, billing, or delete organization',
    permissions: [
      'organization:read',
      'member:read',
      'member:invite',
      'role:read',
      'team:read',
      'team:create',
      'team:update',
      'team:delete',
      'billing:read',
      'audit:read',
    ],
  },
  {
    name: 'Member',
    description: 'Basic member with read access',
    permissions: [
      'organization:read',
      'member:read',
      'role:read',
      'team:read',
    ],
  },
]