import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class CreateOrganizationRoleInput {
  @Field()
  organizationId!: string

  @Field()
  name!: string

  @Field({ nullable: true })
  description?: string

  @Field(() => [String])
  permissionKeys!: string[]
}

@InputType()
export class UpdateOrganizationRoleInput extends CreateOrganizationRoleInput {
  @Field()
  roleId!: string
}

@InputType()
export class DeleteOrganizationRoleInput {
  @Field()
  organizationId!: string

  @Field()
  roleId!: string
}
