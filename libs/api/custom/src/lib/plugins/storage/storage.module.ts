import { Module } from '@nestjs/common'
import { StorageModule as IntegrationsStorageModule } from '@nestled-template/api/integrations'
import { StorageFactory } from './storage.factory'
import { StorageService } from './storage.service'
import { StorageResolver } from './storage.resolver'

/**
 * Storage Plugin Module
 * Wires up storage providers, factory, service, and GraphQL resolver
 * Note: ApiCoreDataAccessService is provided globally via ApiCoreDataAccessModule
 */
@Module({
  imports: [IntegrationsStorageModule],
  providers: [StorageFactory, StorageService, StorageResolver],
  exports: [StorageService],
})
export class StoragePluginModule {}
