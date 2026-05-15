import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { GqlAuthGuard, CtxUser } from '@nestled-template/api/utils'
import { User, ApiToken } from '@nestled-template/api/core/models'
import { ApiTokensService } from './api-tokens.service'
import { GenerateApiTokenInput, RotateApiTokenInput, GenerateApiTokenOutput } from './dto'

@Resolver(() => ApiToken)
export class ApiTokensResolver {
  constructor(private readonly service: ApiTokensService) {}

  @Mutation(() => GenerateApiTokenOutput)
  @UseGuards(GqlAuthGuard)
  async generateApiToken(
    @CtxUser() user: User,
    @Args('input') input: GenerateApiTokenInput,
  ): Promise<GenerateApiTokenOutput> {
    return this.service.generateApiToken(user.id, input)
  }

  @Query(() => [ApiToken])
  @UseGuards(GqlAuthGuard)
  async listApiTokens(@CtxUser() user: User): Promise<ApiToken[]> {
    return this.service.listApiTokens(user.id)
  }

  @Mutation(() => ApiToken)
  @UseGuards(GqlAuthGuard)
  async revokeApiToken(
    @CtxUser() user: User,
    @Args('tokenId') tokenId: string,
  ): Promise<ApiToken> {
    return this.service.revokeApiToken(user.id, tokenId)
  }

  @Mutation(() => GenerateApiTokenOutput)
  @UseGuards(GqlAuthGuard)
  async rotateApiToken(
    @CtxUser() user: User,
    @Args('input') input: RotateApiTokenInput,
  ): Promise<GenerateApiTokenOutput> {
    return this.service.rotateApiToken(user.id, input)
  }
}