import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
  Header,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { VpnService } from "./vpn.service";
import { CreateVpnConfigDto, UpdateVpnConfigDto } from "./dto/vpn.dto";
import { Response } from "express";

@ApiTags("VPN")
@ApiBearerAuth("JWT-auth")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Controller("vpn")
export class VpnController {
  constructor(private readonly vpnService: VpnService) {}

  @Post(":organizationId")
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Create VPN configuration for an organization" })
  create(
    @Param("organizationId") organizationId: string,
    @Body() dto: CreateVpnConfigDto,
  ) {
    return this.vpnService.create(organizationId, dto);
  }

  @Get("organization/:organizationId")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: "List VPN configs for an organization" })
  findAll(@Param("organizationId") organizationId: string) {
    return this.vpnService.findAll(organizationId);
  }

  @Get(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Get VPN config by ID" })
  findOne(@Param("id") id: string) {
    return this.vpnService.findOne(id);
  }

  @Put(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Update VPN config" })
  update(@Param("id") id: string, @Body() dto: UpdateVpnConfigDto) {
    return this.vpnService.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Delete VPN config" })
  remove(@Param("id") id: string) {
    return this.vpnService.remove(id);
  }

  @Get(":id/download")
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Download VPN configuration file" })
  async downloadConfig(@Param("id") id: string, @Res() res: Response) {
    const configContent = await this.vpnService.getConfigFile(id);
    const vpn = await this.vpnService.findOne(id);

    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${vpn.interfaceName}.conf"`,
    );
    res.send(configContent);
  }
}
