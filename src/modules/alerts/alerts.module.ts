import { Module } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { AlertsController } from "./alerts.controller";
import { AlertEvaluationService } from "./alert-evaluation.service";
import { MetricsModule } from "../metrics/metrics.module";

@Module({
  imports: [MetricsModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertEvaluationService],
  exports: [AlertsService],
})
export class AlertsModule {}
