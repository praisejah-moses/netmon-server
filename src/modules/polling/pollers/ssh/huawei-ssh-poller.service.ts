import { Injectable, Logger } from "@nestjs/common";
import { DevicePoller } from "../device-poller.interface";
import {
  RouterPollJob,
  NormalizedMetric,
} from "../../constants/queue.constants";
import { SshTransportService, SshCredentials } from "./ssh-transport.service";
import { RoutersService } from "../../../routers/routers.service";

/**
 * SSH/CLI poller for Huawei VRP devices.
 *
 * Commands used:
 *  - display interface brief              → interface status
 *  - display interface                    → bandwidth, packets
 *  - display cpu-usage                    → CPU utilisation
 *  - display memory-usage                 → memory usage
 *  - display version                      → uptime
 */
@Injectable()
export class HuaweiSshPollerService implements DevicePoller {
  private readonly logger = new Logger(HuaweiSshPollerService.name);

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
      "screen-length 0 temporary",
      "display interface brief",
      "display interface",
      "display cpu-usage",
      "display memory-usage",
      "display version | include uptime",
    ];

    const output = await this.ssh.shell(
      job.ipAddress,
      job.sshPort,
      creds,
      commands,
    );
    const timestamp = new Date().toISOString();
    const metrics: NormalizedMetric[] = [];

    this.parseInterfaceBrief(output, job, timestamp, metrics);
    this.parseInterfaceDetail(output, job, timestamp, metrics);
    this.parseCpu(output, job, timestamp, metrics);
    this.parseMemory(output, job, timestamp, metrics);
    this.parseUptime(output, job, timestamp, metrics);

    return metrics;
  }

  private parseInterfaceBrief(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "GE0/0/0         up     up     xxx"
    const ifRegex =
      /^(GE\S+|XGE\S+|Eth\S+|Vlan\S+)\s+(up|down|\*down)\s+(up|down|\*down)/gm;
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

  private parseInterfaceDetail(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // Huawei VRP format:
    // "GigabitEthernet0/0/0 current state : UP"
    // "  Last 300 seconds input rate 1234 bits/sec, 56 packets/sec"
    // "  Last 300 seconds output rate 5678 bits/sec, 90 packets/sec"
    const ifRegex = /^(\S+) current state\s*:\s*(UP|DOWN)/gm;
    let match: RegExpExecArray | null;

    while ((match = ifRegex.exec(output)) !== null) {
      const ifName = match[1];
      const block = output.substring(
        ifRegex.lastIndex,
        output.indexOf(" current state", ifRegex.lastIndex + 1) || undefined,
      );

      const inputMatch = block.match(
        /input.+?(\d+)\s*bits\/sec,\s*(\d+)\s*packets\/sec/,
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
        /output.+?(\d+)\s*bits\/sec,\s*(\d+)\s*packets\/sec/,
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
    // "CPU Usage     : 12%"
    const cpuMatch = output.match(/CPU Usage\s*:\s*(\d+)%/i);
    if (cpuMatch) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "cpu_load",
        metricValue: parseInt(cpuMatch[1], 10),
      });
    }
  }

  private parseMemory(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "System Total Memory Is: 2048 M bytes"
    // "Total Memory Used Is:   1024 M bytes"
    const totalMatch = output.match(/Total Memory (?:Is)?\s*:\s*(\d+)/i);
    const usedMatch = output.match(/Memory Used (?:Is)?\s*:\s*(\d+)/i);
    if (totalMatch) {
      const total = parseInt(totalMatch[1], 10) * 1024 * 1024;
      const used = usedMatch ? parseInt(usedMatch[1], 10) * 1024 * 1024 : 0;
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "total_memory",
          metricValue: total,
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "free_memory",
          metricValue: total - used,
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
    // "uptime is 10 days, 3 hours, 25 minutes"
    const uptimeMatch = output.match(/uptime is (.+)/i);
    if (uptimeMatch) {
      let seconds = 0;
      const days = uptimeMatch[1].match(/(\d+)\s*day/);
      const hours = uptimeMatch[1].match(/(\d+)\s*hour/);
      const minutes = uptimeMatch[1].match(/(\d+)\s*minute/);
      if (days) seconds += parseInt(days[1], 10) * 86400;
      if (hours) seconds += parseInt(hours[1], 10) * 3600;
      if (minutes) seconds += parseInt(minutes[1], 10) * 60;
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "uptime",
        metricValue: seconds,
      });
    }
  }
}
