import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsIP,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  RouterProtocol,
  DeviceVendor,
  VpnProtocol,
} from "../../../../generated/prisma/client.js";

// ─── Inline VPN configuration for device onboarding ─────────────────────────

export class DeviceVpnConfigDto {
  @ApiProperty({
    enum: VpnProtocol,
    example: VpnProtocol.WIREGUARD,
    description: "VPN protocol to use to reach this device",
  })
  @IsEnum(VpnProtocol)
  protocol: VpnProtocol;

  @ApiProperty({
    example: "wg0",
    description: "VPN interface name on the monitoring server (e.g. wg0, tun0)",
  })
  @IsString()
  @IsNotEmpty()
  interfaceName: string;

  @ApiProperty({ example: "10.10.0.0/24", description: "VPN subnet" })
  @IsString()
  @IsNotEmpty()
  subnet: string;

  @ApiProperty({
    required: false,
    example: "203.0.113.1:51820",
    description: "Remote peer endpoint (host:port)",
  })
  @IsString()
  @IsOptional()
  endpoint?: string;

  @ApiProperty({
    required: false,
    example: "base64PublicKey==",
    description: "WireGuard public key for the peer",
  })
  @IsString()
  @IsOptional()
  publicKey?: string;

  @ApiProperty({
    required: false,
    description: "Full VPN config blob (will be stored encrypted)",
  })
  @IsString()
  @IsOptional()
  configData?: string;
}

// ─── Device Onboarding DTO ──────────────────────────────────────────────────

export class CreateRouterDto {
  // ── Device identity ──────────────────────────────────────────────
  @ApiProperty({
    example: "core-router-01",
    description: "Friendly device name",
  })
  @IsString()
  @IsNotEmpty()
  routerName: string;

  @ApiProperty({
    example: "10.10.1.1",
    description:
      "IP address the monitoring server uses to reach this device (VPN IP if tunnelled)",
  })
  @IsIP()
  ipAddress: string;

  // ── Connection method ────────────────────────────────────────────
  @ApiProperty({
    enum: RouterProtocol,
    example: RouterProtocol.ROUTEROS_API,
    description:
      "Preferred polling protocol: ROUTEROS_API, SNMP, NETFLOW, SSH_CLI, or NETCONF",
  })
  @IsEnum(RouterProtocol)
  protocol: RouterProtocol;

  @ApiProperty({
    enum: DeviceVendor,
    example: DeviceVendor.GENERIC,
    description:
      "Hardware vendor — determines which poller implementation is used",
  })
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

  // ── Protocol-specific polling ports ──────────────────────────────
  @ApiProperty({
    example: 8729,
    description: "RouterOS API port (ROUTEROS_API protocol only)",
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  apiPort?: number;

  @ApiProperty({
    example: 22,
    required: false,
    description: "SSH port (SSH_CLI and NETCONF transports)",
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  sshPort?: number;

  @ApiProperty({
    example: 830,
    required: false,
    description: "NETCONF port (NETCONF protocol only)",
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  netconfPort?: number;

  @ApiProperty({
    example: 5,
    required: false,
    description: "Polling interval in seconds (default 5)",
  })
  @IsInt()
  @Min(1)
  @Max(3600)
  @IsOptional()
  pollingInterval?: number;

  // ── Authentication credentials ────────────────────────────────────
  @ApiProperty({ example: "admin", description: "Device login username" })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: "routerpassword",
    description: "Device login password (stored AES-256-GCM encrypted)",
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    required: false,
    description: "PEM-encoded SSH private key (SSH_CLI / NETCONF auth)",
  })
  @IsString()
  @IsOptional()
  sshKey?: string;

  @ApiProperty({
    required: false,
    description: "Enable/privilege password (Cisco-style devices)",
  })
  @IsString()
  @IsOptional()
  enablePassword?: string;

  // SNMP credentials
  @ApiProperty({
    required: false,
    example: "v3",
    description: "SNMP version: v2c or v3",
  })
  @IsString()
  @IsOptional()
  snmpVersion?: string;

  @ApiProperty({
    required: false,
    example: "public",
    description: "SNMPv2c community string (stored encrypted)",
  })
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

  @ApiProperty({
    required: false,
    description: "SNMPv3 authentication key (stored encrypted)",
  })
  @IsString()
  @IsOptional()
  snmpAuthKey?: string;

  @ApiProperty({
    required: false,
    description: "SNMPv3 privacy key (stored encrypted)",
  })
  @IsString()
  @IsOptional()
  snmpPrivKey?: string;

  // ── VPN connection to this device ─────────────────────────────────
  @ApiProperty({
    required: false,
    description:
      "ID of an existing VpnConfig in this organisation to route polls through.",
  })
  @IsUUID()
  @IsOptional()
  vpnConfigId?: string;

  @ApiProperty({
    required: false,
    type: () => DeviceVpnConfigDto,
    description:
      "Inline VPN configuration. Creates a new VpnConfig for this organisation and links it to the device. Ignored if vpnConfigId is supplied.",
  })
  @ValidateNested()
  @Type(() => DeviceVpnConfigDto)
  @IsOptional()
  vpnConfig?: DeviceVpnConfigDto;
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
  @IsInt()
  @Min(1)
  @Max(3600)
  @IsOptional()
  pollingInterval?: number;

  @ApiProperty({
    required: false,
    description:
      "Reassign to a different VPN config within the same organisation (null to detach)",
  })
  @IsUUID()
  @IsOptional()
  vpnConfigId?: string | null;
}
