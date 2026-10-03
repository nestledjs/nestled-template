import { Field, ObjectType } from '@nestjs/graphql'
import { OAuthProvider } from './oauth-provider.enum'

@ObjectType()
export class OAuthProviderInfo {
  @Field(() => OAuthProvider)
  provider!: OAuthProvider

  @Field(() => Boolean)
  enabled!: boolean

  @Field(() => String)
  name!: string
}
