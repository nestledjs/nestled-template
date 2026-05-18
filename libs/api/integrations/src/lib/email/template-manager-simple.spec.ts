import { SimpleTemplateManager } from './template-manager-simple'

describe('SimpleTemplateManager', () => {
  it('renders a known template with required and optional variables', async () => {
    const manager = new SimpleTemplateManager()

    const rendered = await manager.renderTemplate('welcome', {
      userName: 'Ada',
      appName: 'Nestled',
      loginUrl: 'https://example.com/dashboard',
      supportEmail: 'support@example.com',
    })

    expect(rendered.subject).toBe('Welcome to Nestled!')
    expect(rendered.html).toContain('Hi Ada')
    expect(rendered.html).toContain('https://example.com/dashboard')
    expect(rendered.text).toContain('support@example.com')
  })

  it('reports available templates when a template is unknown', async () => {
    const manager = new SimpleTemplateManager()

    await expect(manager.getTemplate('missing-template')).rejects.toThrow(
      /Template missing-template not found/,
    )
  })

  it('rejects rendering when required variables are missing', async () => {
    const manager = new SimpleTemplateManager()

    await expect(
      manager.renderTemplate('password-reset', {
        userName: 'Ada',
        appName: 'Nestled',
      }),
    ).rejects.toThrow('Missing required template variables for password-reset: resetUrl')
  })

  it('supports common helper behavior and targeted cache clearing', async () => {
    const manager = new SimpleTemplateManager()

    const first = await manager.renderTemplate('welcome', {
      userName: 'Ada',
      appName: 'Nestled',
    })
    manager.clearCache('welcome')
    const second = await manager.renderTemplate('welcome', {
      userName: 'Ada',
      appName: 'Nestled',
    })
    manager.clearCache()

    expect(second).toEqual(first)
  })
})
