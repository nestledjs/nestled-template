import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator'
import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class RegisterInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(254) // RFC 5321 §4.5.3.1.3 maximum path length
  @IsEmail()
  email!: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128) // bcrypt silently truncates past 72 bytes; cap well before the hash cost explodes
  password!: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  organizationName?: string

  // Cloudflare Turnstile token from the signup widget. Nullable at the schema level so clients
  // built against a deployment with Turnstile disabled keep compiling; when TURNSTILE_SECRET_KEY
  // is set, a missing token is rejected at the resolver instead.
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string
}
