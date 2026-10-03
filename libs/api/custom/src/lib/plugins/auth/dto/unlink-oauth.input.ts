import { Field, InputType } from '@nestjs/graphql'
import { OAuthProvider } from './oauth-provider.enum'

@InputType()
export class UnlinkOAuthInput {
  @Field(() => OAuthProvider)
  provider!: OAuthProvider
}
