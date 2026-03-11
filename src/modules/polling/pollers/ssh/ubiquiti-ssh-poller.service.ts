import { Injectable, Logger } from "@nestjs/common";
import { DevicePoller } from "../device-poller.interface";
import {
  RouterPollJob,
  NormalizedMetric,
} from "../../constants/queue.constants";
import { SshTransportService, SshCredentials } from "./ssh-transport.service";
import { RoutersService } from "../../../routers/routers.service";

/**
 * SSH/CLI poller for Ubiquiti EdgeOS / UniFi switches.
 *
 * EdgeOS is Vyatta-based, so commands are Unix-style:
 *  - show interfaces            → interface status and counters
 *  - show system cpu             → CPU usage (via /proc/stat)
 *  - show system memory          → memory usage
 *  - show version                → uptime
 */
@Injectable()
export class UbiquitiSshPollerService implements DevicePoller {
  private readonly logger = new Logger(UbiquitiSshPollerService.name);

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

    const results = await this.ssh.execMultiple(
      job.ipAddress,
      job.sshPort,
      creds,
      [
        "show interfaces",
        "cat /proc/stat | head -1",
        "cat /proc/meminfo | head -3",
        "cat /proc/uptime",
      ],
    );

    const timestamp = new Date().toISOString();
    const metrics: NormalizedMetric[] = [];

    if (results[0])
      this.parseInterfaces(results[0].stdout, job, timestamp, metrics);
    if (results[1]) this.parseCpu(results[1].stdout, job, timestamp, metrics);
    if (results[2])
      this.parseMemory(results[2].stdout, job, timestamp, metrics);
    if (results[3])
      this.parseUptime(results[3].stdout, job, timestamp, metrics);

    return metrics;
  }

  private parseInterfaces(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // EdgeOS "show interfaces" output:
    // "eth0   up      up      1.2.3.4/24"
    // Also may show RX/TX bytes in detail blocks
    const ifRegex = /^(\S+)\s+(\w+)\s+(\w+)/gm;
    let match: RegExpExecArray | null;

    while ((match = ifRegex.exec(output)) !== null) {
      const ifName = match[1];
      if (ifName === "Interface" || ifName === "---") continue;

      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        interface: ifName,
        metricName: "interface_status",
        metricValue: match[2].toLowerCase() === "up" ? 1 : 0,
      });
    }

    // "RX:  12345678 bytes  56789 packets"
    // "TX:  87654321 bytes  54321 packets"
    const rxRegex = /(\S+)[\s\S]*?RX:\s+(\d+)\s+bytes\s+(\d+)\s+packets/g;
    let rxMatch: RegExpExecArray | null;
    while ((rxMatch = rxRegex.exec(output)) !== null) {
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: rxMatch[1],
          metricName: "rx_bps",
          metricValue: parseInt(rxMatch[2], 10) * 8,
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: rxMatch[1],
          metricName: "rx_packets",
          metricValue: parseInt(rxMatch[3], 10),
        },
      );
    }

    const txRegex = /(\S+)[\s\S]*?TX:\s+(\d+)\s+bytes\s+(\d+)\s+packets/g;
    let txMatch: RegExpExecArray | null;
    while ((txMatch = txRegex.exec(output)) !== null) {
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: txMatch[1],
          metricName: "tx_bps",
          metricValue: parseInt(txMatch[2], 10) * 8,
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: txMatch[1],
          metricName: "tx_packets",
          metricValue: parseInt(txMatch[3], 10),
        },
      );
    }
  }

  private parseCpu(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // /proc/stat: "cpu  user nice system idle iowait irq softirq steal"
    const cpuMatch = output.match(/^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m);
    if (cpuMatch) {
      const user = parseInt(cpuMatch[1], 10);
      const nice = parseInt(cpuMatch[2], 10);
      const system = parseInt(cpuMatch[3], 10);
      const idle = parseInt(cpuMatch[4], 10);
      const total = user + nice + system + idle;
      const usage = total > 0 ? Math.round(((total - idle) / total) * 100) : 0;
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "cpu_load",
        metricValue: usage,
      });
    }
  }

  private parseMemory(
    output: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // /proc/meminfo:
    // "MemTotal:        1024000 kB"
    // "MemFree:          512000 kB"
    const totalMatch = output.match(/MemTotal:\s+(\d+)/);
    const freeMatch = output.match(/MemFree:\s+(\d+)/);
    if (totalMatch) {
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "total_memory",
          metricValue: parseInt(totalMatch[1], 10) * 1024,
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "free_memory",
          metricValue: freeMatch ? parseInt(freeMatch[1], 10) * 1024 : 0,
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
    // /proc/uptime: "12345.67 23456.78"
    const uptimeMatch = output.match(/^(\d+(?:\.\d+)?)/m);
    if (uptimeMatch) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "uptime",
        metricValue: Math.floor(parseFloat(uptimeMatch[1])),
      });
    }
  }
}
