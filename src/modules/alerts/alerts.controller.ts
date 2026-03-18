import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../../generated/prisma/client.js";
import { AlertsService } from "./alerts.service";
import { CreateAlertRuleDto, UpdateAlertRuleDto } from "./dto/alert.dto";

@ApiTags("Alerts")
@ApiBearerAuth("JWT-auth")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Controller("alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post(":organizationId")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: "Create an alert rule" })
  create(
    @Param("organizationId") organizationId: string,
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.alertsService.create(organizationId, dto);
  }

  @Get("organization/:organizationId")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: "List alert rules for an organization" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  findAll(
    @Param("organizationId") organizationId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.alertsService.findAll(
      organizationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get alert rule by ID" })
  findOne(@Param("id") id: string) {
    return this.alertsService.findOne(id);
  }

  @Put(":id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: "Update an alert rule" })
  update(@Param("id") id: string, @Body() dto: UpdateAlertRuleDto) {
    return this.alertsService.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: "Delete an alert rule" })
  remove(@Param("id") id: string) {
    return this.alertsService.remove(id);
  }

  @Get("active/:organizationId")
  @ApiOperation({ summary: "Get active alerts for an organization" })
  getActiveAlerts(@Param("organizationId") organizationId: string) {
    return this.alertsService.getActiveAlerts(organizationId);
  }
}
