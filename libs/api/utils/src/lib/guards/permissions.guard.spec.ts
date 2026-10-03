import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { GqlExecutionContext } from '@nestjs/graphql'
import {
  PermissionsGuard,
  RequirePermissions,
  PERMISSIONS_KEY,
  PermissionRequirement,
  hasPermission,
  requirePermission,
} from './permissions.guard'
import { OrganizationContext } from '../types/nest-context-type'
describe('PermissionsGuard', () => {
  let guard: PermissionsGuard
  let reflector: Reflector
  let mockContext: ExecutionContext
  let mockGqlContext: any
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile()
    guard = module.get<PermissionsGuard>(PermissionsGuard)
    reflector = module.get<Reflector>(Reflector)
    // Setup mock execution context
    mockGqlContext = {
      req: {
        user: {
          id: 'user-123',
          username: 'testuser',
        },
        organizationContext: undefined as OrganizationContext | undefined,
      },
    }
    mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToHttp: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as any
    // Mock GqlExecutionContext.create to return our mock context
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => mockGqlContext,
      getArgs: jest.fn(),
      getInfo: jest.fn(),
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getType: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToHttp: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    } as any)
  })
  afterEach(() => {
    jest.clearAllMocks()
  })
  describe('Guard Activation', () => {
    it('should allow access when no permissions are required', () => {
      // No permissions required
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined)
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
        mockContext.getHandler(),
        mockContext.getClass(),
      ])
    })
    it('should allow access when empty permissions array is provided', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
    })
    it('should throw ForbiddenException when organization context is missing', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'update' },
      ]
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = undefined
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow(
        'Organization context required for this operation',
      )
    })
  })
  describe('Single Permission Checks', () => {
    it('should allow access when user has required permission', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'update' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-admin',
        roleName: 'Admin',
        permissions: [
          { subject: 'organization', action: 'read' },
          { subject: 'organization', action: 'update' },
          { subject: 'team', action: 'read' },
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
    })
    it('should deny access when user lacks required permission', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'delete' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-member',
        roleName: 'Member',
        permissions: [
          { subject: 'organization', action: 'read' },
          { subject: 'team', action: 'read' },
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow(
        /Missing required permissions: organization:delete/,
      )
      expect(() => guard.canActivate(mockContext)).toThrow(/Current role: Member/)
    })
    it('should deny access when user has correct subject but wrong action', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'delete' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-viewer',
        roleName: 'Viewer',
        permissions: [
          { subject: 'organization', action: 'read' }, // Right subject, wrong action
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow(
        /Missing required permissions: organization:delete/,
      )
    })
    it('should deny access when user has correct action but wrong subject', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'update' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-member',
        roleName: 'Member',
        permissions: [
          { subject: 'team', action: 'update' }, // Wrong subject, right action
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
    })
  })
  describe('Multiple Permission Checks (AND Logic)', () => {
    it('should allow access when user has all required permissions', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'update' },
        { subject: 'team', action: 'create' },
        { subject: 'user', action: 'invite' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-admin',
        roleName: 'Admin',
        permissions: [
          { subject: 'organization', action: 'read' },
          { subject: 'organization', action: 'update' },
          { subject: 'team', action: 'create' },
          { subject: 'team', action: 'read' },
          { subject: 'user', action: 'invite' },
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
    })
    it('should deny access when user is missing one of multiple required permissions', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'update' },
        { subject: 'team', action: 'delete' }, // User doesn't have this
        { subject: 'user', action: 'invite' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-member',
        roleName: 'Member',
        permissions: [
          { subject: 'organization', action: 'update' },
          { subject: 'team', action: 'read' },
          { subject: 'user', action: 'invite' },
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow(
        /Missing required permissions: team:delete/,
      )
    })
    it('should list all missing permissions in error message', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'delete' },
        { subject: 'team', action: 'delete' },
        { subject: 'user', action: 'delete' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-viewer',
        roleName: 'Viewer',
        permissions: [
          { subject: 'organization', action: 'read' },
          { subject: 'team', action: 'read' },
          { subject: 'user', action: 'read' },
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(
        /Missing required permissions: organization:delete, team:delete, user:delete/,
      )
      expect(() => guard.canActivate(mockContext)).toThrow(/Current role: Viewer/)
    })
    it('should deny access when user has none of the required permissions', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'delete' },
        { subject: 'team', action: 'delete' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-viewer',
        roleName: 'Viewer',
        permissions: [{ subject: 'organization', action: 'read' }],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
    })
  })
  describe('@RequirePermissions Decorator', () => {
    it('should set metadata with single permission', () => {
      const decorator = RequirePermissions({ subject: 'organization', action: 'update' })
      // Decorators return a function that sets metadata
      expect(typeof decorator).toBe('function')
    })
    it('should set metadata with multiple permissions', () => {
      const decorator = RequirePermissions(
        { subject: 'organization', action: 'update' },
        { subject: 'team', action: 'create' },
      )
      expect(typeof decorator).toBe('function')
    })
    it('should work with guard to extract permissions from metadata', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'read' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-member',
        roleName: 'Member',
        permissions: [{ subject: 'organization', action: 'read' }],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, expect.any(Array))
    })
  })
  describe('Metadata Extraction', () => {
    it('should extract permissions from handler metadata', () => {
      const requiredPermissions: PermissionRequirement[] = [{ subject: 'team', action: 'create' }]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-admin',
        roleName: 'Admin',
        permissions: [{ subject: 'team', action: 'create' }],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      guard.canActivate(mockContext)
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
        mockContext.getHandler(),
        mockContext.getClass(),
      ])
    })
    it('should use getAllAndOverride to merge handler and class metadata', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      guard.canActivate(mockContext)
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
        mockContext.getHandler(),
        mockContext.getClass(),
      ])
    })
  })
  describe('Organization Context Validation', () => {
    it('should access organization context from request object', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'read' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-456',
        userId: 'user-789',
        roleId: 'role-owner',
        roleName: 'Owner',
        permissions: [
          { subject: 'organization', action: 'read' },
          { subject: 'organization', action: 'update' },
          { subject: 'organization', action: 'delete' },
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
    })
    it('should handle null organization context', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'read' },
      ]
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = null
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow(
        'Organization context required for this operation',
      )
    })
    it('should handle undefined organization context', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'read' },
      ]
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = undefined
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
    })
    it('should handle organization context with empty permissions array', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'read' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-none',
        roleName: 'NoPermissions',
        permissions: [], // Empty permissions
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow(
        /Missing required permissions: organization:read/,
      )
    })
  })
  describe('NestJS ExecutionContext Integration', () => {
    it('should work with GraphQL ExecutionContext', () => {
      // This test verifies that the guard works within the NestJS GraphQL context system
      // The actual GqlExecutionContext.create is mocked in beforeEach
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
      // Verify the guard successfully processes the execution context
      expect(mockContext.getHandler).toBeDefined()
      expect(mockContext.getClass).toBeDefined()
    })
    it('should extract GraphQL context correctly', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'read' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-member',
        roleName: 'Member',
        permissions: [{ subject: 'organization', action: 'read' }],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
      // Verify that the organization context was correctly accessed from the GraphQL context
      expect(mockGqlContext.req.organizationContext).toBeDefined()
      expect(mockGqlContext.req.organizationContext.permissions).toContainEqual({
        subject: 'organization',
        action: 'read',
      })
    })
  })
  describe('Error Messages', () => {
    it('should include role name in error message', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'delete' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-123',
        roleName: 'CustomRole',
        permissions: [{ subject: 'organization', action: 'read' }],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(/Current role: CustomRole/)
    })
    it('should format multiple missing permissions correctly', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'update' },
        { subject: 'organization', action: 'delete' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-viewer',
        roleName: 'Viewer',
        permissions: [{ subject: 'organization', action: 'read' }],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      expect(() => guard.canActivate(mockContext)).toThrow(
        /Missing required permissions: organization:update, organization:delete/,
      )
    })
  })
  describe('Edge Cases', () => {
    it('should handle permission with special characters in subject', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'billing-invoice', action: 'read' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-admin',
        roleName: 'Admin',
        permissions: [{ subject: 'billing-invoice', action: 'read' }],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
    })
    it('should handle duplicate permissions in requirements', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'read' },
        { subject: 'organization', action: 'read' }, // Duplicate
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-member',
        roleName: 'Member',
        permissions: [{ subject: 'organization', action: 'read' }],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
    })
    it('should handle user with extra permissions beyond requirements', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'organization', action: 'read' },
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-owner',
        roleName: 'Owner',
        permissions: [
          { subject: 'organization', action: 'read' },
          { subject: 'organization', action: 'update' },
          { subject: 'organization', action: 'delete' },
          { subject: 'team', action: 'create' },
          { subject: 'team', action: 'read' },
          { subject: 'team', action: 'update' },
          { subject: 'team', action: 'delete' },
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      const result = guard.canActivate(mockContext)
      expect(result).toBe(true)
    })
    it('should perform case-sensitive permission matching', () => {
      const requiredPermissions: PermissionRequirement[] = [
        { subject: 'Organization', action: 'read' }, // Uppercase O
      ]
      const orgContext: OrganizationContext = {
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-member',
        roleName: 'Member',
        permissions: [
          { subject: 'organization', action: 'read' }, // Lowercase o
        ],
      }
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions)
      mockGqlContext.req.organizationContext = orgContext
      // Should fail because permissions are case-sensitive
      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
    })
  })
})
describe('hasPermission Helper Function', () => {
  it('should return true when user has permission', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      userId: 'user-123',
      roleId: 'role-admin',
      roleName: 'Admin',
      permissions: [{ subject: 'organization', action: 'update' }],
    }
    const result = hasPermission(orgContext, 'organization', 'update')
    expect(result).toBe(true)
  })
  it('should return false when user lacks permission', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      userId: 'user-123',
      roleId: 'role-member',
      roleName: 'Member',
      permissions: [{ subject: 'organization', action: 'read' }],
    }
    const result = hasPermission(orgContext, 'organization', 'delete')
    expect(result).toBe(false)
  })
  it('should return false when organization context is undefined', () => {
    const result = hasPermission(undefined, 'organization', 'read')
    expect(result).toBe(false)
  })
  it('should return false when organization context is null', () => {
    const result = hasPermission(null as any, 'organization', 'read')
    expect(result).toBe(false)
  })
  it('should return false when permissions array is empty', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      userId: 'user-123',
      roleId: 'role-none',
      roleName: 'NoPermissions',
      permissions: [],
    }
    const result = hasPermission(orgContext, 'organization', 'read')
    expect(result).toBe(false)
  })
  it('should match exact subject and action combination', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      userId: 'user-123',
      roleId: 'role-member',
      roleName: 'Member',
      permissions: [
        { subject: 'organization', action: 'read' },
        { subject: 'team', action: 'update' },
      ],
    }
    // Should match
    expect(hasPermission(orgContext, 'organization', 'read')).toBe(true)
    expect(hasPermission(orgContext, 'team', 'update')).toBe(true)
    // Should not match (wrong combination)
    expect(hasPermission(orgContext, 'organization', 'update')).toBe(false)
    expect(hasPermission(orgContext, 'team', 'read')).toBe(false)
  })
})
describe('requirePermission Helper Function', () => {
  it('should not throw when user has permission', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      userId: 'user-123',
      roleId: 'role-admin',
      roleName: 'Admin',
      permissions: [{ subject: 'organization', action: 'delete' }],
    }
    expect(() => {
      requirePermission(orgContext, 'organization', 'delete')
    }).not.toThrow()
  })
  it('should throw ForbiddenException when user lacks permission', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      userId: 'user-123',
      roleId: 'role-member',
      roleName: 'Member',
      permissions: [{ subject: 'organization', action: 'read' }],
    }
    expect(() => {
      requirePermission(orgContext, 'organization', 'delete')
    }).toThrow(ForbiddenException)
    expect(() => {
      requirePermission(orgContext, 'organization', 'delete')
    }).toThrow(/Missing required permission: organization:delete/)
    expect(() => {
      requirePermission(orgContext, 'organization', 'delete')
    }).toThrow(/Current role: Member/)
  })
  it('should throw ForbiddenException when organization context is undefined', () => {
    expect(() => {
      requirePermission(undefined, 'organization', 'read')
    }).toThrow(ForbiddenException)
    expect(() => {
      requirePermission(undefined, 'organization', 'read')
    }).toThrow(/Missing required permission: organization:read/)
  })
  it('should throw ForbiddenException when organization context is null', () => {
    expect(() => {
      requirePermission(null as any, 'organization', 'read')
    }).toThrow(ForbiddenException)
  })
  it('should include role name in error message when context exists', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      userId: 'user-123',
      roleId: 'role-viewer',
      roleName: 'Viewer',
      permissions: [],
    }
    expect(() => {
      requirePermission(orgContext, 'team', 'create')
    }).toThrow(/Missing required permission: team:create/)
    expect(() => {
      requirePermission(orgContext, 'team', 'create')
    }).toThrow(/Current role: Viewer/)
  })
  it('should not include role name when context is missing', () => {
    expect(() => {
      requirePermission(undefined, 'organization', 'read')
    }).toThrow(/Missing required permission: organization:read/)
    // Should not contain "Current role:"
    try {
      requirePermission(undefined, 'organization', 'read')
    } catch (error: any) {
      expect(error.message).not.toContain('Current role:')
    }
  })
  it('should handle special characters in subject and action', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      userId: 'user-123',
      roleId: 'role-admin',
      roleName: 'Admin',
      permissions: [{ subject: 'billing-invoice', action: 'export-pdf' }],
    }
    expect(() => {
      requirePermission(orgContext, 'billing-invoice', 'export-pdf')
    }).not.toThrow()
    expect(() => {
      requirePermission(orgContext, 'billing-invoice', 'delete')
    }).toThrow(/Missing required permission: billing-invoice:delete/)
  })
})
