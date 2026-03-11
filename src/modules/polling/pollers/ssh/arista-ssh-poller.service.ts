import { Injectable, Logger } from "@nestjs/common";
import { DevicePoller } from "../device-poller.interface";
import {
  RouterPollJob,
  NormalizedMetric,
} from "../../constants/queue.constants";
import { SshTransportService, SshCredentials } from "./ssh-transport.service";
import { RoutersService } from "../../../routers/routers.service";

/**
 * SSH/CLI poller for Arista EOS devices.
 *
 * Arista CLI is similar to Cisco IOS but has some differences.
 * Commands used:
 *  - show interfaces               → bandwidth, packets, status
 *  - show processes top once        → CPU utilisation
 *  - show version                   → memory, uptime
 */
@Injectable()
export class AristaSshPollerService implements DevicePoller {
  private readonly logger = new Logger(AristaSshPollerService.name);

  constructor(
    private ssh: SshTransportService,
    private routersService: RoutersService,
  ) {}

  async poll(job: RouterPollJob): Promise<NormalizedMetric[]> {
    const router = await this.routersService.getRouterWithCredentials(
      job.routerId,
    );
    if (!router.credential) {
      throw new Error(`No credentials found for router ${job.routerId}`);
    }

    const creds: SshCredentials = {
      username: router.credential.username,
      password: router.credential.passwordEncrypted,
      privateKey: router.credential.sshKeyEncrypted || undefined,
      enablePassword: router.credential.enablePassword || undefined,
    };

    const commands = [
      "show interfaces | json",
      "show processes top once | json",
      "show version | json",
    ];

    // Arista EOS supports JSON output natively via `| json`
    const output = await this.ssh.shell(
      job.ipAddress,
      job.sshPort,
      creds,
      commands,
    );
    const timestamp = new Date().toISOString();
    const metrics: NormalizedMetric[] = [];

    this.parseInterfacesJson(output, job, timestamp, metrics);
    this.parseProcessesJson(output, job, timestamp, metrics);
    this.parseVersionJson(output, job, timestamp, metrics);

    // Fallback to text parsing if JSON extraction failed
    if (metrics.length === 0) {
      this.parseInterfacesText(output, job, timestamp, metrics);
      this.parseCpuText(output, job, timestamp, metrics);
    }

    return metrics;
  }

  private parseInterfacesJson(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    const json = this.extractJson(output, "interfaces");
    if (!json?.interfaces) return;

    for (const [ifName, iface] of Object.entries<any>(json.interfaces)) {
      if (ifName.startsWith("Management") || ifName.startsWith("Loopback"))
        continue;

      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        interface: ifName,
        metricName: "interface_status",
        metricValue: iface.interfaceStatus === "connected" ? 1 : 0,
      });

      if (iface.interfaceCounters) {
        const c = iface.interfaceCounters;
        metrics.push(
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "rx_bps",
            metricValue: c.inOctets ? c.inOctets * 8 : 0,
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "tx_bps",
            metricValue: c.outOctets ? c.outOctets * 8 : 0,
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "rx_packets",
            metricValue: c.inUcastPkts ?? 0,
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "tx_packets",
            metricValue: c.outUcastPkts ?? 0,
          },
        );
      }
    }
  }

  private parseProcessesJson(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    const json = this.extractJson(output, "cpuInfo");
    if (!json?.cpuInfo) return;

    const idle = json.cpuInfo["%Cpu(s)"]?.idle ?? 0;
    metrics.push({
      timestamp,
      organizationId: job.organizationId,
      routerId: job.routerId,
      metricName: "cpu_load",
      metricValue: Math.round(100 - idle),
    });
  }

  private parseVersionJson(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    const json = this.extractJson(output, "memTotal");
    if (!json) return;

    if (json.memTotal && json.memFree) {
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "total_memory",
          metricValue: json.memTotal,
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "free_memory",
          metricValue: json.memFree,
        },
      );
    }

    if (json.uptime) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "uptime",
        metricValue: json.uptime,
      });
    }
  }

  private parseInterfacesText(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    const ifRegex = /^(\S+) is (up|down)/gm;
    let match: RegExpExecArray | null;
    while ((match = ifRegex.exec(output)) !== null) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        interface: match[1],
        metricName: "interface_status",
        metricValue: match[2] === "up" ? 1 : 0,
      });
    }
  }

  private parseCpuText(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    const cpuMatch = output.match(/(\d+(?:\.\d+)?)%?\s*id/);
    if (cpuMatch) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "cpu_load",
        metricValue: Math.round(100 - parseFloat(cpuMatch[1])),
      });
    }
  }

  private extractJson(output: string, marker: string): any | null {
    try {
      // Find JSON blocks in the output, try to extract the one containing the marker
      const jsonStart = output.indexOf("{");
      if (jsonStart === -1) return null;

      let depth = 0;
      let start = -1;
      for (let i = jsonStart; i < output.length; i++) {
        if (output[i] === "{") {
          if (depth === 0) start = i;
          depth++;
        } else if (output[i] === "}") {
          depth--;
          if (depth === 0 && start >= 0) {
            const candidate = output.substring(start, i + 1);
            if (candidate.includes(marker)) {
              return JSON.parse(candidate);
            }
            start = -1;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }
}
