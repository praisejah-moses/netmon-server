import { Injectable, Logger } from "@nestjs/common";
import { DevicePoller } from "../device-poller.interface";
import {
  RouterPollJob,
  NormalizedMetric,
} from "../../constants/queue.constants";
import {
  NetconfTransportService,
  NetconfCredentials,
} from "./netconf-transport.service";
import { RoutersService } from "../../../routers/routers.service";

/**
 * NETCONF poller for Juniper Junos devices.
 *
 * Junos NETCONF uses Juniper-specific YANG models:
 *  - get-interface-information          → interface state, counters
 *  - get-route-engine-information       → CPU, memory
 *  - get-system-uptime-information      → uptime
 */
@Injectable()
export class JuniperNetconfPollerService implements DevicePoller {
  private readonly logger = new Logger(JuniperNetconfPollerService.name);

  constructor(
    private netconf: NetconfTransportService,
    private routersService: RoutersService,
  ) {}

  async poll(job: RouterPollJob): Promise<NormalizedMetric[]> {
    const router = await this.routersService.getRouterWithCredentials(
      job.routerId,
    );
    if (!router.credential) {
      throw new Error(`No credentials found for router ${job.routerId}`);
    }

    const creds: NetconfCredentials = {
      username: router.credential.username,
      password: router.credential.passwordEncrypted,
      privateKey: router.credential.sshKeyEncrypted || undefined,
    };

    const rpcs = [
      this.buildInterfaceRpc(),
      this.buildRouteEngineRpc(),
      this.buildUptimeRpc(),
    ];

    const replies = await this.netconf.request(
      job.ipAddress,
      job.netconfPort,
      creds,
      rpcs,
    );

    const timestamp = new Date().toISOString();
    const metrics: NormalizedMetric[] = [];

    if (replies[0]) this.parseInterfaces(replies[0], job, timestamp, metrics);
    if (replies[1]) this.parseRouteEngine(replies[1], job, timestamp, metrics);
    if (replies[2]) this.parseUptime(replies[2], job, timestamp, metrics);

    return metrics;
  }

  private buildInterfaceRpc(): string {
    return `<rpc message-id="1" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get-interface-information>
    <extensive/>
  </get-interface-information>
</rpc>`;
  }

  private buildRouteEngineRpc(): string {
    return `<rpc message-id="2" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get-route-engine-information/>
</rpc>`;
  }

  private buildUptimeRpc(): string {
    return `<rpc message-id="3" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get-system-uptime-information/>
</rpc>`;
  }

  private parseInterfaces(
    xml: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // <physical-interface> blocks
    const ifRegex = /<physical-interface>([\s\S]*?)<\/physical-interface>/g;
    let match: RegExpExecArray | null;

    while ((match = ifRegex.exec(xml)) !== null) {
      const block = match[1];
      const name = this.extractTag(block, "name");
      if (!name) continue;

      const operStatus = this.extractTag(block, "oper-status");
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        interface: name,
        metricName: "interface_status",
        metricValue: operStatus === "up" ? 1 : 0,
      });

      // Junos traffic-statistics
      const inputBps = this.extractTag(block, "input-bps");
      const outputBps = this.extractTag(block, "output-bps");
      const inputPps = this.extractTag(block, "input-pps");
      const outputPps = this.extractTag(block, "output-pps");

      if (inputBps) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "rx_bps",
          metricValue: parseInt(inputBps, 10),
        });
      }
      if (outputBps) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "tx_bps",
          metricValue: parseInt(outputBps, 10),
        });
      }
      if (inputPps) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "rx_packets",
          metricValue: parseInt(inputPps, 10),
        });
      }
      if (outputPps) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "tx_packets",
          metricValue: parseInt(outputPps, 10),
        });
      }
    }
  }

  private parseRouteEngine(
    xml: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // <route-engine> block contains CPU and memory
    const cpuUser = this.extractTag(xml, "cpu-user");
    const cpuSystem = this.extractTag(xml, "cpu-system");
    if (cpuUser && cpuSystem) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "cpu_load",
        metricValue: parseInt(cpuUser, 10) + parseInt(cpuSystem, 10),
      });
    }

    const memTotal =
      this.extractTag(xml, "memory-dram-size") ||
      this.extractTag(xml, "memory-installed-size");
    const memUsed = this.extractTag(xml, "memory-buffer-utilization");
    if (memTotal) {
      const totalBytes = parseInt(memTotal, 10) * 1024 * 1024;
      const usedPct = memUsed ? parseInt(memUsed, 10) : 0;
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "total_memory",
          metricValue: totalBytes,
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "free_memory",
          metricValue: Math.round(totalBytes * (1 - usedPct / 100)),
        },
      );
    }
  }

  private parseUptime(
    xml: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // <system-booted-time><date-time>...</date-time></system-booted-time>
    const bootTime = this.extractTag(xml, "date-time");
    if (bootTime) {
      const bootMs = new Date(bootTime).getTime();
      if (!isNaN(bootMs)) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "uptime",
          metricValue: Math.floor((Date.now() - bootMs) / 1000),
        });
      }
    }

    // Also try <up-time> with seconds format
    const upTimeSeconds = this.extractTag(xml, "up-time");
    if (upTimeSeconds && !bootTime) {
      const parsed = parseInt(upTimeSeconds, 10);
      if (!isNaN(parsed) && parsed > 0) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "uptime",
          metricValue: parsed,
        });
      }
    }
  }

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }
}
