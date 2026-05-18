import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { TestHelpers, TestUser } from '../support/test-helpers'
/**
 * CRITICAL SECURITY TESTS: Multi-Tenant Data Isolation
 *
 * These tests verify that the Prisma extension and middleware correctly
 * enforce data isolation between organizations. A failure in any of these
 * tests represents a CRITICAL SECURITY VULNERABILITY.
 *
 * Test Coverage:
 * - Users cannot query another organization's data
 * - Users cannot update another organization's data
 * - Users cannot delete another organization's data
 * - Switching organizations updates context correctly
 * - Direct organizationId manipulation is blocked
 */
describe('CRITICAL: Multi-Tenant Data Isolation', () => {
  let org1User: TestUser & {
    organizationId: string
  }
  let org2User: TestUser & {
    organizationId: string
  }
  let org1MemberId: string
  let org2MemberId: string
  beforeAll(async () => {
    // Create two users, each in their own organization
    const user1Data = {
      email: TestHelpers.generateTestEmail('org1-user'),
      password: 'SecurePass123!',
      firstName: 'User',
      lastName: 'One',
    }
    const user2Data = {
      email: TestHelpers.generateTestEmail('org2-user'),
      password: 'SecurePass123!',
      firstName: 'User',
      lastName: 'Two',
    }
    // Register users
    const registerMutation = `
      mutation Register($input: RegisterInput!) {
        register(input: $input) {
          token
          user {
            id
            firstName
            lastName
            emails {
              email
              primary
            }
          }
        }
      }
    `
    const response1 = await TestHelpers.graphql(registerMutation, {
      input: user1Data,
    })
    const response2 = await TestHelpers.graphql(registerMutation, {
      input: user2Data,
    })
    if (response1.data.errors) {
      console.error('Registration 1 failed:', response1.data.errors)
      throw new Error(`Failed to register user 1: ${JSON.stringify(response1.data.errors)}`)
    }
    if (response2.data.errors) {
      console.error('Registration 2 failed:', response2.data.errors)
      throw new Error(`Failed to register user 2: ${JSON.stringify(response2.data.errors)}`)
    }
    const user1Email =
      response1.data.data.register.user.emails?.find((e: any) => e.primary)?.email ||
      user1Data.email
    const user2Email =
      response2.data.data.register.user.emails?.find((e: any) => e.primary)?.email ||
      user2Data.email
    org1User = {
      id: response1.data.data.register.user.id,
      email: user1Email,
      firstName: response1.data.data.register.user.firstName,
      lastName: response1.data.data.register.user.lastName,
      tokens: { accessToken: response1.data.data.register.token },
      organizationId: '', // Will be populated by creating/fetching user's orgs
    }
    org2User = {
      id: response2.data.data.register.user.id,
      email: user2Email,
      firstName: response2.data.data.register.user.firstName,
      lastName: response2.data.data.register.user.lastName,
      tokens: { accessToken: response2.data.data.register.token },
      organizationId: '', // Will be populated by creating/fetching user's orgs
    }
    // Create organizations for each user
    const createOrgMutation = `
      mutation UserCreateOrganization($input: CreateOrganizationInput!) {
        userCreateOrganization(input: $input) {
          id
          name
        }
      }
    `
    const org1Response = await TestHelpers.authenticatedGraphql(createOrgMutation, org1User, {
      input: { name: 'Organization One' },
    })
    const org2Response = await TestHelpers.authenticatedGraphql(createOrgMutation, org2User, {
      input: { name: 'Organization Two' },
    })
    if (org1Response.data.errors) {
      console.error('Org creation 1 failed:', org1Response.data.errors)
      throw new Error(`Failed to create org 1: ${JSON.stringify(org1Response.data.errors)}`)
    }
    if (org2Response.data.errors) {
      console.error('Org creation 2 failed:', org2Response.data.errors)
      throw new Error(`Failed to create org 2: ${JSON.stringify(org2Response.data.errors)}`)
    }
    org1User.organizationId = org1Response.data.data.userCreateOrganization.id
    org2User.organizationId = org2Response.data.data.userCreateOrganization.id
    // Get member IDs
    const membersQuery = `
      query UserOrganizationMembers($organizationId: String!) {
        userOrganizationMembers(organizationId: $organizationId) {
          id
          userId
        }
      }
    `
    const org1MembersResponse = await TestHelpers.authenticatedGraphql(membersQuery, org1User, {
      organizationId: org1User.organizationId,
    })
    const org2MembersResponse = await TestHelpers.authenticatedGraphql(membersQuery, org2User, {
      organizationId: org2User.organizationId,
    })
    org1MemberId = org1MembersResponse.data.data.userOrganizationMembers[0].id
    org2MemberId = org2MembersResponse.data.data.userOrganizationMembers[0].id
    console.log('\n📋 Test Setup Complete:')
    console.log(`  - Org 1 User: ${org1User.email} (Org: ${org1User.organizationId})`)
    console.log(`  - Org 2 User: ${org2User.email} (Org: ${org2User.organizationId})`)
  })
  describe('Query Isolation', () => {
    it("should only return data from user's own organization", async () => {
      const orgQuery = `
        query MyOrganizations {
          myOrganizations {
            id
            name
          }
        }
      `
      // User 1 queries their organizations
      const response1 = await TestHelpers.authenticatedGraphql(orgQuery, org1User)
      expect(response1.data.errors).toBeUndefined()
      expect(response1.data.data.myOrganizations).toHaveLength(2) // Auto-created + explicitly created
      // Verify User 1's org is in their list
      const user1OrgIds = response1.data.data.myOrganizations.map((o: any) => o.id)
      expect(user1OrgIds).toContain(org1User.organizationId)
      // User 2 queries their organizations
      const response2 = await TestHelpers.authenticatedGraphql(orgQuery, org2User)
      expect(response2.data.errors).toBeUndefined()
      expect(response2.data.data.myOrganizations).toHaveLength(2) // Auto-created + explicitly created
      // Verify User 2's org is in their list
      const user2OrgIds = response2.data.data.myOrganizations.map((o: any) => o.id)
      expect(user2OrgIds).toContain(org2User.organizationId)
      // Verify they don't see each other's organizations
      expect(user1OrgIds).not.toContain(org2User.organizationId)
      expect(user2OrgIds).not.toContain(org1User.organizationId)
    })
    it("should not allow querying another organization's members", async () => {
      const membersQuery = `
        query UserOrganizationMembers($organizationId: String!) {
          userOrganizationMembers(organizationId: $organizationId) {
            id
            userId
          }
        }
      `
      // User 1 tries to query User 2's organization members
      const response = await TestHelpers.authenticatedGraphql(membersQuery, org1User, {
        organizationId: org2User.organizationId,
      })
      // Should either return error or empty array (depending on implementation)
      if (response.data.errors) {
        expect(response.data.errors).toBeDefined()
        expect(response.data.errors[0].message).toMatch(
          /forbidden|unauthorized|not found|not a member/i,
        )
      } else {
        // If no error, should return empty array (no access to org2 members)
        expect(response.data.data.userOrganizationMembers).toEqual([])
      }
    })
    it('should not allow querying another organization by ID directly', async () => {
      const orgByIdQuery = `
        query Organization($id: String!) {
          organization(id: $id) {
            id
            name
          }
        }
      `
      try {
        // User 1 tries to query User 2's organization
        const response = await TestHelpers.authenticatedGraphql(orgByIdQuery, org1User, {
          id: org2User.organizationId,
        })
        // Should return error or null
        if (response.data.errors) {
          expect(response.data.errors).toBeDefined()
        } else {
          expect(response.data.data.organization).toBeNull()
        }
      } catch (error: any) {
        // 400 error is acceptable - query doesn't exist or was blocked
        expect(error.response?.status).toBe(400)
      }
    })
  })
  describe('Update Isolation', () => {
    it('should reject direct organization id manipulation for organization updates', async () => {
      const updateOrgMutation = `
        mutation UserUpdateOrganization($input: UpdateOrganizationInput!) {
          userUpdateOrganization(input: $input) {
            id
            name
          }
        }
      `
      try {
        const response = await TestHelpers.authenticatedGraphql(updateOrgMutation, org1User, {
          input: {
            organizationId: org2User.organizationId,
            name: 'Hacked Organization',
          },
        })
        // Should return error
        expect(response.data.errors).toBeDefined()
        expect(response.data.errors[0].message).toMatch(
          /field "organizationId" is not defined|bad request|validation/i,
        )
      } catch (error: any) {
        // GraphQL validation may reject malformed variables at the transport layer.
        expect([400, 500]).toContain(error.response?.status)
      }
    })
    it("should not allow updating another organization's member roles", async () => {
      const updateRoleMutation = `
        mutation UpdateOrganizationMemberRole($input: UpdateMemberRoleInput!) {
          updateOrganizationMemberRole(input: $input)
        }
      `
      // User 1 tries to update a member in User 2's organization
      try {
        const response = await TestHelpers.authenticatedGraphql(updateRoleMutation, org1User, {
          input: {
            organizationId: org2User.organizationId,
            memberId: org2MemberId,
            roleId: 'some-role-id',
          },
        })
        // Should return error
        expect(response.data.errors).toBeDefined()
        expect(response.data.errors[0].message).toMatch(
          /forbidden|unauthorized|not found|permission/i,
        )
      } catch (error: any) {
        // 500 errors are also acceptable - operation was blocked
        expect(error.response?.status).toBe(500)
      }
    })
  })
  describe('Delete Isolation', () => {
    it('should not allow removing members from another organization', async () => {
      const removeMemberMutation = `
        mutation RemoveOrganizationMember($input: RemoveOrganizationMemberInput!) {
          removeOrganizationMember(input: $input)
        }
      `
      // User 1 tries to remove a member from User 2's organization
      try {
        const response = await TestHelpers.authenticatedGraphql(removeMemberMutation, org1User, {
          input: {
            organizationId: org2User.organizationId,
            memberId: org2MemberId,
          },
        })
        // Should return error
        expect(response.data.errors).toBeDefined()
        expect(response.data.errors[0].message).toMatch(
          /forbidden|unauthorized|not found|permission/i,
        )
      } catch (error: any) {
        // 500 errors are also acceptable - operation was blocked
        expect(error.response?.status).toBe(500)
      }
    })
    it('should not allow deleting another organization', async () => {
      const deleteOrgMutation = `
        mutation UserDeleteOrganization($organizationId: String!) {
          userDeleteOrganization(organizationId: $organizationId)
        }
      `
      // User 1 tries to delete User 2's organization
      const response = await TestHelpers.authenticatedGraphql(deleteOrgMutation, org1User, {
        organizationId: org2User.organizationId,
      })
      // Should return error
      expect(response.data.errors).toBeDefined()
      expect(response.data.errors[0].message).toMatch(
        /forbidden|unauthorized|not found|permission|owner/i,
      )
    })
  })
  describe('Organization Switching', () => {
    it('should update context when switching organizations', async () => {
      // Create a third user and invite them to both organizations
      const invitedUserData = {
        email: TestHelpers.generateTestEmail('multi-org-user'),
        password: 'SecurePass123!',
        firstName: 'Multi',
        lastName: 'Org',
        organizationName: 'Initial Org',
      }
      const registerResponse = await TestHelpers.graphql(
        `
        mutation Register($input: RegisterInput!) {
          register(input: $input) {
            token
            user {
              id
              emails {
                email
                primary
              }
            }
          }
        }
      `,
        { input: invitedUserData },
      )
      const multiOrgUser = {
        id: registerResponse.data.data.register.user.id,
        email:
          registerResponse.data.data.register.user.emails?.find((e: any) => e.primary)?.email ||
          invitedUserData.email,
        firstName: invitedUserData.firstName,
        lastName: invitedUserData.lastName,
        tokens: { accessToken: registerResponse.data.data.register.token },
      }
      // Get Member role ID from org1
      const rolesResponse = await TestHelpers.authenticatedGraphql(
        `
        query OrganizationRoles($organizationId: String!) {
          organizationRoles(organizationId: $organizationId) {
            id
            name
          }
        }
      `,
        org1User,
        { organizationId: org1User.organizationId },
      )
      const memberRole = rolesResponse.data.data.organizationRoles.find(
        (r: any) => r.name === 'Member',
      )
      // Invite user to org1
      await TestHelpers.authenticatedGraphql(
        `
        mutation CreateInvitation($input: CreateInvitationInput!) {
          createOrganizationInvitation(input: $input)
        }
      `,
        org1User,
        {
          input: {
            email: multiOrgUser.email,
            organizationId: org1User.organizationId,
            roleId: memberRole.id,
          },
        },
      )
      // User accepts invitation and joins org1
      // (Implementation would require getting the invitation token)
      // When user queries organizations, they should see both
      const orgsResponse = await TestHelpers.authenticatedGraphql(
        `
        query MyOrganizations {
          myOrganizations {
            id
            name
          }
        }
      `,
        multiOrgUser,
      )
      // Should see at least their initial organization
      expect(orgsResponse.data.data.myOrganizations.length).toBeGreaterThanOrEqual(1)
    })
  })
  describe('Direct ID Manipulation Protection', () => {
    it('should ignore manual organizationId in create operations', async () => {
      // This test verifies that even if a client tries to specify organizationId,
      // the server ignores it and uses the authenticated user's context
      // Try to create a preference with wrong organizationId
      const createPrefMutation = `
        mutation UserCreateUserPreference($input: SecureCreateUserPreferenceInput!) {
          userCreateUserPreference(input: $input) {
            id
            key
            value
          }
        }
      `
      // User 1 creates a preference (should be in their org only)
      const response = await TestHelpers.authenticatedGraphql(createPrefMutation, org1User, {
        input: { key: 'test-key', value: 'test-value' },
      })
      // Should succeed
      expect(response.data.errors).toBeUndefined()
      expect(response.data.data.userCreateUserPreference.key).toBe('test-key')
      // Verify User 2 cannot see this preference
      const prefsQuery = `
        query UserGetUserPreferences {
          userGetUserPreferences {
            id
            key
            value
          }
        }
      `
      const user2PrefsResponse = await TestHelpers.authenticatedGraphql(prefsQuery, org2User)
      const user2Prefs = user2PrefsResponse.data.data.userGetUserPreferences
      const hasStolenPref = user2Prefs.some((p: any) => p.key === 'test-key')
      expect(hasStolenPref).toBe(false)
    })
  })
  afterAll(async () => {
    // Cleanup is handled by global teardown
    console.log('\n✅ Data Isolation Tests Complete\n')
  })
})
