import { Injectable, Logger } from "@nestjs/common";
import { Point } from "@influxdata/influxdb-client";
import { InfluxService } from "../../services/influx/influx.service";
import { NormalizedMetric } from "../polling/constants/queue.constants";

@Injectable()
export class MetricsIngestionService {
  private readonly logger = new Logger(MetricsIngestionService.name);

  constructor(private influx: InfluxService) {}

  async ingest(metrics: NormalizedMetric[]): Promise<void> {
    const writeApi = this.influx.getWriteApi();

    for (const metric of metrics) {
      const point = new Point("router_metrics")
        .tag("organization_id", metric.organizationId)
        .tag("router_id", metric.routerId)
        .tag("metric_name", metric.metricName)
        .floatField("value", metric.metricValue)
        .timestamp(new Date(metric.timestamp));

      if (metric.interface) {
        point.tag("interface", metric.interface);
      }

      writeApi.writePoint(point);
    }

    try {
      await writeApi.flush();
      this.logger.debug(`Ingested ${metrics.length} metrics`);
    } catch (error) {
      this.logger.error(`Failed to flush metrics: ${error.message}`);
      throw error;
    }
  }
}
