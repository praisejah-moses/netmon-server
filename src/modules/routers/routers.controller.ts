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
import { RoutersService } from "./routers.service";
import { CreateRouterDto, UpdateRouterDto } from "./dto/router.dto";

@ApiTags("Routers")
@ApiBearerAuth("JWT-auth")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Controller("routers")
export class RoutersController {
  constructor(private readonly routersService: RoutersService) {}

  @Post(":organizationId")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: "Register a router for an organization" })
  create(
    @Param("organizationId") organizationId: string,
    @Body() dto: CreateRouterDto,
  ) {
    return this.routersService.create(organizationId, dto);
  }

  @Get("organization/:organizationId")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: "List routers for an organization" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  findAll(
    @Param("organizationId") organizationId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.routersService.findAll(
      organizationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(":id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: "Get a router by ID" })
  findOne(@Param("id") id: string) {
    return this.routersService.findOne(id);
  }

  @Put(":id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: "Update a router" })
  update(@Param("id") id: string, @Body() dto: UpdateRouterDto) {
    return this.routersService.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: "Delete a router" })
  remove(@Param("id") id: string) {
    return this.routersService.remove(id);
  }
}
