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
 * NETCONF poller for Cisco IOS-XE / NX-OS / IOS-XR.
 *
 * Uses YANG models:
 *  - ietf-interfaces (RFC 8343)       → interface status, counters
 *  - Cisco-IOS-XE-process-cpu-oper    → CPU utilisation
 *  - Cisco-IOS-XE-memory-oper         → memory usage
 *  - ietf-system                      → uptime
 */
@Injectable()
export class CiscoNetconfPollerService implements DevicePoller {
  private readonly logger = new Logger(CiscoNetconfPollerService.name);

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
      this.buildInterfacesRpc(),
      this.buildCpuRpc(),
      this.buildMemoryRpc(),
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
    if (replies[1]) this.parseCpu(replies[1], job, timestamp, metrics);
    if (replies[2]) this.parseMemory(replies[2], job, timestamp, metrics);
    if (replies[3]) this.parseUptime(replies[3], job, timestamp, metrics);

    return metrics;
  }

  private buildInterfacesRpc(): string {
    return `<rpc message-id="1" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get>
    <filter type="subtree">
      <interfaces-state xmlns="urn:ietf:params:xml:ns:yang:ietf-interfaces">
        <interface>
          <name/>
          <oper-status/>
          <statistics>
            <in-octets/>
            <out-octets/>
            <in-unicast-pkts/>
            <out-unicast-pkts/>
          </statistics>
        </interface>
      </interfaces-state>
    </filter>
  </get>
</rpc>`;
  }

  private buildCpuRpc(): string {
    return `<rpc message-id="2" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get>
    <filter type="subtree">
      <cpu-usage xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-process-cpu-oper">
        <cpu-utilization>
          <five-seconds/>
        </cpu-utilization>
      </cpu-usage>
    </filter>
  </get>
</rpc>`;
  }

  private buildMemoryRpc(): string {
    return `<rpc message-id="3" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get>
    <filter type="subtree">
      <memory-statistics xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-memory-oper">
        <memory-statistic>
          <name/>
          <total-memory/>
          <free-memory/>
        </memory-statistic>
      </memory-statistics>
    </filter>
  </get>
</rpc>`;
  }

  private buildUptimeRpc(): string {
    return `<rpc message-id="4" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get>
    <filter type="subtree">
      <system-state xmlns="urn:ietf:params:xml:ns:yang:ietf-system">
        <platform>
          <os-release/>
        </platform>
      </system-state>
    </filter>
  </get>
</rpc>`;
  }

  private parseInterfaces(
    xml: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // Simple regex-based XML parsing for interface data
    const ifRegex = /<interface>([\s\S]*?)<\/interface>/g;
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

      const inOctets = this.extractTag(block, "in-octets");
      const outOctets = this.extractTag(block, "out-octets");
      const inPkts = this.extractTag(block, "in-unicast-pkts");
      const outPkts = this.extractTag(block, "out-unicast-pkts");

      if (inOctets) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "rx_bps",
          metricValue: parseInt(inOctets, 10) * 8,
        });
      }
      if (outOctets) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "tx_bps",
          metricValue: parseInt(outOctets, 10) * 8,
        });
      }
      if (inPkts) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "rx_packets",
          metricValue: parseInt(inPkts, 10),
        });
      }
      if (outPkts) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "tx_packets",
          metricValue: parseInt(outPkts, 10),
        });
      }
    }
  }

  private parseCpu(
    xml: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    const cpuVal = this.extractTag(xml, "five-seconds");
    if (cpuVal) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "cpu_load",
        metricValue: parseInt(cpuVal, 10),
      });
    }
  }

  private parseMemory(
    xml: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    const total = this.extractTag(xml, "total-memory");
    const free = this.extractTag(xml, "free-memory");
    if (total) {
      metrics.push(
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "total_memory",
          metricValue: parseInt(total, 10),
        },
        {
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "free_memory",
          metricValue: free ? parseInt(free, 10) : 0,
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
    // ietf-system uptime is in the system-state/clock/boot-datetime format
    const bootDatetime =
      this.extractTag(xml, "boot-datetime") ||
      this.extractTag(xml, "current-datetime");
    if (bootDatetime) {
      const bootTime = new Date(bootDatetime).getTime();
      const now = Date.now();
      if (!isNaN(bootTime)) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "uptime",
          metricValue: Math.floor((now - bootTime) / 1000),
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
