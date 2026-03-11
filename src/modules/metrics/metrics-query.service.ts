import { Injectable, Logger } from "@nestjs/common";
import { InfluxService } from "../../services/influx/influx.service";

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  metricName?: string;
  interface?: string;
}

@Injectable()
export class MetricsQueryService {
  private readonly logger = new Logger(MetricsQueryService.name);

  constructor(private influx: InfluxService) {}

  async queryRouterMetrics(
    routerId: string,
    metric?: string,
    iface?: string,
    range = "1h",
  ): Promise<MetricDataPoint[]> {
    const bucket = this.influx.getBucket();

    let fluxQuery = `from(bucket: "${bucket}")
      |> range(start: -${range})
      |> filter(fn: (r) => r["router_id"] == "${routerId}")`;

    if (metric) {
      fluxQuery += `\n      |> filter(fn: (r) => r["metric_name"] == "${metric}")`;
    }

    if (iface) {
      fluxQuery += `\n      |> filter(fn: (r) => r["interface"] == "${iface}")`;
    }

    fluxQuery += '\n      |> sort(columns: ["_time"])';

    const results: MetricDataPoint[] = [];
    const queryApi = this.influx.getQueryApi();

    return new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          results.push({
            timestamp: obj._time,
            value: obj._value,
            metricName: obj.metric_name,
            interface: obj.interface,
          });
        },
        error(error) {
          reject(error);
        },
        complete() {
          resolve(results);
        },
      });
    });
  }

  async queryOrganizationMetrics(
    organizationId: string,
    metric?: string,
    range = "1h",
  ): Promise<MetricDataPoint[]> {
    const bucket = this.influx.getBucket();

    let fluxQuery = `from(bucket: "${bucket}")
      |> range(start: -${range})
      |> filter(fn: (r) => r["organization_id"] == "${organizationId}")`;

    if (metric) {
      fluxQuery += `\n      |> filter(fn: (r) => r["metric_name"] == "${metric}")`;
    }

    fluxQuery += `
      |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
      |> sort(columns: ["_time"])`;

    const results: MetricDataPoint[] = [];
    const queryApi = this.influx.getQueryApi();

    return new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          results.push({
            timestamp: obj._time,
            value: obj._value,
            metricName: obj.metric_name,
          });
        },
        error(error) {
          reject(error);
        },
        complete() {
          resolve(results);
        },
      });
    });
  }
}
