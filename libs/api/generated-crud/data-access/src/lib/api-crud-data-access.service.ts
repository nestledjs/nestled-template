import { BadRequestException, Injectable } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import graphqlFields from 'graphql-fields'
import type { GraphQLResolveInfo } from 'graphql'
import { DATABASE_MODELS_BY_NAME, DatabaseField, DatabaseModel } from './database-models'
import * as dto from './dto'

type FieldTree = Record<string, unknown>
type SelectTree = Record<string, true | { select: SelectTree }>

function getNamedType(type: GraphQLResolveInfo['returnType']): string {
  if ('ofType' in type) return getNamedType(type.ofType)
  return type.name
}

function getModelFromTypeName(typeName: string): DatabaseModel | undefined {
  return DATABASE_MODELS_BY_NAME[typeName]
}

const isFieldTree = (value: unknown): value is FieldTree =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function buildSelectTree(fieldTree: FieldTree, model: DatabaseModel): SelectTree {
  const result: SelectTree = {}

  for (const key in fieldTree) {
    const field = model.fields.find((candidate: DatabaseField) => candidate.name === key)
    if (!field) continue

    if (field.relationName && isFieldTree(fieldTree[key])) {
      const relatedModel = DATABASE_MODELS_BY_NAME[field.type]
      if (relatedModel) {
        result[key] = {
          select: buildSelectTree(fieldTree[key], relatedModel),
        }
      }
    } else {
      result[key] = true
    }
  }

  return result
}

/** Internal selection compiler for generated admin CRUD. Deliberately not exported. */
function buildAdminSelect(info: GraphQLResolveInfo): SelectTree {
  const returnTypeName = getNamedType(info.returnType)
  const model = getModelFromTypeName(returnTypeName)

  if (!model) {
    throw new Error(
      `Model "${returnTypeName}" not found in generated CRUD metadata. Run the CRUD generator.`,
    )
  }

  return buildSelectTree(graphqlFields(info) as FieldTree, model)
}

interface FilterRelation {
  targetModel: string
  isList: boolean
}

type FilterObject = Record<string, unknown>

const FILTER_RELATIONS = {
  Address: {
    country: {
      targetModel: 'Country',
      isList: false,
    },
    user: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
  },
  ApiToken: {
    user: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
  },
  AuditLog: {
    user: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
  },
  Country: {
    addresses: {
      targetModel: 'Address',
      isList: true,
    },
  },
  Email: {
    user: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
  },
  Invite: {
    inviter: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
    role: {
      targetModel: 'Role',
      isList: false,
    },
  },
  Link: {
    user: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
  },
  LoginAttempt: {
    user: {
      targetModel: 'User',
      isList: false,
    },
  },
  OAuthAccount: {
    user: {
      targetModel: 'User',
      isList: false,
    },
  },
  Organization: {
    logo: {
      targetModel: 'StoredFile',
      isList: false,
    },
    emails: {
      targetModel: 'Email',
      isList: true,
    },
    links: {
      targetModel: 'Link',
      isList: true,
    },
    phoneNumbers: {
      targetModel: 'PhoneNumber',
      isList: true,
    },
    images: {
      targetModel: 'StoredFile',
      isList: true,
    },
    members: {
      targetModel: 'OrganizationMember',
      isList: true,
    },
    addresses: {
      targetModel: 'Address',
      isList: true,
    },
    invites: {
      targetModel: 'Invite',
      isList: true,
    },
    AuditLog: {
      targetModel: 'AuditLog',
      isList: true,
    },
    Team: {
      targetModel: 'Team',
      isList: true,
    },
    subscription: {
      targetModel: 'Subscription',
      isList: false,
    },
    roles: {
      targetModel: 'Role',
      isList: true,
    },
    apiTokens: {
      targetModel: 'ApiToken',
      isList: true,
    },
  },
  OrganizationMember: {
    role: {
      targetModel: 'Role',
      isList: false,
    },
    user: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
  },
  Permission: {
    roles: {
      targetModel: 'Role',
      isList: true,
    },
  },
  PhoneNumber: {
    user: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
  },
  Plan: {
    subscriptions: {
      targetModel: 'Subscription',
      isList: true,
    },
  },
  Role: {
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
    permissions: {
      targetModel: 'Permission',
      isList: true,
    },
    members: {
      targetModel: 'OrganizationMember',
      isList: true,
    },
    teamMembers: {
      targetModel: 'TeamMember',
      isList: true,
    },
    invites: {
      targetModel: 'Invite',
      isList: true,
    },
  },
  SecurityEvent: {
    user: {
      targetModel: 'User',
      isList: false,
    },
  },
  Subscription: {
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
    plan: {
      targetModel: 'Plan',
      isList: false,
    },
  },
  Team: {
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
    members: {
      targetModel: 'TeamMember',
      isList: true,
    },
  },
  TeamMember: {
    team: {
      targetModel: 'Team',
      isList: false,
    },
    user: {
      targetModel: 'User',
      isList: false,
    },
    role: {
      targetModel: 'Role',
      isList: false,
    },
  },
  StoredFile: {
    user: {
      targetModel: 'User',
      isList: false,
    },
    organization: {
      targetModel: 'Organization',
      isList: false,
    },
    userAvatar: {
      targetModel: 'User',
      isList: false,
    },
    organizationLogo: {
      targetModel: 'Organization',
      isList: false,
    },
  },
  User: {
    emails: {
      targetModel: 'Email',
      isList: true,
    },
    links: {
      targetModel: 'Link',
      isList: true,
    },
    phoneNumbers: {
      targetModel: 'PhoneNumber',
      isList: true,
    },
    avatar: {
      targetModel: 'StoredFile',
      isList: false,
    },
    images: {
      targetModel: 'StoredFile',
      isList: true,
    },
    organizations: {
      targetModel: 'OrganizationMember',
      isList: true,
    },
    addresses: {
      targetModel: 'Address',
      isList: true,
    },
    invitesSent: {
      targetModel: 'Invite',
      isList: true,
    },
    activeSessions: {
      targetModel: 'UserSession',
      isList: true,
    },
    loginAttempts: {
      targetModel: 'LoginAttempt',
      isList: true,
    },
    AuditLog: {
      targetModel: 'AuditLog',
      isList: true,
    },
    UserPreference: {
      targetModel: 'UserPreference',
      isList: true,
    },
    TeamMember: {
      targetModel: 'TeamMember',
      isList: true,
    },
    SecurityEvent: {
      targetModel: 'SecurityEvent',
      isList: true,
    },
    apiTokens: {
      targetModel: 'ApiToken',
      isList: true,
    },
    oAuthAccounts: {
      targetModel: 'OAuthAccount',
      isList: true,
    },
  },
  UserPreference: {
    user: {
      targetModel: 'User',
      isList: false,
    },
  },
  UserSession: {
    user: {
      targetModel: 'User',
      isList: false,
    },
  },
} as Record<string, Record<string, FilterRelation>>

const LOGICAL_FILTER_OPERATORS = ['AND', 'OR', 'NOT'] as const
const LIST_RELATION_OPERATORS = ['some', 'every', 'none'] as const

function isFilterObject(value: unknown): value is FilterObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeLogicalFilters(
  modelName: string,
  filter: FilterObject,
  normalized: FilterObject,
): void {
  for (const operator of LOGICAL_FILTER_OPERATORS) {
    const operands = filter[operator]
    if (Array.isArray(operands)) {
      normalized[operator] = operands.map(operand => normalizeModelFilter(modelName, operand))
    }
  }
}

function normalizeListRelationFilter(targetModel: string, filter: FilterObject): FilterObject {
  const normalized = { ...filter }
  for (const operator of LIST_RELATION_OPERATORS) {
    if (filter[operator] !== undefined) {
      normalized[operator] = normalizeModelFilter(targetModel, filter[operator])
    }
  }
  return normalized
}

function directRelationEntries(filter: FilterObject): [string, unknown][] {
  return Object.entries(filter).filter(
    ([name, value]) => name !== 'is' && name !== 'isNot' && value !== undefined,
  )
}

function normalizeNullableModelFilter(modelName: string, value: unknown): unknown {
  return value === null ? null : normalizeModelFilter(modelName, value)
}

function normalizeToOneRelationFilter(targetModel: string, filter: FilterObject): FilterObject {
  const hasIs = filter['is'] !== undefined
  const hasIsNot = filter['isNot'] !== undefined
  const directEntries = directRelationEntries(filter)
  const directFilter = Object.fromEntries(directEntries)

  if (!hasIs && !hasIsNot) {
    return directEntries.length === 0 ? {} : { is: normalizeModelFilter(targetModel, directFilter) }
  }

  const normalized: FilterObject = {}
  if (hasIs) normalized['is'] = normalizeNullableModelFilter(targetModel, filter['is'])
  if (hasIsNot) normalized['isNot'] = normalizeNullableModelFilter(targetModel, filter['isNot'])
  if (directEntries.length === 0) return normalized

  if (filter['is'] === null) {
    throw new BadRequestException(
      'A to-one relation filter cannot combine is: null with direct field predicates',
    )
  }

  const normalizedDirect = normalizeModelFilter(targetModel, directFilter)
  normalized['is'] = hasIs ? { AND: [normalized['is'], normalizedDirect] } : normalizedDirect
  return normalized
}

function normalizeRelationFilters(
  modelName: string,
  filter: FilterObject,
  normalized: FilterObject,
): void {
  for (const [fieldName, relation] of Object.entries(FILTER_RELATIONS[modelName] ?? {})) {
    const relationFilter = filter[fieldName]
    if (!isFilterObject(relationFilter)) continue

    normalized[fieldName] = relation.isList
      ? normalizeListRelationFilter(relation.targetModel, relationFilter)
      : normalizeToOneRelationFilter(relation.targetModel, relationFilter)
  }
}

function normalizeModelFilter(modelName: string, value: unknown): unknown {
  if (!isFilterObject(value)) return value

  const normalized = { ...value }
  normalizeLogicalFilters(modelName, value, normalized)
  normalizeRelationFilters(modelName, value, normalized)
  return normalized
}

function normalizeListInputFilters<T extends { filters?: unknown }>(
  modelName: string,
  input?: T,
): T | undefined {
  if (!input || input.filters === undefined) return input
  return { ...input, filters: normalizeModelFilter(modelName, input.filters) } as T
}

@Injectable()
export class ApiCrudDataAccessService {
  constructor(private readonly data: ApiCoreDataAccessService) {}

  async createAddress(info: GraphQLResolveInfo, input: dto.CreateAddressInput) {
    const { countryId, userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      country: { ids: countryId, isVirtual: false, isList: false, isRequired: false },
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['address'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async addresses(info: GraphQLResolveInfo, input?: dto.ListAddressInput) {
    return this.data['address'].findMany({
      ...this.data.filter(normalizeListInputFilters('Address', input)),
      select: buildAdminSelect(info),
    })
  }

  async addressesCount(input?: dto.ListAddressInput) {
    const total = await this.data['address'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Address', input))
    const filteredTotal = await this.data['address'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async address(info: GraphQLResolveInfo, id: string) {
    return this.data['address'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateAddress(info: GraphQLResolveInfo, id: string, input: dto.UpdateAddressInput) {
    const { countryId, userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      country: { ids: countryId, isVirtual: false, isList: false, isRequired: false },
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['address'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteAddress(id: string) {
    return this.data['address'].delete({
      where: { id },
    })
  }

  async createApiToken(info: GraphQLResolveInfo, input: dto.CreateApiTokenInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['apiToken'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async apiTokens(info: GraphQLResolveInfo, input?: dto.ListApiTokenInput) {
    return this.data['apiToken'].findMany({
      ...this.data.filter(normalizeListInputFilters('ApiToken', input)),
      select: buildAdminSelect(info),
    })
  }

  async apiTokensCount(input?: dto.ListApiTokenInput) {
    const total = await this.data['apiToken'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('ApiToken', input))
    const filteredTotal = await this.data['apiToken'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async apiToken(info: GraphQLResolveInfo, id: string) {
    return this.data['apiToken'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateApiToken(info: GraphQLResolveInfo, id: string, input: dto.UpdateApiTokenInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['apiToken'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteApiToken(id: string) {
    return this.data['apiToken'].delete({
      where: { id },
    })
  }

  async createAuditLog(info: GraphQLResolveInfo, input: dto.CreateAuditLogInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['auditLog'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async auditLogs(info: GraphQLResolveInfo, input?: dto.ListAuditLogInput) {
    return this.data['auditLog'].findMany({
      ...this.data.filter(normalizeListInputFilters('AuditLog', input)),
      select: buildAdminSelect(info),
    })
  }

  async auditLogsCount(input?: dto.ListAuditLogInput) {
    const total = await this.data['auditLog'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('AuditLog', input))
    const filteredTotal = await this.data['auditLog'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async auditLog(info: GraphQLResolveInfo, id: string) {
    return this.data['auditLog'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateAuditLog(info: GraphQLResolveInfo, id: string, input: dto.UpdateAuditLogInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['auditLog'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteAuditLog(id: string) {
    return this.data['auditLog'].delete({
      where: { id },
    })
  }

  async createCountry(info: GraphQLResolveInfo, input: dto.CreateCountryInput) {
    const { addressesIds, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      addresses: { ids: addressesIds, isVirtual: true, isList: true, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['country'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async countries(info: GraphQLResolveInfo, input?: dto.ListCountryInput) {
    return this.data['country'].findMany({
      ...this.data.filter(normalizeListInputFilters('Country', input)),
      select: buildAdminSelect(info),
    })
  }

  async countriesCount(input?: dto.ListCountryInput) {
    const total = await this.data['country'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Country', input))
    const filteredTotal = await this.data['country'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async country(info: GraphQLResolveInfo, id: string) {
    return this.data['country'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateCountry(info: GraphQLResolveInfo, id: string, input: dto.UpdateCountryInput) {
    const { addressesIds, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      addresses: { ids: addressesIds, isVirtual: true, isList: true, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['country'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteCountry(id: string) {
    return this.data['country'].delete({
      where: { id },
    })
  }

  async createEmail(info: GraphQLResolveInfo, input: dto.CreateEmailInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['email'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async emails(info: GraphQLResolveInfo, input?: dto.ListEmailInput) {
    return this.data['email'].findMany({
      ...this.data.filter(normalizeListInputFilters('Email', input)),
      select: buildAdminSelect(info),
    })
  }

  async emailsCount(input?: dto.ListEmailInput) {
    const total = await this.data['email'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Email', input))
    const filteredTotal = await this.data['email'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async email(info: GraphQLResolveInfo, id: string) {
    return this.data['email'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateEmail(info: GraphQLResolveInfo, id: string, input: dto.UpdateEmailInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['email'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteEmail(id: string) {
    return this.data['email'].delete({
      where: { id },
    })
  }

  async createInvite(info: GraphQLResolveInfo, input: dto.CreateInviteInput) {
    const { inviterId, organizationId, roleId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      inviter: { ids: inviterId, isVirtual: false, isList: false, isRequired: true },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: true },
      role: { ids: roleId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['invite'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async invites(info: GraphQLResolveInfo, input?: dto.ListInviteInput) {
    return this.data['invite'].findMany({
      ...this.data.filter(normalizeListInputFilters('Invite', input)),
      select: buildAdminSelect(info),
    })
  }

  async invitesCount(input?: dto.ListInviteInput) {
    const total = await this.data['invite'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Invite', input))
    const filteredTotal = await this.data['invite'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async invite(info: GraphQLResolveInfo, id: string) {
    return this.data['invite'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateInvite(info: GraphQLResolveInfo, id: string, input: dto.UpdateInviteInput) {
    const { inviterId, organizationId, roleId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      inviter: { ids: inviterId, isVirtual: false, isList: false, isRequired: true },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: true },
      role: { ids: roleId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['invite'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteInvite(id: string) {
    return this.data['invite'].delete({
      where: { id },
    })
  }

  async createLink(info: GraphQLResolveInfo, input: dto.CreateLinkInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['link'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async links(info: GraphQLResolveInfo, input?: dto.ListLinkInput) {
    return this.data['link'].findMany({
      ...this.data.filter(normalizeListInputFilters('Link', input)),
      select: buildAdminSelect(info),
    })
  }

  async linksCount(input?: dto.ListLinkInput) {
    const total = await this.data['link'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Link', input))
    const filteredTotal = await this.data['link'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async link(info: GraphQLResolveInfo, id: string) {
    return this.data['link'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateLink(info: GraphQLResolveInfo, id: string, input: dto.UpdateLinkInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['link'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteLink(id: string) {
    return this.data['link'].delete({
      where: { id },
    })
  }

  async createLoginAttempt(info: GraphQLResolveInfo, input: dto.CreateLoginAttemptInput) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['loginAttempt'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async loginAttempts(info: GraphQLResolveInfo, input?: dto.ListLoginAttemptInput) {
    return this.data['loginAttempt'].findMany({
      ...this.data.filter(normalizeListInputFilters('LoginAttempt', input)),
      select: buildAdminSelect(info),
    })
  }

  async loginAttemptsCount(input?: dto.ListLoginAttemptInput) {
    const total = await this.data['loginAttempt'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('LoginAttempt', input))
    const filteredTotal = await this.data['loginAttempt'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async loginAttempt(info: GraphQLResolveInfo, id: string) {
    return this.data['loginAttempt'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateLoginAttempt(
    info: GraphQLResolveInfo,
    id: string,
    input: dto.UpdateLoginAttemptInput,
  ) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['loginAttempt'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteLoginAttempt(id: string) {
    return this.data['loginAttempt'].delete({
      where: { id },
    })
  }

  async createOAuthAccount(info: GraphQLResolveInfo, input: dto.CreateOAuthAccountInput) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['oAuthAccount'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async oAuthAccounts(info: GraphQLResolveInfo, input?: dto.ListOAuthAccountInput) {
    return this.data['oAuthAccount'].findMany({
      ...this.data.filter(normalizeListInputFilters('OAuthAccount', input)),
      select: buildAdminSelect(info),
    })
  }

  async oAuthAccountsCount(input?: dto.ListOAuthAccountInput) {
    const total = await this.data['oAuthAccount'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('OAuthAccount', input))
    const filteredTotal = await this.data['oAuthAccount'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async oAuthAccount(info: GraphQLResolveInfo, id: string) {
    return this.data['oAuthAccount'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateOAuthAccount(
    info: GraphQLResolveInfo,
    id: string,
    input: dto.UpdateOAuthAccountInput,
  ) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['oAuthAccount'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteOAuthAccount(id: string) {
    return this.data['oAuthAccount'].delete({
      where: { id },
    })
  }

  async createOrganization(info: GraphQLResolveInfo, input: dto.CreateOrganizationInput) {
    const {
      emailsIds,
      linksIds,
      phoneNumbersIds,
      imagesIds,
      membersIds,
      addressesIds,
      invitesIds,
      AuditLogIds,
      TeamIds,
      subscriptionId,
      rolesIds,
      apiTokensIds,
      logoId,
      ...regularFields
    } = input
    const data: any = regularFields

    const relationMappings = {
      emails: { ids: emailsIds, isVirtual: true, isList: true, isRequired: false },
      links: { ids: linksIds, isVirtual: true, isList: true, isRequired: false },
      phoneNumbers: { ids: phoneNumbersIds, isVirtual: true, isList: true, isRequired: false },
      images: { ids: imagesIds, isVirtual: true, isList: true, isRequired: false },
      members: { ids: membersIds, isVirtual: true, isList: true, isRequired: false },
      addresses: { ids: addressesIds, isVirtual: true, isList: true, isRequired: false },
      invites: { ids: invitesIds, isVirtual: true, isList: true, isRequired: false },
      AuditLog: { ids: AuditLogIds, isVirtual: true, isList: true, isRequired: false },
      Team: { ids: TeamIds, isVirtual: true, isList: true, isRequired: false },
      subscription: { ids: subscriptionId, isVirtual: true, isList: false, isRequired: false },
      roles: { ids: rolesIds, isVirtual: true, isList: true, isRequired: false },
      apiTokens: { ids: apiTokensIds, isVirtual: true, isList: true, isRequired: false },
      logo: { ids: logoId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['organization'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async organizations(info: GraphQLResolveInfo, input?: dto.ListOrganizationInput) {
    return this.data['organization'].findMany({
      ...this.data.filter(normalizeListInputFilters('Organization', input)),
      select: buildAdminSelect(info),
    })
  }

  async organizationsCount(input?: dto.ListOrganizationInput) {
    const total = await this.data['organization'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Organization', input))
    const filteredTotal = await this.data['organization'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async organization(info: GraphQLResolveInfo, id: string) {
    return this.data['organization'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateOrganization(
    info: GraphQLResolveInfo,
    id: string,
    input: dto.UpdateOrganizationInput,
  ) {
    const {
      emailsIds,
      linksIds,
      phoneNumbersIds,
      imagesIds,
      membersIds,
      addressesIds,
      invitesIds,
      AuditLogIds,
      TeamIds,
      subscriptionId,
      rolesIds,
      apiTokensIds,
      logoId,
      ...regularFields
    } = input
    const data: any = regularFields

    const relationMappings = {
      emails: { ids: emailsIds, isVirtual: true, isList: true, isRequired: false },
      links: { ids: linksIds, isVirtual: true, isList: true, isRequired: false },
      phoneNumbers: { ids: phoneNumbersIds, isVirtual: true, isList: true, isRequired: false },
      images: { ids: imagesIds, isVirtual: true, isList: true, isRequired: false },
      members: { ids: membersIds, isVirtual: true, isList: true, isRequired: false },
      addresses: { ids: addressesIds, isVirtual: true, isList: true, isRequired: false },
      invites: { ids: invitesIds, isVirtual: true, isList: true, isRequired: false },
      AuditLog: { ids: AuditLogIds, isVirtual: true, isList: true, isRequired: false },
      Team: { ids: TeamIds, isVirtual: true, isList: true, isRequired: false },
      subscription: { ids: subscriptionId, isVirtual: true, isList: false, isRequired: false },
      roles: { ids: rolesIds, isVirtual: true, isList: true, isRequired: false },
      apiTokens: { ids: apiTokensIds, isVirtual: true, isList: true, isRequired: false },
      logo: { ids: logoId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['organization'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteOrganization(id: string) {
    return this.data['organization'].delete({
      where: { id },
    })
  }

  async createOrganizationMember(
    info: GraphQLResolveInfo,
    input: dto.CreateOrganizationMemberInput,
  ) {
    const { roleId, userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      role: { ids: roleId, isVirtual: false, isList: false, isRequired: true },
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['organizationMember'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async organizationMembers(info: GraphQLResolveInfo, input?: dto.ListOrganizationMemberInput) {
    return this.data['organizationMember'].findMany({
      ...this.data.filter(normalizeListInputFilters('OrganizationMember', input)),
      select: buildAdminSelect(info),
    })
  }

  async organizationMembersCount(input?: dto.ListOrganizationMemberInput) {
    const total = await this.data['organizationMember'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('OrganizationMember', input))
    const filteredTotal = await this.data['organizationMember'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async organizationMember(info: GraphQLResolveInfo, id: string) {
    return this.data['organizationMember'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateOrganizationMember(
    info: GraphQLResolveInfo,
    id: string,
    input: dto.UpdateOrganizationMemberInput,
  ) {
    const { roleId, userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      role: { ids: roleId, isVirtual: false, isList: false, isRequired: true },
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['organizationMember'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteOrganizationMember(id: string) {
    return this.data['organizationMember'].delete({
      where: { id },
    })
  }

  async createPermission(info: GraphQLResolveInfo, input: dto.CreatePermissionInput) {
    const { rolesIds, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      roles: { ids: rolesIds, isVirtual: true, isList: true, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['permission'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async permissions(info: GraphQLResolveInfo, input?: dto.ListPermissionInput) {
    return this.data['permission'].findMany({
      ...this.data.filter(normalizeListInputFilters('Permission', input)),
      select: buildAdminSelect(info),
    })
  }

  async permissionsCount(input?: dto.ListPermissionInput) {
    const total = await this.data['permission'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Permission', input))
    const filteredTotal = await this.data['permission'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async permission(info: GraphQLResolveInfo, id: string) {
    return this.data['permission'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updatePermission(info: GraphQLResolveInfo, id: string, input: dto.UpdatePermissionInput) {
    const { rolesIds, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      roles: { ids: rolesIds, isVirtual: true, isList: true, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['permission'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deletePermission(id: string) {
    return this.data['permission'].delete({
      where: { id },
    })
  }

  async createPhoneNumber(info: GraphQLResolveInfo, input: dto.CreatePhoneNumberInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['phoneNumber'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async phoneNumbers(info: GraphQLResolveInfo, input?: dto.ListPhoneNumberInput) {
    return this.data['phoneNumber'].findMany({
      ...this.data.filter(normalizeListInputFilters('PhoneNumber', input)),
      select: buildAdminSelect(info),
    })
  }

  async phoneNumbersCount(input?: dto.ListPhoneNumberInput) {
    const total = await this.data['phoneNumber'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('PhoneNumber', input))
    const filteredTotal = await this.data['phoneNumber'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async phoneNumber(info: GraphQLResolveInfo, id: string) {
    return this.data['phoneNumber'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updatePhoneNumber(info: GraphQLResolveInfo, id: string, input: dto.UpdatePhoneNumberInput) {
    const { userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['phoneNumber'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deletePhoneNumber(id: string) {
    return this.data['phoneNumber'].delete({
      where: { id },
    })
  }

  async createPlan(info: GraphQLResolveInfo, input: dto.CreatePlanInput) {
    const { subscriptionsIds, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      subscriptions: { ids: subscriptionsIds, isVirtual: true, isList: true, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['plan'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async plans(info: GraphQLResolveInfo, input?: dto.ListPlanInput) {
    return this.data['plan'].findMany({
      ...this.data.filter(normalizeListInputFilters('Plan', input)),
      select: buildAdminSelect(info),
    })
  }

  async plansCount(input?: dto.ListPlanInput) {
    const total = await this.data['plan'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Plan', input))
    const filteredTotal = await this.data['plan'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async plan(info: GraphQLResolveInfo, id: string) {
    return this.data['plan'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updatePlan(info: GraphQLResolveInfo, id: string, input: dto.UpdatePlanInput) {
    const { subscriptionsIds, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      subscriptions: { ids: subscriptionsIds, isVirtual: true, isList: true, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['plan'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deletePlan(id: string) {
    return this.data['plan'].delete({
      where: { id },
    })
  }

  async createRole(info: GraphQLResolveInfo, input: dto.CreateRoleInput) {
    const {
      permissionsIds,
      membersIds,
      teamMembersIds,
      invitesIds,
      organizationId,
      ...regularFields
    } = input
    const data: any = regularFields

    const relationMappings = {
      permissions: { ids: permissionsIds, isVirtual: true, isList: true, isRequired: false },
      members: { ids: membersIds, isVirtual: true, isList: true, isRequired: false },
      teamMembers: { ids: teamMembersIds, isVirtual: true, isList: true, isRequired: false },
      invites: { ids: invitesIds, isVirtual: true, isList: true, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['role'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async roles(info: GraphQLResolveInfo, input?: dto.ListRoleInput) {
    return this.data['role'].findMany({
      ...this.data.filter(normalizeListInputFilters('Role', input)),
      select: buildAdminSelect(info),
    })
  }

  async rolesCount(input?: dto.ListRoleInput) {
    const total = await this.data['role'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Role', input))
    const filteredTotal = await this.data['role'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async role(info: GraphQLResolveInfo, id: string) {
    return this.data['role'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateRole(info: GraphQLResolveInfo, id: string, input: dto.UpdateRoleInput) {
    const {
      permissionsIds,
      membersIds,
      teamMembersIds,
      invitesIds,
      organizationId,
      ...regularFields
    } = input
    const data: any = regularFields

    const relationMappings = {
      permissions: { ids: permissionsIds, isVirtual: true, isList: true, isRequired: false },
      members: { ids: membersIds, isVirtual: true, isList: true, isRequired: false },
      teamMembers: { ids: teamMembersIds, isVirtual: true, isList: true, isRequired: false },
      invites: { ids: invitesIds, isVirtual: true, isList: true, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['role'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteRole(id: string) {
    return this.data['role'].delete({
      where: { id },
    })
  }

  async createSecurityEvent(info: GraphQLResolveInfo, input: dto.CreateSecurityEventInput) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['securityEvent'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async securityEvents(info: GraphQLResolveInfo, input?: dto.ListSecurityEventInput) {
    return this.data['securityEvent'].findMany({
      ...this.data.filter(normalizeListInputFilters('SecurityEvent', input)),
      select: buildAdminSelect(info),
    })
  }

  async securityEventsCount(input?: dto.ListSecurityEventInput) {
    const total = await this.data['securityEvent'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('SecurityEvent', input))
    const filteredTotal = await this.data['securityEvent'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async securityEvent(info: GraphQLResolveInfo, id: string) {
    return this.data['securityEvent'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateSecurityEvent(
    info: GraphQLResolveInfo,
    id: string,
    input: dto.UpdateSecurityEventInput,
  ) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['securityEvent'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteSecurityEvent(id: string) {
    return this.data['securityEvent'].delete({
      where: { id },
    })
  }

  async createSubscription(info: GraphQLResolveInfo, input: dto.CreateSubscriptionInput) {
    const { organizationId, planId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: true },
      plan: { ids: planId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['subscription'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async subscriptions(info: GraphQLResolveInfo, input?: dto.ListSubscriptionInput) {
    return this.data['subscription'].findMany({
      ...this.data.filter(normalizeListInputFilters('Subscription', input)),
      select: buildAdminSelect(info),
    })
  }

  async subscriptionsCount(input?: dto.ListSubscriptionInput) {
    const total = await this.data['subscription'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Subscription', input))
    const filteredTotal = await this.data['subscription'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async subscription(info: GraphQLResolveInfo, id: string) {
    return this.data['subscription'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateSubscription(
    info: GraphQLResolveInfo,
    id: string,
    input: dto.UpdateSubscriptionInput,
  ) {
    const { organizationId, planId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: true },
      plan: { ids: planId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['subscription'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteSubscription(id: string) {
    return this.data['subscription'].delete({
      where: { id },
    })
  }

  async createTeam(info: GraphQLResolveInfo, input: dto.CreateTeamInput) {
    const { membersIds, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      members: { ids: membersIds, isVirtual: true, isList: true, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['team'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async teams(info: GraphQLResolveInfo, input?: dto.ListTeamInput) {
    return this.data['team'].findMany({
      ...this.data.filter(normalizeListInputFilters('Team', input)),
      select: buildAdminSelect(info),
    })
  }

  async teamsCount(input?: dto.ListTeamInput) {
    const total = await this.data['team'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('Team', input))
    const filteredTotal = await this.data['team'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async team(info: GraphQLResolveInfo, id: string) {
    return this.data['team'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateTeam(info: GraphQLResolveInfo, id: string, input: dto.UpdateTeamInput) {
    const { membersIds, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      members: { ids: membersIds, isVirtual: true, isList: true, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['team'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteTeam(id: string) {
    return this.data['team'].delete({
      where: { id },
    })
  }

  async createTeamMember(info: GraphQLResolveInfo, input: dto.CreateTeamMemberInput) {
    const { teamId, userId, roleId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      team: { ids: teamId, isVirtual: false, isList: false, isRequired: true },
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
      role: { ids: roleId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['teamMember'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async teamMembers(info: GraphQLResolveInfo, input?: dto.ListTeamMemberInput) {
    return this.data['teamMember'].findMany({
      ...this.data.filter(normalizeListInputFilters('TeamMember', input)),
      select: buildAdminSelect(info),
    })
  }

  async teamMembersCount(input?: dto.ListTeamMemberInput) {
    const total = await this.data['teamMember'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('TeamMember', input))
    const filteredTotal = await this.data['teamMember'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async teamMember(info: GraphQLResolveInfo, id: string) {
    return this.data['teamMember'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateTeamMember(info: GraphQLResolveInfo, id: string, input: dto.UpdateTeamMemberInput) {
    const { teamId, userId, roleId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      team: { ids: teamId, isVirtual: false, isList: false, isRequired: true },
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
      role: { ids: roleId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['teamMember'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteTeamMember(id: string) {
    return this.data['teamMember'].delete({
      where: { id },
    })
  }

  async createStoredFile(info: GraphQLResolveInfo, input: dto.CreateStoredFileInput) {
    const { userAvatarId, organizationLogoId, userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      userAvatar: { ids: userAvatarId, isVirtual: true, isList: false, isRequired: false },
      organizationLogo: {
        ids: organizationLogoId,
        isVirtual: true,
        isList: false,
        isRequired: false,
      },
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['storedFile'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async storedFiles(info: GraphQLResolveInfo, input?: dto.ListStoredFileInput) {
    return this.data['storedFile'].findMany({
      ...this.data.filter(normalizeListInputFilters('StoredFile', input)),
      select: buildAdminSelect(info),
    })
  }

  async storedFilesCount(input?: dto.ListStoredFileInput) {
    const total = await this.data['storedFile'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('StoredFile', input))
    const filteredTotal = await this.data['storedFile'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async storedFile(info: GraphQLResolveInfo, id: string) {
    return this.data['storedFile'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateStoredFile(info: GraphQLResolveInfo, id: string, input: dto.UpdateStoredFileInput) {
    const { userAvatarId, organizationLogoId, userId, organizationId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      userAvatar: { ids: userAvatarId, isVirtual: true, isList: false, isRequired: false },
      organizationLogo: {
        ids: organizationLogoId,
        isVirtual: true,
        isList: false,
        isRequired: false,
      },
      user: { ids: userId, isVirtual: false, isList: false, isRequired: false },
      organization: { ids: organizationId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['storedFile'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteStoredFile(id: string) {
    return this.data['storedFile'].delete({
      where: { id },
    })
  }

  async createUser(info: GraphQLResolveInfo, input: dto.CreateUserInput) {
    const {
      emailsIds,
      linksIds,
      phoneNumbersIds,
      imagesIds,
      organizationsIds,
      addressesIds,
      invitesSentIds,
      activeSessionsIds,
      loginAttemptsIds,
      AuditLogIds,
      UserPreferenceIds,
      TeamMemberIds,
      SecurityEventIds,
      apiTokensIds,
      oAuthAccountsIds,
      avatarId,
      ...regularFields
    } = input
    const data: any = regularFields

    const relationMappings = {
      emails: { ids: emailsIds, isVirtual: true, isList: true, isRequired: false },
      links: { ids: linksIds, isVirtual: true, isList: true, isRequired: false },
      phoneNumbers: { ids: phoneNumbersIds, isVirtual: true, isList: true, isRequired: false },
      images: { ids: imagesIds, isVirtual: true, isList: true, isRequired: false },
      organizations: { ids: organizationsIds, isVirtual: true, isList: true, isRequired: false },
      addresses: { ids: addressesIds, isVirtual: true, isList: true, isRequired: false },
      invitesSent: { ids: invitesSentIds, isVirtual: true, isList: true, isRequired: false },
      activeSessions: { ids: activeSessionsIds, isVirtual: true, isList: true, isRequired: false },
      loginAttempts: { ids: loginAttemptsIds, isVirtual: true, isList: true, isRequired: false },
      AuditLog: { ids: AuditLogIds, isVirtual: true, isList: true, isRequired: false },
      UserPreference: { ids: UserPreferenceIds, isVirtual: true, isList: true, isRequired: false },
      TeamMember: { ids: TeamMemberIds, isVirtual: true, isList: true, isRequired: false },
      SecurityEvent: { ids: SecurityEventIds, isVirtual: true, isList: true, isRequired: false },
      apiTokens: { ids: apiTokensIds, isVirtual: true, isList: true, isRequired: false },
      oAuthAccounts: { ids: oAuthAccountsIds, isVirtual: true, isList: true, isRequired: false },
      avatar: { ids: avatarId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['user'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async users(info: GraphQLResolveInfo, input?: dto.ListUserInput) {
    return this.data['user'].findMany({
      ...this.data.filter(normalizeListInputFilters('User', input)),
      select: buildAdminSelect(info),
    })
  }

  async usersCount(input?: dto.ListUserInput) {
    const total = await this.data['user'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('User', input))
    const filteredTotal = await this.data['user'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async user(info: GraphQLResolveInfo, id: string) {
    return this.data['user'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateUser(info: GraphQLResolveInfo, id: string, input: dto.UpdateUserInput) {
    const {
      emailsIds,
      linksIds,
      phoneNumbersIds,
      imagesIds,
      organizationsIds,
      addressesIds,
      invitesSentIds,
      activeSessionsIds,
      loginAttemptsIds,
      AuditLogIds,
      UserPreferenceIds,
      TeamMemberIds,
      SecurityEventIds,
      apiTokensIds,
      oAuthAccountsIds,
      avatarId,
      ...regularFields
    } = input
    const data: any = regularFields

    const relationMappings = {
      emails: { ids: emailsIds, isVirtual: true, isList: true, isRequired: false },
      links: { ids: linksIds, isVirtual: true, isList: true, isRequired: false },
      phoneNumbers: { ids: phoneNumbersIds, isVirtual: true, isList: true, isRequired: false },
      images: { ids: imagesIds, isVirtual: true, isList: true, isRequired: false },
      organizations: { ids: organizationsIds, isVirtual: true, isList: true, isRequired: false },
      addresses: { ids: addressesIds, isVirtual: true, isList: true, isRequired: false },
      invitesSent: { ids: invitesSentIds, isVirtual: true, isList: true, isRequired: false },
      activeSessions: { ids: activeSessionsIds, isVirtual: true, isList: true, isRequired: false },
      loginAttempts: { ids: loginAttemptsIds, isVirtual: true, isList: true, isRequired: false },
      AuditLog: { ids: AuditLogIds, isVirtual: true, isList: true, isRequired: false },
      UserPreference: { ids: UserPreferenceIds, isVirtual: true, isList: true, isRequired: false },
      TeamMember: { ids: TeamMemberIds, isVirtual: true, isList: true, isRequired: false },
      SecurityEvent: { ids: SecurityEventIds, isVirtual: true, isList: true, isRequired: false },
      apiTokens: { ids: apiTokensIds, isVirtual: true, isList: true, isRequired: false },
      oAuthAccounts: { ids: oAuthAccountsIds, isVirtual: true, isList: true, isRequired: false },
      avatar: { ids: avatarId, isVirtual: false, isList: false, isRequired: false },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['user'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteUser(id: string) {
    return this.data['user'].delete({
      where: { id },
    })
  }

  async createUserPreference(info: GraphQLResolveInfo, input: dto.CreateUserPreferenceInput) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['userPreference'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async userPreferences(info: GraphQLResolveInfo, input?: dto.ListUserPreferenceInput) {
    return this.data['userPreference'].findMany({
      ...this.data.filter(normalizeListInputFilters('UserPreference', input)),
      select: buildAdminSelect(info),
    })
  }

  async userPreferencesCount(input?: dto.ListUserPreferenceInput) {
    const total = await this.data['userPreference'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('UserPreference', input))
    const filteredTotal = await this.data['userPreference'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async userPreference(info: GraphQLResolveInfo, id: string) {
    return this.data['userPreference'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateUserPreference(
    info: GraphQLResolveInfo,
    id: string,
    input: dto.UpdateUserPreferenceInput,
  ) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['userPreference'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteUserPreference(id: string) {
    return this.data['userPreference'].delete({
      where: { id },
    })
  }

  async createUserSession(info: GraphQLResolveInfo, input: dto.CreateUserSessionInput) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: always use connect for creates
          const relationOperation = 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - always use connect
          data[relationName] = { connect: { id: config.ids } }
        }
      }
    }

    return this.data['userSession'].create({
      data,
      select: buildAdminSelect(info),
    })
  }

  async userSessions(info: GraphQLResolveInfo, input?: dto.ListUserSessionInput) {
    return this.data['userSession'].findMany({
      ...this.data.filter(normalizeListInputFilters('UserSession', input)),
      select: buildAdminSelect(info),
    })
  }

  async userSessionsCount(input?: dto.ListUserSessionInput) {
    const total = await this.data['userSession'].count()
    const {
      where,
      take = 10,
      skip = 0,
    } = this.data.filter(normalizeListInputFilters('UserSession', input))
    const filteredTotal = await this.data['userSession'].count({ where })
    const page = Math.floor(skip / take)
    const pages = take > 0 ? Math.ceil(filteredTotal / take) : 0
    const hasNext = skip + take < filteredTotal
    const hasPrev = skip > 0
    const count = Math.max(0, Math.min(take, filteredTotal - skip))
    return {
      take,
      skip,
      page,
      pages,
      hasNext,
      hasPrev,
      count,
      total,
      filteredTotal,
    }
  }

  async userSession(info: GraphQLResolveInfo, id: string) {
    return this.data['userSession'].findUnique({
      where: { id },
      select: buildAdminSelect(info),
    })
  }

  async updateUserSession(info: GraphQLResolveInfo, id: string, input: dto.UpdateUserSessionInput) {
    const { userId, ...regularFields } = input
    const data: any = regularFields

    const relationMappings = {
      user: { ids: userId, isVirtual: false, isList: false, isRequired: true },
    }

    for (const [relationName, config] of Object.entries(relationMappings)) {
      if (config.ids !== undefined && config.ids !== null) {
        const ids = Array.isArray(config.ids)
          ? config.ids.map(id => ({ id }))
          : [{ id: config.ids }]

        if (config.isList) {
          // List relationships: use set for updates on virtual relations, connect for foreign key relations
          const relationOperation = config.isVirtual ? 'set' : 'connect'
          data[relationName] = { [relationOperation]: ids }
        } else {
          // Single relationship - connect when an id is provided; disconnect when null on update
          data[relationName] = { connect: { id: config.ids } }
        }
      } else if (config.ids === null && !config.isList && !config.isRequired && !config.isVirtual) {
        // Explicitly null - disconnect the optional single relationship (only when this model owns the FK)
        data[relationName] = { disconnect: true }
      }
    }

    return this.data['userSession'].update({
      where: { id },
      data,
      select: buildAdminSelect(info),
    })
  }

  async deleteUserSession(id: string) {
    return this.data['userSession'].delete({
      where: { id },
    })
  }
}
