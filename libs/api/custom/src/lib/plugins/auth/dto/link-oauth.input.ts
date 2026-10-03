import { Field, InputType } from '@nestjs/graphql'
import { OAuthProvider } from './oauth-provider.enum'

@InputType()
export class LinkOAuthInput {
  @Field(() => OAuthProvider)
  provider!: OAuthProvider

  @Field(() => String, { description: 'OAuth access token or authorization code' })
  token!: string
}
