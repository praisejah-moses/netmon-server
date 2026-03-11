import { Injectable, Logger } from "@nestjs/common";
import { DevicePoller } from "../device-poller.interface";
import {
  RouterPollJob,
  NormalizedMetric,
} from "../../constants/queue.constants";
import { SshTransportService, SshCredentials } from "./ssh-transport.service";
import { RoutersService } from "../../../routers/routers.service";

/**
 * SSH/CLI poller for Cisco IOS, IOS-XE, and NX-OS devices.
 *
 * Commands used:
 *  - show interfaces        → bandwidth, packets, errors, status
 *  - show processes cpu      → CPU utilisation
 *  - show memory statistics  → memory usage
 *  - show version            → uptime
 */
@Injectable()
export class CiscoSshPollerService implements DevicePoller {
  private readonly logger = new Logger(CiscoSshPollerService.name);

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
      "show interfaces",
      "show processes cpu | include CPU",
      "show memory statistics | include Processor",
      "show version | include uptime",
    ];

    const output = await this.ssh.shell(
      job.ipAddress,
      job.sshPort,
      creds,
      commands,
    );
    const timestamp = new Date().toISOString();
    const metrics: NormalizedMetric[] = [];

    this.parseInterfaces(output, job, timestamp, metrics);
    this.parseCpu(output, job, timestamp, metrics);
    this.parseMemory(output, job, timestamp, metrics);
    this.parseUptime(output, job, timestamp, metrics);

    return metrics;
  }

  private parseInterfaces(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // Match interface blocks: "GigabitEthernet0/0 is up, line protocol is up"
    const ifRegex =
      /^(\S+) is (up|down|administratively down), line protocol is (up|down)/gm;
    let match: RegExpExecArray | null;

    while ((match = ifRegex.exec(output)) !== null) {
      const ifName = match[1];
      const isUp = match[3] === "up" ? 1 : 0;

      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        interface: ifName,
        metricName: "interface_status",
        metricValue: isUp,
      });

      // Parse input/output rate from the same interface block
      const blockEnd = output.indexOf(
        "\n" + ifName.charAt(0),
        ifRegex.lastIndex + 1,
      );
      const block = output.substring(
        ifRegex.lastIndex,
        blockEnd === -1 ? ifRegex.lastIndex + 2000 : blockEnd,
      );

      // "5 minute input rate 1000 bits/sec, 2 packets/sec"
      const inputRate = block.match(
        /input rate (\d+) bits\/sec,\s*(\d+) packets\/sec/,
      );
      if (inputRate) {
        metrics.push(
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "rx_bps",
            metricValue: parseInt(inputRate[1], 10),
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "rx_packets",
            metricValue: parseInt(inputRate[2], 10),
          },
        );
      }

      const outputRate = block.match(
        /output rate (\d+) bits\/sec,\s*(\d+) packets\/sec/,
      );
      if (outputRate) {
        metrics.push(
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "tx_bps",
            metricValue: parseInt(outputRate[1], 10),
          },
          {
            timestamp,
            organizationId: job.organizationId,
            routerId: job.routerId,
            interface: ifName,
            metricName: "tx_packets",
            metricValue: parseInt(outputRate[2], 10),
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
    // "CPU utilization for five seconds: 5%/0%; one minute: 4%; five minutes: 3%"
    const cpuMatch = output.match(/CPU utilization for five seconds:\s*(\d+)%/);
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
    // "Processor  7C6EB778  356003624  113498520  242505104  68"
    const memMatch = output.match(/Processor\s+\S+\s+(\d+)\s+(\d+)\s+(\d+)/);
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
    // "router uptime is 2 weeks, 3 days, 4 hours, 5 minutes"
    const uptimeMatch = output.match(/uptime is (.+)/i);
    if (uptimeMatch) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "uptime",
        metricValue: this.parseUptimeString(uptimeMatch[1]),
      });
    }
  }

  private parseUptimeString(uptime: string): number {
    let seconds = 0;
    const weeks = uptime.match(/(\d+)\s*week/);
    const days = uptime.match(/(\d+)\s*day/);
    const hours = uptime.match(/(\d+)\s*hour/);
    const minutes = uptime.match(/(\d+)\s*minute/);
    if (weeks) seconds += parseInt(weeks[1], 10) * 604800;
    if (days) seconds += parseInt(days[1], 10) * 86400;
    if (hours) seconds += parseInt(hours[1], 10) * 3600;
    if (minutes) seconds += parseInt(minutes[1], 10) * 60;
    return seconds;
  }
}
