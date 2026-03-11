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
import { UserRole } from "@prisma/client";
import { OrganizationsService } from "./organizations.service";
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from "./dto/organization.dto";

@ApiTags("Organizations")
@ApiBearerAuth("JWT-auth")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Create an organization" })
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "List all organizations" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  findAll(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.organizationsService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(":id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: "Get an organization by ID" })
  findOne(@Param("id") id: string) {
    return this.organizationsService.findOne(id);
  }

  @Put(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Update an organization" })
  update(@Param("id") id: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Delete an organization" })
  remove(@Param("id") id: string) {
    return this.organizationsService.remove(id);
  }
}
