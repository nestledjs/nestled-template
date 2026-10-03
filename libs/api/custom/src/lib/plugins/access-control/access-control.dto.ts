import { Field, InputType, Int, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class PlatformAccessPermission {
  @Field()
  id!: string

  @Field()
  key!: string

  @Field()
  namespace!: string

  @Field()
  action!: string

  @Field({ nullable: true })
  description?: string | null
}

@ObjectType()
export class PlatformAccessPrincipal {
  @Field()
  id!: string

  @Field({ nullable: true })
  displayName?: string | null

  @Field({ nullable: true })
  email?: string | null

  @Field()
  isSuperAdmin!: boolean
}

@ObjectType()
export class PlatformAccessAssignment {
  @Field()
  id!: string

  @Field()
  createdAt!: Date

  @Field(() => PlatformAccessPrincipal)
  principal!: PlatformAccessPrincipal
}

@ObjectType()
export class PlatformAccessRole {
  @Field()
  id!: string

  @Field()
  key!: string

  @Field()
  name!: string

  @Field({ nullable: true })
  description?: string | null

  @Field()
  isSystem!: boolean

  @Field(() => [PlatformAccessPermission])
  permissions!: PlatformAccessPermission[]

  @Field(() => [PlatformAccessAssignment])
  assignments!: PlatformAccessAssignment[]
}

@ObjectType()
export class PlatformAccessSnapshot {
  @Field(() => [PlatformAccessPermission])
  permissions!: PlatformAccessPermission[]

  @Field(() => [PlatformAccessRole])
  roles!: PlatformAccessRole[]
}

@ObjectType()
export class PlatformAccessPrincipalPage {
  @Field(() => [PlatformAccessPrincipal])
  principals!: PlatformAccessPrincipal[]

  @Field(() => Int)
  total!: number
}

@InputType()
export class CreatePlatformAccessRoleInput {
  @Field()
  name!: string

  @Field({ nullable: true })
  description?: string

  @Field(() => [String])
  permissionKeys!: string[]
}

@InputType()
export class UpdatePlatformAccessRoleInput {
  @Field()
  roleId!: string

  @Field()
  name!: string

  @Field({ nullable: true })
  description?: string

  @Field(() => [String])
  permissionKeys!: string[]
}

@InputType()
export class PlatformAccessRoleAssignmentInput {
  @Field()
  roleId!: string

  @Field()
  userId!: string
}
