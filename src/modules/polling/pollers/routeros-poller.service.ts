import { Injectable, Logger } from "@nestjs/common";
import { RouterOSAPI } from "node-routeros";
import { RouterPollJob, NormalizedMetric } from "../constants/queue.constants";
import { RoutersService } from "../../routers/routers.service";

@Injectable()
export class RouterOsPollerService {
  private readonly logger = new Logger(RouterOsPollerService.name);

  constructor(private routersService: RoutersService) {}

  async poll(job: RouterPollJob): Promise<NormalizedMetric[]> {
    const router = await this.routersService.getRouterWithCredentials(
      job.routerId,
    );
    if (!router.credential) {
      throw new Error(`No credentials found for router ${job.routerId}`);
    }

    const api = new RouterOSAPI({
      host: job.ipAddress,
      port: job.apiPort,
      user: router.credential.username,
      password: router.credential.passwordEncrypted, // Already decrypted by service
      timeout: 10,
      tls: job.apiPort === 8729 ? {} : undefined,
    });

    try {
      await api.connect();

      const metrics: NormalizedMetric[] = [];
      const timestamp = new Date().toISOString();

      // Collect interface traffic metrics
      const interfaces = await api.write("/interface/print");
      for (const iface of interfaces) {
        try {
          const traffic = await api.write("/interface/monitor-traffic", [
            `=interface=${iface.name}`,
            "=once=",
          ]);

          if (traffic.length > 0) {
            const t = traffic[0];
            metrics.push(
              {
                timestamp,
                organizationId: job.organizationId,
                routerId: job.routerId,
                interface: iface.name,
                metricName: "rx_bps",
                metricValue: parseInt(t["rx-bits-per-second"] || "0", 10),
              },
              {
                timestamp,
                organizationId: job.organizationId,
                routerId: job.routerId,
                interface: iface.name,
                metricName: "tx_bps",
                metricValue: parseInt(t["tx-bits-per-second"] || "0", 10),
              },
              {
                timestamp,
                organizationId: job.organizationId,
                routerId: job.routerId,
                interface: iface.name,
                metricName: "rx_packets",
                metricValue: parseInt(t["rx-packets-per-second"] || "0", 10),
              },
              {
                timestamp,
                organizationId: job.organizationId,
                routerId: job.routerId,
                interface: iface.name,
                metricName: "tx_packets",
                metricValue: parseInt(t["tx-packets-per-second"] || "0", 10),
              },
              {
                timestamp,
                organizationId: job.organizationId,
                routerId: job.routerId,
                interface: iface.name,
                metricName: "interface_status",
                metricValue: iface.running === "true" ? 1 : 0,
              },
            );
          }
        } catch (err) {
          this.logger.warn(
            `Failed to get traffic for ${iface.name}: ${err.message}`,
          );
        }
      }

      // Collect system resource metrics
      const resources = await api.write("/system/resource/print");
      if (resources.length > 0) {
        const res = resources[0];
        metrics.push(
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            metricName: "cpu_load",
            metricValue: parseInt(res["cpu-load"] || "0", 10),
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            metricName: "free_memory",
            metricValue: parseInt(res["free-memory"] || "0", 10),
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            metricName: "total_memory",
            metricValue: parseInt(res["total-memory"] || "0", 10),
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            metricName: "uptime",
            metricValue: this.parseUptime(res.uptime || "0s"),
          },
        );
      }

      return metrics;
    } finally {
      try {
        await api.close();
      } catch {
        // Connection may already be closed
      }
    }
  }

  private parseUptime(uptime: string): number {
    // Parse RouterOS uptime format like "1w2d3h4m5s" to seconds
    let seconds = 0;
    const weeks = uptime.match(/(\d+)w/);
    const days = uptime.match(/(\d+)d/);
    const hours = uptime.match(/(\d+)h/);
    const minutes = uptime.match(/(\d+)m/);
    const secs = uptime.match(/(\d+)s/);

    if (weeks) seconds += parseInt(weeks[1], 10) * 604800;
    if (days) seconds += parseInt(days[1], 10) * 86400;
    if (hours) seconds += parseInt(hours[1], 10) * 3600;
    if (minutes) seconds += parseInt(minutes[1], 10) * 60;
    if (secs) seconds += parseInt(secs[1], 10);

    return seconds;
  }
}
