import { ObjectType, Field, Int, registerEnumType } from '@nestjs/graphql'
import { StorageProvider } from '@nestled-template/api/prisma'
import GraphQLJSON from 'graphql-type-json'

// Register the StorageProvider enum for GraphQL
registerEnumType(StorageProvider, {
  name: 'StorageProvider',
  description: 'The storage provider used for file uploads',
})

@ObjectType()
export class UploadedFile {
  @Field()
  id!: string

  @Field()
  createdAt!: Date

  @Field()
  updatedAt!: Date

  @Field(() => StorageProvider)
  provider!: StorageProvider

  @Field()
  providerFileId!: string

  @Field({ nullable: true })
  folder?: string

  @Field()
  filename!: string

  @Field()
  originalName!: string

  @Field()
  mimeType!: string

  @Field(() => Int)
  size!: number

  @Field()
  url!: string

  @Field({ nullable: true })
  publicUrl?: string

  @Field(() => Int, { nullable: true })
  width?: number

  @Field(() => Int, { nullable: true })
  height?: number

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, any>

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}
