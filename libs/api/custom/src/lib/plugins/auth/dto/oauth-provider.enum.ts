import { registerEnumType } from '@nestjs/graphql'

export enum OAuthProvider {
  GOOGLE = 'GOOGLE',
  GITHUB = 'GITHUB',
}

registerEnumType(OAuthProvider, {
  name: 'OAuthProvider',
  description: 'OAuth provider types',
})
