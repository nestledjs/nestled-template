import { Injectable } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { createSelect } from '@nestled-template/api/core/helpers'
import type { GraphQLResolveInfo } from 'graphql'
import * as dto from './dto'

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
      select: createSelect(info),
    })
  }

  async addresses(info: GraphQLResolveInfo, input?: dto.ListAddressInput) {
    return this.data['address'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async addressesCount(input?: dto.ListAddressInput) {
    const total = await this.data['address'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async apiTokens(info: GraphQLResolveInfo, input?: dto.ListApiTokenInput) {
    return this.data['apiToken'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async apiTokensCount(input?: dto.ListApiTokenInput) {
    const total = await this.data['apiToken'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async auditLogs(info: GraphQLResolveInfo, input?: dto.ListAuditLogInput) {
    return this.data['auditLog'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async auditLogsCount(input?: dto.ListAuditLogInput) {
    const total = await this.data['auditLog'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async countries(info: GraphQLResolveInfo, input?: dto.ListCountryInput) {
    return this.data['country'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async countriesCount(input?: dto.ListCountryInput) {
    const total = await this.data['country'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async emails(info: GraphQLResolveInfo, input?: dto.ListEmailInput) {
    return this.data['email'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async emailsCount(input?: dto.ListEmailInput) {
    const total = await this.data['email'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async invites(info: GraphQLResolveInfo, input?: dto.ListInviteInput) {
    return this.data['invite'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async invitesCount(input?: dto.ListInviteInput) {
    const total = await this.data['invite'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async links(info: GraphQLResolveInfo, input?: dto.ListLinkInput) {
    return this.data['link'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async linksCount(input?: dto.ListLinkInput) {
    const total = await this.data['link'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async loginAttempts(info: GraphQLResolveInfo, input?: dto.ListLoginAttemptInput) {
    return this.data['loginAttempt'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async loginAttemptsCount(input?: dto.ListLoginAttemptInput) {
    const total = await this.data['loginAttempt'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async oAuthAccounts(info: GraphQLResolveInfo, input?: dto.ListOAuthAccountInput) {
    return this.data['oAuthAccount'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async oAuthAccountsCount(input?: dto.ListOAuthAccountInput) {
    const total = await this.data['oAuthAccount'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async organizations(info: GraphQLResolveInfo, input?: dto.ListOrganizationInput) {
    return this.data['organization'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async organizationsCount(input?: dto.ListOrganizationInput) {
    const total = await this.data['organization'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async organizationMembers(info: GraphQLResolveInfo, input?: dto.ListOrganizationMemberInput) {
    return this.data['organizationMember'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async organizationMembersCount(input?: dto.ListOrganizationMemberInput) {
    const total = await this.data['organizationMember'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async permissions(info: GraphQLResolveInfo, input?: dto.ListPermissionInput) {
    return this.data['permission'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async permissionsCount(input?: dto.ListPermissionInput) {
    const total = await this.data['permission'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async phoneNumbers(info: GraphQLResolveInfo, input?: dto.ListPhoneNumberInput) {
    return this.data['phoneNumber'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async phoneNumbersCount(input?: dto.ListPhoneNumberInput) {
    const total = await this.data['phoneNumber'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async plans(info: GraphQLResolveInfo, input?: dto.ListPlanInput) {
    return this.data['plan'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async plansCount(input?: dto.ListPlanInput) {
    const total = await this.data['plan'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async roles(info: GraphQLResolveInfo, input?: dto.ListRoleInput) {
    return this.data['role'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async rolesCount(input?: dto.ListRoleInput) {
    const total = await this.data['role'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async securityEvents(info: GraphQLResolveInfo, input?: dto.ListSecurityEventInput) {
    return this.data['securityEvent'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async securityEventsCount(input?: dto.ListSecurityEventInput) {
    const total = await this.data['securityEvent'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async subscriptions(info: GraphQLResolveInfo, input?: dto.ListSubscriptionInput) {
    return this.data['subscription'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async subscriptionsCount(input?: dto.ListSubscriptionInput) {
    const total = await this.data['subscription'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async teams(info: GraphQLResolveInfo, input?: dto.ListTeamInput) {
    return this.data['team'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async teamsCount(input?: dto.ListTeamInput) {
    const total = await this.data['team'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async teamMembers(info: GraphQLResolveInfo, input?: dto.ListTeamMemberInput) {
    return this.data['teamMember'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async teamMembersCount(input?: dto.ListTeamMemberInput) {
    const total = await this.data['teamMember'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async storedFiles(info: GraphQLResolveInfo, input?: dto.ListStoredFileInput) {
    return this.data['storedFile'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async storedFilesCount(input?: dto.ListStoredFileInput) {
    const total = await this.data['storedFile'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      passwordHistoryIds,
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
      passwordHistory: {
        ids: passwordHistoryIds,
        isVirtual: true,
        isList: true,
        isRequired: false,
      },
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
      select: createSelect(info),
    })
  }

  async users(info: GraphQLResolveInfo, input?: dto.ListUserInput) {
    return this.data['user'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async usersCount(input?: dto.ListUserInput) {
    const total = await this.data['user'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      passwordHistoryIds,
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
      passwordHistory: {
        ids: passwordHistoryIds,
        isVirtual: true,
        isList: true,
        isRequired: false,
      },
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async userPreferences(info: GraphQLResolveInfo, input?: dto.ListUserPreferenceInput) {
    return this.data['userPreference'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async userPreferencesCount(input?: dto.ListUserPreferenceInput) {
    const total = await this.data['userPreference'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async userSessions(info: GraphQLResolveInfo, input?: dto.ListUserSessionInput) {
    return this.data['userSession'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async userSessionsCount(input?: dto.ListUserSessionInput) {
    const total = await this.data['userSession'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
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
      select: createSelect(info),
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
      select: createSelect(info),
    })
  }

  async deleteUserSession(id: string) {
    return this.data['userSession'].delete({
      where: { id },
    })
  }

  async createPasswordHistory(info: GraphQLResolveInfo, input: dto.CreatePasswordHistoryInput) {
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

    return this.data['passwordHistory'].create({
      data,
      select: createSelect(info),
    })
  }

  async passwordHistories(info: GraphQLResolveInfo, input?: dto.ListPasswordHistoryInput) {
    return this.data['passwordHistory'].findMany({
      ...this.data.filter(input),
      select: createSelect(info),
    })
  }

  async passwordHistoriesCount(input?: dto.ListPasswordHistoryInput) {
    const total = await this.data['passwordHistory'].count()
    const { where, take = 10, skip = 0 } = this.data.filter(input)
    const filteredTotal = await this.data['passwordHistory'].count({ where })
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

  async passwordHistory(info: GraphQLResolveInfo, id: string) {
    return this.data['passwordHistory'].findUnique({
      where: { id },
      select: createSelect(info),
    })
  }

  async updatePasswordHistory(
    info: GraphQLResolveInfo,
    id: string,
    input: dto.UpdatePasswordHistoryInput,
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

    return this.data['passwordHistory'].update({
      where: { id },
      data,
      select: createSelect(info),
    })
  }

  async deletePasswordHistory(id: string) {
    return this.data['passwordHistory'].delete({
      where: { id },
    })
  }
}
