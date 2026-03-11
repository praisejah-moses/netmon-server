import { Injectable, Logger } from "@nestjs/common";
import { DevicePoller } from "../device-poller.interface";
import {
  RouterPollJob,
  NormalizedMetric,
} from "../../constants/queue.constants";
import { SshTransportService, SshCredentials } from "./ssh-transport.service";
import { RoutersService } from "../../../routers/routers.service";

/**
 * SSH/CLI poller for Juniper Junos devices.
 *
 * Commands used:
 *  - show interfaces extensive  → bandwidth, packets, errors, status
 *  - show system processes summary → CPU utilisation
 *  - show system memory           → memory usage
 *  - show system uptime           → uptime
 */
@Injectable()
export class JuniperSshPollerService implements DevicePoller {
  private readonly logger = new Logger(JuniperSshPollerService.name);

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
    };

    const commands = [
      "show interfaces terse",
      'show interfaces detail | match "Physical interface|Input rate|Output rate"',
      "show system processes summary | match CPU",
      "show system memory | match Total",
      'show system uptime | match "System booted"',
    ];

    const output = await this.ssh.shell(
      job.ipAddress,
      job.sshPort,
      creds,
      commands,
    );
    const timestamp = new Date().toISOString();
    const metrics: NormalizedMetric[] = [];

    this.parseInterfacesTerse(output, job, timestamp, metrics);
    this.parseInterfaceRates(output, job, timestamp, metrics);
    this.parseCpu(output, job, timestamp, metrics);
    this.parseMemory(output, job, timestamp, metrics);
    this.parseUptime(output, job, timestamp, metrics);

    return metrics;
  }

  private parseInterfacesTerse(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "ge-0/0/0                up    up"
    // "ge-0/0/0.0              up    up   inet     10.0.0.1/24"
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(up|down)\s+(up|down)/);
      if (match && !match[1].includes(".")) {
        // physical interfaces only (skip logical .0)
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: match[1],
          metricName: "interface_status",
          metricValue: match[3] === "up" ? 1 : 0,
        });
      }
    }
  }

  private parseInterfaceRates(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "Physical interface: ge-0/0/0, ..."
    // "  Input rate     : 1234 bps (56 pps)"
    // "  Output rate    : 5678 bps (90 pps)"
    const ifRegex = /Physical interface:\s*(\S+)/g;
    let match: RegExpExecArray | null;

    while ((match = ifRegex.exec(output)) !== null) {
      const ifName = match[1].replace(",", "");
      const block = output.substring(
        ifRegex.lastIndex,
        output.indexOf("Physical interface:", ifRegex.lastIndex + 1) ||
          undefined,
      );

      const inputMatch = block.match(
        /Input rate\s*:\s*(\d+)\s*bps\s*\((\d+)\s*pps\)/,
      );
      if (inputMatch) {
        metrics.push(
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "rx_bps",
            metricValue: parseInt(inputMatch[1], 10),
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "rx_packets",
            metricValue: parseInt(inputMatch[2], 10),
          },
        );
      }

      const outputMatch = block.match(
        /Output rate\s*:\s*(\d+)\s*bps\s*\((\d+)\s*pps\)/,
      );
      if (outputMatch) {
        metrics.push(
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "tx_bps",
            metricValue: parseInt(outputMatch[1], 10),
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "tx_packets",
            metricValue: parseInt(outputMatch[2], 10),
          },
        );
      }
    }
  }

  private parseCpu(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "CPU: 5.2% user, 2.1% system, 0.3% interrupt, 92.4% idle"
    const cpuMatch = output.match(/(\d+(?:\.\d+)?)%\s*idle/);
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

  private parseMemory(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "Total        4194304 bytes   3145728 bytes used   1048576 bytes free"
    const memMatch = output.match(
      /Total\s+(\d+)\s+bytes\s+(\d+)\s+bytes\s+used\s+(\d+)\s+bytes\s+free/i,
    );
    if (memMatch) {
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "total_memory",
          metricValue: parseInt(memMatch[1], 10),
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "free_memory",
          metricValue: parseInt(memMatch[3], 10),
        },
      );
    }
  }

  private parseUptime(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "System booted: 2026-01-15 08:30:00 UTC (8w1d 12:30 ago)"
    const uptimeMatch = output.match(/\((\S+)\s+ago\)/);
    if (uptimeMatch) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "uptime",
        metricValue: this.parseJunosUptime(uptimeMatch[1]),
      });
    }
  }

  private parseJunosUptime(uptime: string): number {
    // "8w1d 12:30:45" → seconds
    let seconds = 0;
    const weeks = uptime.match(/(\d+)w/);
    const days = uptime.match(/(\d+)d/);
    const time = uptime.match(/(\d+):(\d+):?(\d+)?$/);
    if (weeks) seconds += parseInt(weeks[1], 10) * 604800;
    if (days) seconds += parseInt(days[1], 10) * 86400;
    if (time) {
      seconds += parseInt(time[1], 10) * 3600;
      seconds += parseInt(time[2], 10) * 60;
      if (time[3]) seconds += parseInt(time[3], 10);
    }
    return seconds;
  }
}
