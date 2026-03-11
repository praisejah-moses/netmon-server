import { Injectable, Logger } from "@nestjs/common";
import { DevicePoller } from "../device-poller.interface";
import {
  RouterPollJob,
  NormalizedMetric,
} from "../../constants/queue.constants";
import { SshTransportService, SshCredentials } from "./ssh-transport.service";
import { RoutersService } from "../../../routers/routers.service";

/**
 * SSH/CLI poller for HPE ArubaOS-CX / ArubaOS switches.
 *
 * Commands used:
 *  - show interface brief            → interface status
 *  - show interface                  → bandwidth, packets
 *  - show system resource-utilization → CPU utilisation
 *  - show system                     → memory, uptime
 */
@Injectable()
export class HpeSshPollerService implements DevicePoller {
  private readonly logger = new Logger(HpeSshPollerService.name);

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
      "no page",
      "show interface brief",
      "show interface",
      "show system resource-utilization",
      'show system | include "Up Time\\|Memory"',
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
    this.parseSystem(output, job, timestamp, metrics);

    return metrics;
  }

  private parseInterfaceBrief(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // ArubaOS-CX: "1/1/1  up    vlan1   trunk"
    const ifRegex = /^(\d+\/\d+\/\d+|lag\d+)\s+(up|down)/gim;
    let match: RegExpExecArray | null;

    while ((match = ifRegex.exec(output)) !== null) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        interface: match[1],
        metricName: "interface_status",
        metricValue: match[2].toLowerCase() === "up" ? 1 : 0,
      });
    }
  }

  private parseInterfaceDetail(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "Interface 1/1/1 is up"
    // "  Input Rate  : 12345 bps, 56 pps"
    // "  Output Rate : 67890 bps, 12 pps"
    const ifRegex = /Interface\s+(\S+)\s+is\s+(up|down)/gi;
    let match: RegExpExecArray | null;

    while ((match = ifRegex.exec(output)) !== null) {
      const ifName = match[1];
      const blockEnd = output.indexOf("Interface ", ifRegex.lastIndex + 1);
      const block = output.substring(
        ifRegex.lastIndex,
        blockEnd === -1 ? ifRegex.lastIndex + 2000 : blockEnd,
      );

      const inputMatch = block.match(
        /Input Rate\s*:\s*(\d+)\s*bps,\s*(\d+)\s*pps/i,
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
        /Output Rate\s*:\s*(\d+)\s*bps,\s*(\d+)\s*pps/i,
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
    // "CPU utilization (%):  15"
    const cpuMatch = output.match(/CPU\s+utilization\s*\(%?\)?\s*:?\s*(\d+)/i);
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

  private parseSystem(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // "Memory (MB): Total: 8192  Free: 4096"
    const memMatch = output.match(
      /Memory[^:]*:\s*Total:\s*(\d+)\s+Free:\s*(\d+)/i,
    );
    if (memMatch) {
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "total_memory",
          metricValue: parseInt(memMatch[1], 10) * 1024 * 1024,
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "free_memory",
          metricValue: parseInt(memMatch[2], 10) * 1024 * 1024,
        },
      );
    }

    // "Up Time: 5 days, 12 hours, 30 mins"
    const uptimeMatch = output.match(/Up Time:\s*(.+)/i);
    if (uptimeMatch) {
      let seconds = 0;
      const days = uptimeMatch[1].match(/(\d+)\s*day/);
      const hours = uptimeMatch[1].match(/(\d+)\s*hour/);
      const minutes = uptimeMatch[1].match(/(\d+)\s*min/);
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
