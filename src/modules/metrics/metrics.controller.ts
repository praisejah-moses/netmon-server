import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { MetricsQueryService } from "./metrics-query.service";

@ApiTags("Metrics")
@ApiBearerAuth("JWT-auth")
@UseGuards(AuthGuard("jwt"))
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsQuery: MetricsQueryService) {}

  @Get("router/:routerId")
  @ApiOperation({ summary: "Query metrics for a specific router" })
  @ApiQuery({ name: "metric", required: false, example: "rx_bps" })
  @ApiQuery({ name: "interface", required: false, example: "ether1" })
  @ApiQuery({ name: "range", required: false, example: "1h" })
  queryRouterMetrics(
    @Param("routerId") routerId: string,
    @Query("metric") metric?: string,
    @Query("interface") iface?: string,
    @Query("range") range?: string,
  ) {
    return this.metricsQuery.queryRouterMetrics(
      routerId,
      metric,
      iface,
      range || "1h",
    );
  }

  @Get("organization/:organizationId")
  @ApiOperation({ summary: "Query aggregated metrics for an organization" })
  @ApiQuery({ name: "metric", required: false, example: "rx_bps" })
  @ApiQuery({ name: "range", required: false, example: "1h" })
  queryOrganizationMetrics(
    @Param("organizationId") organizationId: string,
    @Query("metric") metric?: string,
    @Query("range") range?: string,
  ) {
    return this.metricsQuery.queryOrganizationMetrics(
      organizationId,
      metric,
      range || "1h",
    );
  }
}
