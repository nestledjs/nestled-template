import { ApiTokensResolver } from './api-tokens.resolver'

describe('ApiTokensResolver', () => {
  const service = {
    generateApiToken: jest.fn().mockResolvedValue({ token: 't' }),
    rotateApiToken: jest.fn().mockResolvedValue({ token: 't' }),
  }
  const resolver = new ApiTokensResolver(service as never)
  // The row JwtStrategy loaded for the request, which carries the user's auth generation.
  const user = { id: 'user-1', authGeneration: 2 } as never

  it('issues new tokens under the generation the request authenticated with', async () => {
    await resolver.generateApiToken(user, { name: 'CLI' })
    await resolver.rotateApiToken(user, { tokenId: 'token-1', keepOldTokenActive: false })

    expect(service.generateApiToken).toHaveBeenCalledWith('user-1', { name: 'CLI' }, 2)
    expect(service.rotateApiToken).toHaveBeenCalledWith(
      'user-1',
      { tokenId: 'token-1', keepOldTokenActive: false },
      2,
    )
  })
})
