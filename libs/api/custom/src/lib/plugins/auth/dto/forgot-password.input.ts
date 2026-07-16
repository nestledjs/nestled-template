import { Field, InputType } from '@nestjs/graphql'
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

@InputType()
export class ForgotPasswordInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  @MaxLength(254) // RFC 5321 §4.5.3.1.3 maximum path length
  @IsEmail()
  email!: string

  // Cloudflare Turnstile token. Nullable so clients built against a deployment with Turnstile
  // disabled keep compiling; a missing token is only rejected when TURNSTILE_SECRET_KEY is set.
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string
}
