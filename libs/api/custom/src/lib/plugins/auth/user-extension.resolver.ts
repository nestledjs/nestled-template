import { Parent, ResolveField, Resolver } from '@nestjs/graphql'
import { User } from '@nestled-template/api/core/models'
import {
  Authenticated,
  GqlAuthGuard,
  InheritedParentAuthorization,
} from '@nestled-template/api/utils'
import { UseGuards } from '@nestjs/common'

/**
 * Extends the User GraphQL type with additional runtime fields
 * These fields are not stored in the database but are added dynamically
 */
@Resolver(() => User)
export class UserExtensionResolver {
  /**
   * Indicates if the current session is an admin emulating this user
   */
  @ResolveField(() => Boolean, { nullable: true })
  @Authenticated()
  @UseGuards(GqlAuthGuard)
  @InheritedParentAuthorization()
  isEmulating(@Parent() user: User & { isEmulating?: boolean }): boolean | null {
    return user.isEmulating ?? null
  }

  /**
   * The admin user ID who is emulating this user (if in emulation mode)
   */
  @ResolveField(() => String, { nullable: true })
  @Authenticated()
  @UseGuards(GqlAuthGuard)
  @InheritedParentAuthorization()
  originalAdminId(@Parent() user: User & { originalAdminId?: string }): string | null {
    return user.originalAdminId ?? null
  }
}
