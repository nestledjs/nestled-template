import 'dotenv/config'
import { PrismaClient } from '../prisma-generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { countries } from './seed-data/iso-3166-countries'
import { seedUsers } from './seed-data/seed-users'
import { defaultPermissions, defaultRoles } from './seed-data/seed-roles-permissions'
import { hashSync } from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! })
const prisma = new PrismaClient({ adapter })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function valueIncludes(value: unknown, search: string): boolean {
  if (typeof value === 'string') {
    return value.includes(search)
  }

  if (Array.isArray(value)) {
    return value.some(item => item === search || valueIncludes(item, search))
  }

  if (isRecord(value)) {
    try {
      return JSON.stringify(value).includes(search)
    } catch {
      return false
    }
  }

  return false
}

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

function isDuplicateDisplayNameError(error: unknown): boolean {
  const errorRecord = isRecord(error) ? error : {}
  const errorMeta = isRecord(errorRecord.meta) ? errorRecord.meta : {}
  const isPrismaError = errorRecord.code === 'P2002'

  return (
    isPrismaError &&
    (valueIncludes(errorMeta.target, 'displayName') ||
      valueIncludes(errorRecord.message, 'displayName') ||
      valueIncludes(errorMeta.driverAdapterError, 'UniqueConstraintViolation'))
  )
}

async function seedCountries(): Promise<void> {
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
}

async function seedGlobalPermissions(): Promise<void> {
  console.log('Seeding permissions...')
  for (const permission of defaultPermissions) {
    await prisma.permission.upsert({
      where: { action_subject: { action: permission.action, subject: permission.subject } },
      update: {},
      create: permission,
    })
  }
  console.log(`✓ ${defaultPermissions.length} permissions seeded`)
}

async function seedInitialUsers(): Promise<void> {
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
          isSuperAdmin: user.email === 'admin@example.com',
        },
      })
      console.log(`✓ User ${user.displayName} seeded`)
    } catch (e) {
      if (isDuplicateDisplayNameError(e)) {
        console.log(`  User with displayName "${user.displayName}" already exists. Skipping.`)
        continue
      }

      throw e
    }
  }
}

async function main() {
  await seedCountries()
  await seedGlobalPermissions()

  console.log('Reconnecting permissions to existing org roles...')
  const fixedCount = await reconnectOrgRolePermissions(prisma)
  console.log(`✓ Fixed ${fixedCount} org role(s) with missing permissions`)

  // Note: Roles are organization-specific and will be created when organizations are created
  // See the auth service register function for automatic role creation

  await seedInitialUsers()
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
