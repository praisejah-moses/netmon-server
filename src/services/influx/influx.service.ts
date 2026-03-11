import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InfluxDB, WriteApi, QueryApi } from "@influxdata/influxdb-client";

@Injectable()
export class InfluxService implements OnModuleInit {
  private readonly logger = new Logger(InfluxService.name);
  private client: InfluxDB;
  private writeApi: WriteApi;
  private queryApi: QueryApi;
  private bucket: string;
  private org: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const url = this.configService.get<string>(
      "INFLUXDB_URL",
      "http://localhost:8086",
    );
    const token = this.configService.get<string>("INFLUXDB_TOKEN", "");
    this.org = this.configService.get<string>(
      "INFLUXDB_ORG",
      "network-monitor",
    );
    this.bucket = this.configService.get<string>(
      "INFLUXDB_BUCKET",
      "router_metrics",
    );

    this.client = new InfluxDB({ url, token });
    this.writeApi = this.client.getWriteApi(this.org, this.bucket, "s");
    this.queryApi = this.client.getQueryApi(this.org);

    this.logger.log(
      `InfluxDB connected to ${url}, org=${this.org}, bucket=${this.bucket}`,
    );
  }

  getWriteApi(): WriteApi {
    return this.writeApi;
  }

  getQueryApi(): QueryApi {
    return this.queryApi;
  }

  getBucket(): string {
    return this.bucket;
  }

  getOrg(): string {
    return this.org;
  }

  getClient(): InfluxDB {
    return this.client;
  }
}
