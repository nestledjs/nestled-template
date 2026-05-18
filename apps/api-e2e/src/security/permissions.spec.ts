import { describe, it, expect, beforeAll } from 'vitest'
import { TestHelpers, TestUser } from '../support/test-helpers'
/**
 * CRITICAL SECURITY TESTS: Permission Enforcement
 *
 * These tests verify that the RBAC system correctly enforces permissions
 * based on user roles. A failure in any of these tests represents a
 * CRITICAL SECURITY VULNERABILITY.
 *
 * Test Coverage:
 * - Owner permissions (full access)
 * - Admin permissions (cannot delete org or transfer ownership)
 * - Member permissions (read-only, cannot modify)
 * - Permission guards block unauthorized actions
 * - Role hierarchy is respected
 */
describe('CRITICAL: Permission Enforcement', () => {
  let owner: TestUser & {
    organizationId: string
    roleId: string
  }
  let admin: TestUser & {
    organizationId: string
    roleId: string
  }
  let member: TestUser & {
    organizationId: string
    roleId: string
  }
  let roleIds: {
    owner: string
    admin: string
    member: string
  }
  beforeAll(async () => {
    // Create organization owner
    const ownerData = {
      email: TestHelpers.generateTestEmail('owner'),
      password: 'SecurePass123!',
      firstName: 'Test',
      lastName: 'Owner',
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
            firstName
            lastName
          }
        }
      }
    `,
      { input: ownerData },
    )
    owner = {
      id: registerResponse.data.data.register.user.id,
      email:
        registerResponse.data.data.register.user.emails?.find((e: any) => e.primary)?.email ||
        ownerData.email,
      firstName: registerResponse.data.data.register.user.firstName,
      lastName: registerResponse.data.data.register.user.lastName,
      tokens: { accessToken: registerResponse.data.data.register.token },
      organizationId: '',
      roleId: '',
    }
    // Create a new organization for testing (owner will be the owner)
    const createOrgMutation = `
      mutation UserCreateOrganization($input: CreateOrganizationInput!) {
        userCreateOrganization(input: $input) {
          id
          name
        }
      }
    `
    const orgResponse = await TestHelpers.authenticatedGraphql(createOrgMutation, owner, {
      input: { name: 'Permission Test Org' },
    })
    owner.organizationId = orgResponse.data.data.userCreateOrganization.id
    // Get role IDs with permissions
    const rolesResponse = await TestHelpers.authenticatedGraphql(
      `
      query OrganizationRoles($organizationId: String!) {
        organizationRoles(organizationId: $organizationId) {
          id
          name
          permissions {
            id
            subject
            action
          }
        }
      }
    `,
      owner,
      { organizationId: owner.organizationId },
    )
    const roles = rolesResponse.data.data.organizationRoles
    console.log('Available roles:', JSON.stringify(roles, null, 2))
    roleIds = {
      owner: roles.find((r: any) => r.name === 'Owner')?.id || '',
      admin: roles.find((r: any) => r.name === 'Admin')?.id || '',
      member: roles.find((r: any) => r.name === 'Member')?.id || '',
    }
    console.log('Role IDs:', roleIds)
    owner.roleId = roleIds.owner
    // Check owner's membership in the organization
    const ownerMembershipQuery = `
      query UserOrganizationMembers($organizationId: String!) {
        userOrganizationMembers(organizationId: $organizationId) {
          id
          userId
          role {
            id
            name
          }
        }
      }
    `
    const membershipResponse = await TestHelpers.authenticatedGraphql(ownerMembershipQuery, owner, {
      organizationId: owner.organizationId,
    })
    console.log('Owner membership:', JSON.stringify(membershipResponse.data.data, null, 2))
    // Create admin user
    const adminData = {
      email: TestHelpers.generateTestEmail('admin'),
      password: 'SecurePass123!',
      firstName: 'Test',
      lastName: 'Admin',
    }
    const adminRegResponse = await TestHelpers.graphql(
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
            firstName
            lastName
          }
        }
      }
    `,
      { input: adminData },
    )
    admin = {
      id: adminRegResponse.data.data.register.user.id,
      email:
        adminRegResponse.data.data.register.user.emails?.find((e: any) => e.primary)?.email ||
        adminData.email,
      firstName: adminRegResponse.data.data.register.user.firstName,
      lastName: adminRegResponse.data.data.register.user.lastName,
      tokens: { accessToken: adminRegResponse.data.data.register.token },
      organizationId: owner.organizationId,
      roleId: roleIds.admin,
    }
    // Create member user
    const memberData = {
      email: TestHelpers.generateTestEmail('member'),
      password: 'SecurePass123!',
      firstName: 'Test',
      lastName: 'Member',
    }
    const memberRegResponse = await TestHelpers.graphql(
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
            firstName
            lastName
          }
        }
      }
    `,
      { input: memberData },
    )
    member = {
      id: memberRegResponse.data.data.register.user.id,
      email:
        memberRegResponse.data.data.register.user.emails?.find((e: any) => e.primary)?.email ||
        memberData.email,
      firstName: memberRegResponse.data.data.register.user.firstName,
      lastName: memberRegResponse.data.data.register.user.lastName,
      tokens: { accessToken: memberRegResponse.data.data.register.token },
      organizationId: owner.organizationId,
      roleId: roleIds.member,
    }
    // Owner invites admin and member to the organization
    // Create invitations
    const createInvitationMutation = `
      mutation CreateInvitation($input: CreateInvitationInput!) {
        createOrganizationInvitation(input: $input)
      }
    `
    const adminInviteResponse = await TestHelpers.authenticatedGraphql(
      createInvitationMutation,
      owner,
      {
        input: {
          email: admin.email,
          organizationId: owner.organizationId,
          roleId: roleIds.admin,
        },
      },
    )
    if (adminInviteResponse.data.errors) {
      console.error('Admin invitation failed:', adminInviteResponse.data.errors)
      throw new Error(
        `Failed to create admin invitation: ${JSON.stringify(adminInviteResponse.data.errors)}`,
      )
    }
    const memberInviteResponse = await TestHelpers.authenticatedGraphql(
      createInvitationMutation,
      owner,
      {
        input: {
          email: member.email,
          organizationId: owner.organizationId,
          roleId: roleIds.member,
        },
      },
    )
    if (memberInviteResponse.data.errors) {
      console.error('Member invitation failed:', memberInviteResponse.data.errors)
      throw new Error(
        `Failed to create member invitation: ${JSON.stringify(memberInviteResponse.data.errors)}`,
      )
    }
    const adminToken = adminInviteResponse.data.data.createOrganizationInvitation
    const memberToken = memberInviteResponse.data.data.createOrganizationInvitation
    console.log('\n🔍 Invitation tokens:')
    console.log(`  - Admin token: ${adminToken}`)
    console.log(`  - Member token: ${memberToken}`)
    console.log(`  - Expected admin role ID: ${roleIds.admin}`)
    console.log(`  - Expected member role ID: ${roleIds.member}`)
    // Check invitation details before acceptance
    const adminInviteDetailsQuery = `
      query GetInvitationDetails($token: String!) {
        getInvitationDetails(token: $token) {
          email
          roleName
          organizationName
        }
      }
    `
    const adminInviteDetails = await TestHelpers.graphql(adminInviteDetailsQuery, {
      token: adminToken,
    })
    console.log(
      '\n🔍 Admin invitation details:',
      JSON.stringify(adminInviteDetails.data.data, null, 2),
    )
    // Accept invitations
    const acceptInvitationMutation = `
      mutation AcceptInvitation($input: AcceptInvitationInput!) {
        acceptOrganizationInvitation(input: $input) {
          id
          name
        }
      }
    `
    const adminAcceptResponse = await TestHelpers.authenticatedGraphql(
      acceptInvitationMutation,
      admin,
      { input: { token: adminToken } },
    )
    if (adminAcceptResponse.data.errors) {
      console.error('Admin invitation acceptance failed:', adminAcceptResponse.data.errors)
      throw new Error(
        `Failed to accept admin invitation: ${JSON.stringify(adminAcceptResponse.data.errors)}`,
      )
    }
    // Verify admin got the correct role
    const adminRoleCheckQuery = `
      query UserOrganizationMembers($organizationId: String!) {
        userOrganizationMembers(organizationId: $organizationId) {
          userId
          role {
            name
          }
        }
      }
    `
    const adminRoleCheck = await TestHelpers.authenticatedGraphql(adminRoleCheckQuery, owner, {
      organizationId: owner.organizationId,
    })
    const adminMembership = adminRoleCheck.data.data.userOrganizationMembers.find(
      (m: any) => m.userId === admin.id,
    )
    console.log(`\n🔍 Admin role after acceptance: ${adminMembership?.role?.name || 'NOT FOUND'}`)
    console.log(`  - Admin user ID: ${admin.id}`)
    console.log(
      `  - All members:`,
      adminRoleCheck.data.data.userOrganizationMembers.map((m: any) => ({
        userId: m.userId,
        role: m.role.name,
      })),
    )
    const memberAcceptResponse = await TestHelpers.authenticatedGraphql(
      acceptInvitationMutation,
      member,
      { input: { token: memberToken } },
    )
    if (memberAcceptResponse.data.errors) {
      console.error('Member invitation acceptance failed:', memberAcceptResponse.data.errors)
      throw new Error(
        `Failed to accept member invitation: ${JSON.stringify(memberAcceptResponse.data.errors)}`,
      )
    }

    const switchOrganizationMutation = `
      mutation SwitchActiveOrganization($input: SwitchOrganizationInput!) {
        switchActiveOrganization(input: $input) {
          id
          activeOrganizationId
        }
      }
    `
    await TestHelpers.authenticatedGraphql(switchOrganizationMutation, admin, {
      input: { organizationId: owner.organizationId },
    })
    await TestHelpers.authenticatedGraphql(switchOrganizationMutation, member, {
      input: { organizationId: owner.organizationId },
    })

    console.log('\n📋 Permission Test Setup Complete:')
    console.log(`  - Owner: ${owner.email}`)
    console.log(`  - Admin: ${admin.email}`)
    console.log(`  - Member: ${member.email}`)
    console.log(`  - Organization: ${owner.organizationId}`)
    console.log(`  - Admin accepted invitation: ${JSON.stringify(adminAcceptResponse.data.data)}`)
    console.log(`  - Member accepted invitation: ${JSON.stringify(memberAcceptResponse.data.data)}`)
  })
  describe('Owner Permissions', () => {
    it('owner can update organization', async () => {
      const updateMutation = `
        mutation UserUpdateOrganization($input: UpdateOrganizationInput!) {
          userUpdateOrganization(input: $input) {
            id
            name
          }
        }
      `
      const response = await TestHelpers.authenticatedGraphql(updateMutation, owner, {
        input: { name: 'Updated Permission Test Org' },
      })
      expect(response.data.errors).toBeUndefined()
      expect(response.data.data.userUpdateOrganization.name).toBe('Updated Permission Test Org')
    })
    it('owner can invite members', async () => {
      const inviteMutation = `
        mutation CreateInvitation($input: CreateInvitationInput!) {
          createOrganizationInvitation(input: $input)
        }
      `
      const newMemberEmail = TestHelpers.generateTestEmail('new-member')
      const response = await TestHelpers.authenticatedGraphql(inviteMutation, owner, {
        input: {
          email: newMemberEmail,
          organizationId: owner.organizationId,
          roleId: roleIds.member,
        },
      })
      expect(response.data.errors).toBeUndefined()
      expect(response.data.data.createOrganizationInvitation).toBeDefined()
    })
    it('owner can change member roles', async () => {
      // Create a temporary member to change their role (to avoid breaking other tests)
      const tempMemberEmail = TestHelpers.generateTestEmail('temp-role-change')
      // Owner invites a new temp member
      const inviteResponse = await TestHelpers.authenticatedGraphql(
        `mutation CreateInvitation($input: CreateInvitationInput!) {
          createOrganizationInvitation(input: $input)
        }`,
        owner,
        {
          input: {
            email: tempMemberEmail,
            organizationId: owner.organizationId,
            roleId: roleIds.member,
          },
        },
      )
      // Register the temp user
      const tempUserReg = await TestHelpers.graphql(
        `
        mutation Register($input: RegisterInput!) {
          register(input: $input) {
            token
            user {
              id
            }
          }
        }
      `,
        {
          input: {
            email: tempMemberEmail,
            password: 'TempPass123!',
            firstName: 'Temp',
            lastName: 'User',
          },
        },
      )
      const tempUser = {
        id: tempUserReg.data.data.register.user.id,
        tokens: { accessToken: tempUserReg.data.data.register.token },
      }
      // Accept invitation
      const tempToken = inviteResponse.data.data.createOrganizationInvitation
      await TestHelpers.authenticatedGraphql(
        `mutation AcceptInvitation($input: AcceptInvitationInput!) {
          acceptOrganizationInvitation(input: $input) { id }
        }`,
        tempUser as any,
        { input: { token: tempToken } },
      )
      // Now change the temp user's role from Member to Admin
      const updateRoleMutation = `
        mutation UpdateMemberRole($input: UpdateMemberRoleInput!) {
          updateOrganizationMemberRole(input: $input)
        }
      `
      const response = await TestHelpers.authenticatedGraphql(updateRoleMutation, owner, {
        input: {
          organizationId: owner.organizationId,
          userId: tempUser.id,
          roleId: roleIds.admin,
        },
      })
      expect(response.data.errors).toBeUndefined()
    })
    it('owner can delete organization', async () => {
      // Create a temporary organization to delete
      const tempOwnerData = {
        email: TestHelpers.generateTestEmail('temp-owner'),
        password: 'SecurePass123!',
        firstName: 'Temp',
        lastName: 'Owner',
      }
      const regResponse = await TestHelpers.graphql(
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
        { input: tempOwnerData },
      )
      const tempOwner = {
        id: regResponse.data.data.register.user.id,
        email:
          regResponse.data.data.register.user.emails?.find((e: any) => e.primary)?.email ||
          tempOwnerData.email,
        firstName: tempOwnerData.firstName,
        lastName: tempOwnerData.lastName,
        tokens: { accessToken: regResponse.data.data.register.token },
      }
      // Create an organization to delete
      const createOrgResponse = await TestHelpers.authenticatedGraphql(
        `
        mutation UserCreateOrganization($input: CreateOrganizationInput!) {
          userCreateOrganization(input: $input) {
            id
          }
        }
      `,
        tempOwner as TestUser,
        { input: { name: 'Temp Org To Delete' } },
      )
      const tempOrgId = createOrgResponse.data.data.userCreateOrganization.id
      // Delete the organization
      const deleteMutation = `
        mutation UserDeleteOrganization($organizationId: String!) {
          userDeleteOrganization(organizationId: $organizationId)
        }
      `
      const deleteResponse = await TestHelpers.authenticatedGraphql(
        deleteMutation,
        tempOwner as TestUser,
        { organizationId: tempOrgId },
      )
      expect(deleteResponse.data.errors).toBeUndefined()
      expect(deleteResponse.data.data.userDeleteOrganization).toBe(true)
    })
  })
  describe('Admin Permissions', () => {
    it('admin cannot update organization settings', async () => {
      const updateMutation = `
        mutation UserUpdateOrganization($input: UpdateOrganizationInput!) {
          userUpdateOrganization(input: $input) {
            id
            name
          }
        }
      `
      const response = await TestHelpers.authenticatedGraphql(updateMutation, admin, {
        input: { name: 'Hacked by Admin' },
      })
      // Should return error - admins cannot update org settings (owner only)
      expect(response.data.errors).toBeDefined()
      expect(response.data.errors[0].message).toMatch(/forbidden|unauthorized|permission/i)
    })
    it('admin can invite members', async () => {
      // Verify admin is a member of the organization
      const membersQuery = `
        query UserOrganizationMembers($organizationId: String!) {
          userOrganizationMembers(organizationId: $organizationId) {
            id
            userId
            role {
              id
              name
              permissions {
                subject
                action
              }
            }
          }
        }
      `
      const memberCheck = await TestHelpers.authenticatedGraphql(membersQuery, admin, {
        organizationId: owner.organizationId,
      })
      console.log('Admin membership check:', JSON.stringify(memberCheck.data.data, null, 2))
      const inviteMutation = `
        mutation CreateInvitation($input: CreateInvitationInput!) {
          createOrganizationInvitation(input: $input)
        }
      `
      const newMemberEmail = TestHelpers.generateTestEmail('admin-invited')
      const response = await TestHelpers.authenticatedGraphql(inviteMutation, admin, {
        input: {
          email: newMemberEmail,
          organizationId: owner.organizationId,
          roleId: roleIds.member,
        },
      })
      // Admin should be able to invite members
      expect(response.data.errors).toBeUndefined()
      expect(response.data.data.createOrganizationInvitation).toBeDefined()
    })
    it('admin cannot change member roles', async () => {
      const membersQuery = `
        query UserOrganizationMembers($organizationId: String!) {
          userOrganizationMembers(organizationId: $organizationId) {
            id
            userId
          }
        }
      `
      const membersResponse = await TestHelpers.authenticatedGraphql(membersQuery, admin, {
        organizationId: owner.organizationId,
      })
      const members = membersResponse.data.data.userOrganizationMembers
      const targetMember = members.find((m: any) => m.userId === member.id)
      if (targetMember) {
        const updateRoleMutation = `
          mutation UpdateMemberRole($input: UpdateMemberRoleInput!) {
            updateOrganizationMemberRole(input: $input)
          }
        `
        const response = await TestHelpers.authenticatedGraphql(updateRoleMutation, admin, {
          input: {
            organizationId: owner.organizationId,
            userId: targetMember.userId,
            roleId: roleIds.admin,
          },
        })
        // Should fail - admins cannot change member roles (requires member:update permission)
        expect(response.data.errors).toBeDefined()
        expect(response.data.errors[0].message).toMatch(/forbidden|unauthorized|permission/i)
      }
    })
    it('admin cannot delete organization', async () => {
      const deleteMutation = `
        mutation UserDeleteOrganization($organizationId: String!) {
          userDeleteOrganization(organizationId: $organizationId)
        }
      `
      const response = await TestHelpers.authenticatedGraphql(deleteMutation, admin, {
        organizationId: owner.organizationId,
      })
      // Should fail - only owner can delete org
      expect(response.data.errors).toBeDefined()
      expect(response.data.errors[0].message).toMatch(/forbidden|unauthorized|permission|owner/i)
    })
  })
  describe('Member Permissions', () => {
    it('member cannot update organization settings', async () => {
      const updateMutation = `
        mutation UserUpdateOrganization($input: UpdateOrganizationInput!) {
          userUpdateOrganization(input: $input) {
            id
            name
          }
        }
      `
      const response = await TestHelpers.authenticatedGraphql(updateMutation, member, {
        input: { name: 'Hacked by Member' },
      })
      // Should fail
      expect(response.data.errors).toBeDefined()
      expect(response.data.errors[0].message).toMatch(/forbidden|unauthorized|permission/i)
    })
    it('member cannot invite other members', async () => {
      const inviteMutation = `
        mutation CreateInvitation($input: CreateInvitationInput!) {
          createOrganizationInvitation(input: $input)
        }
      `
      const newMemberEmail = TestHelpers.generateTestEmail('member-invited')
      const response = await TestHelpers.authenticatedGraphql(inviteMutation, member, {
        input: {
          email: newMemberEmail,
          organizationId: owner.organizationId,
          roleId: roleIds.member,
        },
      })
      // Should fail
      expect(response.data.errors).toBeDefined()
      expect(response.data.errors[0].message).toMatch(/forbidden|unauthorized|permission/i)
    })
    it('member cannot remove other members', async () => {
      const removeMutation = `
        mutation RemoveMember($input: RemoveOrganizationMemberInput!) {
          removeOrganizationMember(input: $input)
        }
      `
      const response = await TestHelpers.authenticatedGraphql(removeMutation, member, {
        input: {
          organizationId: owner.organizationId,
          userId: admin.id,
        },
      })
      // Should fail
      expect(response.data.errors).toBeDefined()
      expect(response.data.errors[0].message).toMatch(/forbidden|unauthorized|permission/i)
    })
    it('member can view organization information', async () => {
      const orgQuery = `
        query MyOrganizations {
          myOrganizations {
            id
            name
          }
        }
      `
      const response = await TestHelpers.authenticatedGraphql(orgQuery, member)
      // Should succeed - members can view org info
      expect(response.data.errors).toBeUndefined()
      const orgs = response.data.data.myOrganizations
      expect(orgs).toBeDefined()
      expect(orgs.some((o: any) => o.id === owner.organizationId)).toBe(true)
    })
    it('member can view other members', async () => {
      const membersQuery = `
        query UserOrganizationMembers($organizationId: String!) {
          userOrganizationMembers(organizationId: $organizationId) {
            id
            userId
          }
        }
      `
      const response = await TestHelpers.authenticatedGraphql(membersQuery, member, {
        organizationId: owner.organizationId,
      })
      // Should succeed - members can view other members
      expect(response.data.errors).toBeUndefined()
      expect(response.data.data.userOrganizationMembers).toBeDefined()
      expect(response.data.data.userOrganizationMembers.length).toBeGreaterThan(0)
    })
  })
  describe('Permission Guard Enforcement', () => {
    it('should block unauthorized mutation attempts', async () => {
      // Member tries to perform owner-only action
      const transferMutation = `
        mutation TransferOwnership($input: TransferOrganizationOwnershipInput!) {
          transferOrganizationOwnership(input: $input)
        }
      `
      try {
        const response = await TestHelpers.authenticatedGraphql(transferMutation, member, {
          input: {
            organizationId: owner.organizationId,
            newOwnerUserId: member.id,
          },
        })
        // Should have GraphQL errors
        expect(response.data.errors).toBeDefined()
        expect(response.data.errors[0].message).toMatch(/forbidden|unauthorized|permission|owner/i)
      } catch (error: any) {
        // 400 errors are acceptable if the request is blocked at GraphQL schema level
        expect(error.response?.status).toBe(400)
      }
    })
    it('should enforce permissions consistently across all endpoints', async () => {
      // Test multiple endpoints to ensure consistent permission enforcement
      const mutations = [
        {
          name: 'Update Organization',
          query: `mutation UserUpdateOrganization($input: UpdateOrganizationInput!) {
            userUpdateOrganization(input: $input) { id }
          }`,
          variables: {
            input: { name: 'Test' },
          },
        },
        {
          name: 'Delete Organization',
          query: `mutation UserDeleteOrganization($organizationId: String!) {
            userDeleteOrganization(organizationId: $organizationId)
          }`,
          variables: { organizationId: owner.organizationId },
        },
      ]
      for (const mutation of mutations) {
        const response = await TestHelpers.authenticatedGraphql(
          mutation.query,
          member,
          mutation.variables,
        )
        expect(response.data.errors).toBeDefined()
        expect(response.data.errors[0].message).toMatch(/forbidden|unauthorized|permission|owner/i)
      }
    })
  })
})
