import 'dotenv/config'
import { PrismaClient } from '../prisma-generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { countries } from './seed-data/iso-3166-countries'
import { seedUsers } from './seed-data/seed-users'
import { defaultPermissions, defaultRoles } from './seed-data/seed-roles-permissions'
import { hashSync } from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! })
const prisma = new PrismaClient({ adapter })
async function reconnectOrgRolePermissions(prisma: PrismaClient): Promise<number> {
  const allPermissions = await prisma.permission.findMany()
  const existingOrgRoles = await prisma.role.findMany({
    where: { organizationId: { not: null } },
    include: { permissions: true },
  })
  let fixedCount = 0
  for (const role of existingOrgRoles) {
    const template = defaultRoles.find(t => t.name === role.name)
    if (!template) continue
    const existingKeys = new Set(role.permissions.map(p => `${p.subject}:${p.action}`))
    const toConnect = allPermissions.filter(
      p =>
        template.permissions.includes(`${p.subject}:${p.action}`) &&
        !existingKeys.has(`${p.subject}:${p.action}`),
    )
    if (toConnect.length === 0) continue
    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: { connect: toConnect.map(p => ({ id: p.id })) } },
    })
    fixedCount++
  }
  return fixedCount
}

async function main() {
  // Seed countries
  console.log('Seeding countries...')
  for (const country of countries) {
    await prisma.country.upsert({
      where: { alpha2: country['alpha-2'] },
      update: {},
      create: {
        name: country.name,
        alpha2: country['alpha-2'],
        alpha3: country['alpha-3'],
        countryCode: country['country-code'],
        iso3166_2: country['iso_3166-2'],
        region: country.region,
        subRegion: country['sub-region'],
        intermediateRegion: country['intermediate-region'],
        regionCode: country['region-code'],
        subRegionCode: country['sub-region-code'],
        intermediateRegionCode: country['intermediate-region-code'],
      },
    })
  }
  console.log('✓ Countries seeded')

  // Seed global permissions (no organizationId = available to all organizations)
  console.log('Seeding permissions...')
  for (const permission of defaultPermissions) {
    await prisma.permission.upsert({
      where: { action_subject: { action: permission.action, subject: permission.subject } },
      update: {},
      create: permission,
    })
  }
  console.log(`✓ ${defaultPermissions.length} permissions seeded`)

  // Fix any existing org roles that were created before permissions were seeded
  console.log('Reconnecting permissions to existing org roles...')
  const fixedCount = await reconnectOrgRolePermissions(prisma)
  console.log(`✓ Fixed ${fixedCount} org role(s) with missing permissions`)

  // Note: Roles are organization-specific and will be created when organizations are created
  // See the auth service register function for automatic role creation

  // Seed users (without role field - using isSuperAdmin instead)
  console.log('Seeding users...')
  for (const user of seedUsers) {
    try {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {},
        create: {
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          emails: {
            create: {
              email: user.email,
              primary: true,
            },
          },
          password: hashSync(user.password, 10),
          isSuperAdmin: user.email === 'admin@example.com', // Make default admin a super admin
        },
      })
      console.log(`✓ User ${user.displayName} seeded`)
    } catch (e) {
      // Handle Prisma v7 unique constraint violations (P2002)
      // The error format changed in v7 with driver adapters
      const isPrismaError = (e as any).code === 'P2002'
      const isDisplayNameViolation =
        (e as any).meta?.target?.includes?.('displayName') ||
        String((e as any).message).includes('displayName') ||
        String((e as any).meta?.driverAdapterError).includes('UniqueConstraintViolation')

      if (isPrismaError && isDisplayNameViolation) {
        console.log(`  User with displayName "${user.displayName}" already exists. Skipping.`)
      } else {
        throw e
      }
    }
  }
}

// Export for use in other modules
export { defaultRoles, defaultPermissions }
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async e => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
