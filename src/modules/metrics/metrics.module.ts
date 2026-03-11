import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsIngestionService } from "./metrics-ingestion.service";
import { MetricsQueryService } from "./metrics-query.service";

@Module({
  controllers: [MetricsController],
  providers: [MetricsIngestionService, MetricsQueryService],
  exports: [MetricsIngestionService, MetricsQueryService],
})
export class MetricsModule {}
