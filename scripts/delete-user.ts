/**
 * Delete User Script
 *
 * Safely deletes a user and all their related data.
 *
 * Run with: pnpm tsx scripts/delete-user.ts <email>
 * Example: pnpm tsx scripts/delete-user.ts john@example.com
 */

import 'dotenv/config'
import { PrismaClient } from '@nestled-template/api/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

const adapter = new PrismaPg({ connectionString: databaseUrl })
const prisma = new PrismaClient({ adapter })

async function deleteUser(email: string) {
  console.log(`\n🔍 Looking for user: ${email}`)

  const user = await prisma.user.findFirst({
    where: {
      emails: {
        some: {
          email: email.toLowerCase().trim(),
        },
      },
    },
    include: {
      emails: true,
      organizationMemberships: true,
    },
  })

  if (!user) {
    console.log(`❌ User not found: ${email}`)
    return
  }

  console.log(`\n👤 Found user:`)
  console.log(`   ID: ${user.id}`)
  console.log(`   Name: ${user.firstName} ${user.lastName}`)
  console.log(`   Emails: ${user.emails.map(e => e.email).join(', ')}`)
  console.log(`   Organizations: ${user.organizationMemberships.length}`)

  console.log(`\n🗑️  Deleting user and all related data...`)

  try {
    // Delete in order to respect foreign key constraints

    // 1. Delete user sessions
    const sessions = await prisma.userSession.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${sessions.count} sessions`)

    // 2. Delete API tokens
    const apiTokens = await prisma.apiToken.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${apiTokens.count} API tokens`)

    // 3. Delete security events
    const securityEvents = await prisma.securityEvent.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${securityEvents.count} security events`)

    // 4. Delete user preferences
    const preferences = await prisma.userPreference.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${preferences.count} preferences`)

    // 5. Delete OAuth accounts
    const oauthAccounts = await prisma.oAuthAccount.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${oauthAccounts.count} OAuth accounts`)

    // 6. Delete organization invitations sent by this user
    const invites = await prisma.invite.deleteMany({
      where: { inviterId: user.id },
    })
    console.log(`   ✅ Deleted ${invites.count} invitations`)

    // 7. Delete organization memberships
    const memberships = await prisma.organizationMember.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${memberships.count} organization memberships`)

    // 8. Delete user emails
    const emails = await prisma.userEmail.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${emails.count} email addresses`)

    // 9. Finally, delete the user
    await prisma.user.delete({
      where: { id: user.id },
    })
    console.log(`   ✅ Deleted user account`)

    console.log(`\n✨ User successfully deleted!`)
    console.log(`\nYou can now register again at: /public/register`)
  } catch (error) {
    console.error(`\n❌ Error deleting user:`, error)
    throw error
  }
}

async function main() {
  const email = process.argv[2]

  if (!email) {
    console.error('❌ Error: Email address required')
    console.log('\nUsage: pnpm tsx scripts/delete-user.ts <email>')
    console.log('Example: pnpm tsx scripts/delete-user.ts john@example.com')
    process.exit(1)
  }

  await deleteUser(email)
}

main()
  .catch(e => {
    console.error('💥 Script failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
