/**
 * Diagnostic script to check RBAC configuration for a specific organization
 */

import 'dotenv/config'
import { PrismaClient } from '../prisma-generated/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! })
const prisma = new PrismaClient({ adapter })

async function diagnoseRBAC() {
  console.log('=== RBAC Diagnostic ===\n')

  // Find the user's organization (Pirate & Fox LLC)
  const org = await prisma.organization.findFirst({
    where: { name: 'Pirate & Fox LLC' },
    include: {
      roles: {
        include: {
          permissions: true,
        },
      },
      members: {
        include: {
          user: true,
          role: {
            include: {
              permissions: true,
            },
          },
        },
      },
    },
  })

  if (!org) {
    console.log('Organization not found!')
    return
  }

  console.log(`Organization: ${org.name} (${org.id})\n`)

  console.log('=== ROLES ===')
  for (const role of org.roles) {
    console.log(`\nRole: ${role.name} (${role.id})`)
    console.log(`  Permissions (${role.permissions.length}):`)
    for (const perm of role.permissions) {
      console.log(`    - ${perm.subject}:${perm.action}`)
    }
  }

  console.log('\n=== MEMBERS ===')
  for (const member of org.members) {
    console.log(`\nMember: ${member.user.displayName || member.user.firstName || member.userId}`)
    console.log(`  User ID: ${member.user.id}`)
    console.log(`  Role ID on membership: ${member.roleId || 'NULL'}`)
    if (member.role) {
      console.log(`  Role Name: ${member.role.name}`)
      console.log(`  Role Permissions (${member.role.permissions.length}):`)
      for (const perm of member.role.permissions) {
        console.log(`    - ${perm.subject}:${perm.action}`)
      }
    } else {
      console.log('  ⚠ NO ROLE ASSIGNED!')
    }
  }

  // Check if Owner role has permissions
  const ownerRole = org.roles.find(r => r.name === 'Owner')
  if (ownerRole?.permissions.length === 0) {
    console.log('\n⚠ WARNING: Owner role has NO PERMISSIONS!')
    console.log('This is likely the root cause of the permission issues.')
  }

  console.log('\n=== Done ===')
}

try {
  await diagnoseRBAC()
  await prisma.$disconnect()
} catch (e) {
  console.error('Error:', e)
  await prisma.$disconnect()
  process.exit(1)
}
