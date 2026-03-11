import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsIP,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { RouterProtocol, DeviceVendor } from "@prisma/client";

export class CreateRouterDto {
  @ApiProperty({ example: "core-router-01" })
  @IsString()
  @IsNotEmpty()
  routerName: string;

  @ApiProperty({ example: "10.10.1.1" })
  @IsIP()
  ipAddress: string;

  @ApiProperty({ enum: RouterProtocol, example: RouterProtocol.ROUTEROS_API })
  @IsEnum(RouterProtocol)
  protocol: RouterProtocol;

  @ApiProperty({ enum: DeviceVendor, example: DeviceVendor.GENERIC })
  @IsEnum(DeviceVendor)
  @IsOptional()
  vendor?: DeviceVendor;

  @ApiProperty({
    required: false,
    example: "IOS-XE",
    description: "OS variant (e.g. IOS-XE, NX-OS, Junos, EOS)",
  })
  @IsString()
  @IsOptional()
  osType?: string;

  @ApiProperty({ example: 8729 })
  @IsInt()
  @Min(1)
  @Max(65535)
  apiPort: number;

  @ApiProperty({ example: 22, required: false })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  sshPort?: number;

  @ApiProperty({ example: 830, required: false })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  netconfPort?: number;

  @ApiProperty({ example: "wg0" })
  @IsString()
  @IsNotEmpty()
  vpnInterface: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(3600)
  @IsOptional()
  pollingInterval?: number;

  @ApiProperty({ example: "admin" })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: "routerpassword" })
  @IsString()
  @IsNotEmpty()
  password: string;

  // SSH-specific fields
  @ApiProperty({ required: false, description: "PEM-encoded SSH private key" })
  @IsString()
  @IsOptional()
  sshKey?: string;

  @ApiProperty({
    required: false,
    description: "Enable/privilege password for Cisco-style devices",
  })
  @IsString()
  @IsOptional()
  enablePassword?: string;

  // SNMP-specific fields
  @ApiProperty({ required: false, example: "v3" })
  @IsString()
  @IsOptional()
  snmpVersion?: string;

  @ApiProperty({ required: false, example: "public" })
  @IsString()
  @IsOptional()
  snmpCommunity?: string;

  @ApiProperty({ required: false, example: "SHA" })
  @IsString()
  @IsOptional()
  snmpAuthProtocol?: string;

  @ApiProperty({ required: false, example: "AES" })
  @IsString()
  @IsOptional()
  snmpPrivProtocol?: string;
}

export class UpdateRouterDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  routerName?: string;

  @ApiProperty({ required: false })
  @IsIP()
  @IsOptional()
  ipAddress?: string;

  @ApiProperty({ required: false, enum: RouterProtocol })
  @IsEnum(RouterProtocol)
  @IsOptional()
  protocol?: RouterProtocol;

  @ApiProperty({ required: false, enum: DeviceVendor })
  @IsEnum(DeviceVendor)
  @IsOptional()
  vendor?: DeviceVendor;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  osType?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  apiPort?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  sshPort?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  netconfPort?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  vpnInterface?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @Max(3600)
  @IsOptional()
  pollingInterval?: number;
}
