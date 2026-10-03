import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { McpController } from './mcp.controller'
import { McpOAuthController } from './mcp-oauth.controller'
import { McpServerFactory } from './mcp-server.factory'
import { McpOAuthService } from './mcp-oauth.service'
import { ApiTokensModule } from '../api-tokens/api-tokens.module'

@Module({
  imports: [
    ApiCoreDataAccessModule,
    ApiTokensModule,
    JwtModule.register({ secret: process.env['JWT_SECRET'] }),
  ],
  controllers: [McpController, McpOAuthController],
  providers: [McpServerFactory, McpOAuthService],
})
export class McpModule {}
