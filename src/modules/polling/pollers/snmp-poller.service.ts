import { Injectable, Logger } from "@nestjs/common";
import * as snmp from "net-snmp";
import { RouterPollJob, NormalizedMetric } from "../constants/queue.constants";
import { RoutersService } from "../../routers/routers.service";

// Standard SNMP OIDs
const OID = {
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  ifNumber: "1.3.6.1.2.1.2.1.0",
};

@Injectable()
export class SnmpPollerService {
  private readonly logger = new Logger(SnmpPollerService.name);

  constructor(private routersService: RoutersService) {}

  async poll(job: RouterPollJob): Promise<NormalizedMetric[]> {
    const router = await this.routersService.getRouterWithCredentials(
      job.routerId,
    );
    if (!router.credential) {
      throw new Error(`No credentials found for router ${job.routerId}`);
    }

    const session = this.createSession(job.ipAddress, router.credential);
    const metrics: NormalizedMetric[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Get interface descriptions
      const ifDescriptions = await this.subtreeWalk(session, OID.ifDescr);
      const ifInOctets = await this.subtreeWalk(session, OID.ifInOctets);
      const ifOutOctets = await this.subtreeWalk(session, OID.ifOutOctets);
      const ifStatus = await this.subtreeWalk(session, OID.ifOperStatus);

      // Map interface index to name
      const ifNames: Record<string, string> = {};
      for (const v of ifDescriptions) {
        const index = v.oid.split(".").pop();
        ifNames[index] = v.value.toString();
      }

      // Interface traffic metrics
      for (const v of ifInOctets) {
        const index = v.oid.split(".").pop();
        const ifName = ifNames[index] || `if${index}`;
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: ifName,
          metricName: "rx_bps",
          metricValue: typeof v.value === "number" ? v.value * 8 : 0, // octets to bits
        });
      }

      for (const v of ifOutOctets) {
        const index = v.oid.split(".").pop();
        const ifName = ifNames[index] || `if${index}`;
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: ifName,
          metricName: "tx_bps",
          metricValue: typeof v.value === "number" ? v.value * 8 : 0,
        });
      }

      for (const v of ifStatus) {
        const index = v.oid.split(".").pop();
        const ifName = ifNames[index] || `if${index}`;
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          interface: ifName,
          metricName: "interface_status",
          metricValue: v.value === 1 ? 1 : 0, // 1 = up
        });
      }

      // System uptime
      const uptime = await this.get(session, [OID.sysUpTime]);
      if (uptime.length > 0) {
        metrics.push({
          timestamp,
          organizationId: job.organizationId,
          routerId: job.routerId,
          metricName: "uptime",
          metricValue:
            typeof uptime[0].value === "number" ? uptime[0].value / 100 : 0, // timeticks to seconds
        });
      }
    } finally {
      session.close();
    }

    return metrics;
  }

  private createSession(host: string, credential: any): any {
    if (credential.snmpVersion === "v3") {
      return snmp.createV3Session(host, {
        name: credential.username,
        level: snmp.SecurityLevel.authPriv,
        authProtocol:
          credential.snmpAuthProtocol === "SHA"
            ? snmp.AuthProtocols.sha
            : snmp.AuthProtocols.md5,
        authKey: credential.snmpAuthKey || credential.passwordEncrypted,
        privProtocol:
          credential.snmpPrivProtocol === "AES"
            ? snmp.PrivProtocols.aes
            : snmp.PrivProtocols.des,
        privKey: credential.snmpPrivKey || credential.passwordEncrypted,
      });
    }

    // Default to SNMPv2c
    return snmp.createSession(host, credential.snmpCommunity || "public");
  }

  private subtreeWalk(session: any, oid: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      session.subtree(
        oid,
        (varbinds: any[]) => {
          for (const vb of varbinds) {
            results.push(vb);
          }
        },
        (error: any) => {
          if (error) reject(error);
          else resolve(results);
        },
      );
    });
  }

  private get(session: any, oids: string[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      session.get(oids, (error: any, varbinds: any[]) => {
        if (error) reject(error);
        else resolve(varbinds);
      });
    });
  }
}
