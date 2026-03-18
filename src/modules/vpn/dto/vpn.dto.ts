import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsIP,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { VpnProtocol } from "../../../../generated/prisma/client.js";

export class CreateVpnConfigDto {
  @ApiProperty({ enum: VpnProtocol, example: VpnProtocol.WIREGUARD })
  @IsEnum(VpnProtocol)
  protocol: VpnProtocol;

  @ApiProperty({ example: "wg0" })
  @IsString()
  @IsNotEmpty()
  interfaceName: string;

  @ApiProperty({ example: "10.10.0.0/24" })
  @IsString()
  @IsNotEmpty()
  subnet: string;

  @ApiProperty({ required: false, example: "203.0.113.1:51820" })
  @IsString()
  @IsOptional()
  endpoint?: string;

  @ApiProperty({ required: false, example: "base64PublicKey==" })
  @IsString()
  @IsOptional()
  publicKey?: string;

  @ApiProperty({
    required: false,
    description: "Full VPN config (will be encrypted)",
  })
  @IsString()
  @IsOptional()
  configData?: string;
}

export class UpdateVpnConfigDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endpoint?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  publicKey?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  configData?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  subnet?: string;
}
