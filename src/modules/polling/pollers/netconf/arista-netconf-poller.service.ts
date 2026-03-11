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
 * NETCONF poller for Arista EOS devices.
 *
 * Arista supports IETF YANG models:
 *  - ietf-interfaces (RFC 8343)     → interface state, counters
 *  - openconfig-system              → CPU, memory, uptime
 */
@Injectable()
export class AristaNetconfPollerService implements DevicePoller {
  private readonly logger = new Logger(AristaNetconfPollerService.name);

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

    const rpcs = [this.buildInterfacesRpc(), this.buildSystemRpc()];

    const replies = await this.netconf.request(
      job.ipAddress,
      job.netconfPort,
      creds,
      rpcs,
    );

    const timestamp = new Date().toISOString();
    const metrics: NormalizedMetric[] = [];

    if (replies[0]) this.parseInterfaces(replies[0], job, timestamp, metrics);
    if (replies[1]) this.parseSystem(replies[1], job, timestamp, metrics);

    return metrics;
  }

  private buildInterfacesRpc(): string {
    return `<rpc message-id="1" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get>
    <filter type="subtree">
      <interfaces xmlns="http://openconfig.net/yang/interfaces">
        <interface>
          <name/>
          <state>
            <oper-status/>
            <counters>
              <in-octets/>
              <out-octets/>
              <in-unicast-pkts/>
              <out-unicast-pkts/>
            </counters>
          </state>
        </interface>
      </interfaces>
    </filter>
  </get>
</rpc>`;
  }

  private buildSystemRpc(): string {
    return `<rpc message-id="2" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <get>
    <filter type="subtree">
      <system xmlns="http://openconfig.net/yang/system">
        <state>
          <boot-time/>
        </state>
        <cpus>
          <cpu>
            <state>
              <total>
                <instant/>
              </total>
            </state>
          </cpu>
        </cpus>
        <memory>
          <state>
            <physical/>
            <reserved/>
          </state>
        </memory>
      </system>
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
    const ifRegex = /<interface>([\s\S]*?)<\/interface>/g;
    let match: RegExpExecArray | null;

    while ((match = ifRegex.exec(xml)) !== null) {
      const block = match[1];
      const name = this.extractTag(block, "name");
      if (!name || name.startsWith("Management") || name.startsWith("Loopback"))
        continue;

      const operStatus = this.extractTag(block, "oper-status");
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        interface: name,
        metricName: "interface_status",
        metricValue: operStatus === "UP" || operStatus === "up" ? 1 : 0,
      });

      const inOctets = this.extractTag(block, "in-octets");
      const outOctets = this.extractTag(block, "out-octets");
      const inPkts = this.extractTag(block, "in-unicast-pkts");
      const outPkts = this.extractTag(block, "out-unicast-pkts");

      if (inOctets)
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "rx_bps",
          metricValue: parseInt(inOctets, 10) * 8,
        });
      if (outOctets)
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "tx_bps",
          metricValue: parseInt(outOctets, 10) * 8,
        });
      if (inPkts)
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: name,
          metricName: "rx_packets",
          metricValue: parseInt(inPkts, 10),
        });
      if (outPkts)
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

  private parseSystem(
    xml: string,
    job: RouterPollJob,
    timestamp: string,
    metrics: NormalizedMetric[],
  ) {
    // CPU — openconfig: <instant> contains utilisation percentage
    const cpuInstant = this.extractTag(xml, "instant");
    if (cpuInstant) {
      metrics.push({
        timestamp,
        organizationId: job.organizationId,
        routerId: job.routerId,
        metricName: "cpu_load",
        metricValue: parseInt(cpuInstant, 10),
      });
    }

    // Memory
    const physical = this.extractTag(xml, "physical");
    const reserved = this.extractTag(xml, "reserved");
    if (physical) {
      const total = parseInt(physical, 10);
      const used = reserved ? parseInt(reserved, 10) : 0;
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

    // Uptime from boot-time
    const bootTime = this.extractTag(xml, "boot-time");
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
  }

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }
}
