import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateOrganizationDto {
  @ApiProperty({ example: "Acme Corp" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: "admin@acme.com" })
  @IsEmail()
  contactEmail: string;
}

export class UpdateOrganizationDto {
  @ApiProperty({ example: "Acme Corp Updated", required: false })
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ example: "newadmin@acme.com", required: false })
  @IsEmail()
  contactEmail?: string;
}
