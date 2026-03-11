import { Injectable, Logger } from "@nestjs/common";
import { DevicePoller } from "./device-poller.interface";
import { RouterOsPollerService } from "./routeros-poller.service";
import { SnmpPollerService } from "./snmp-poller.service";
import { CiscoSshPollerService } from "./ssh/cisco-ssh-poller.service";
import { JuniperSshPollerService } from "./ssh/juniper-ssh-poller.service";
import { AristaSshPollerService } from "./ssh/arista-ssh-poller.service";
import { HuaweiSshPollerService } from "./ssh/huawei-ssh-poller.service";
import { UbiquitiSshPollerService } from "./ssh/ubiquiti-ssh-poller.service";
import { DellSshPollerService } from "./ssh/dell-ssh-poller.service";
import { HpeSshPollerService } from "./ssh/hpe-ssh-poller.service";
import { CiscoNetconfPollerService } from "./netconf/cisco-netconf-poller.service";
import { JuniperNetconfPollerService } from "./netconf/juniper-netconf-poller.service";
import { AristaNetconfPollerService } from "./netconf/arista-netconf-poller.service";

/**
 * Resolves the correct DevicePoller implementation based on (protocol, vendor).
 *
 * Resolution order:
 *  1. Exact (protocol, vendor) match
 *  2. Protocol-level fallback (SNMP works for every vendor)
 *  3. null → unsupported combination
 */
@Injectable()
export class PollerRegistryService {
  private readonly logger = new Logger(PollerRegistryService.name);
  private readonly registry = new Map<string, DevicePoller>();

  constructor(
    routerOsPoller: RouterOsPollerService,
    snmpPoller: SnmpPollerService,
    ciscoSsh: CiscoSshPollerService,
    juniperSsh: JuniperSshPollerService,
    aristaSsh: AristaSshPollerService,
    huaweiSsh: HuaweiSshPollerService,
    ubiquitiSsh: UbiquitiSshPollerService,
    dellSsh: DellSshPollerService,
    hpeSsh: HpeSshPollerService,
    ciscoNetconf: CiscoNetconfPollerService,
    juniperNetconf: JuniperNetconfPollerService,
    aristaNetconf: AristaNetconfPollerService,
  ) {
    // ── RouterOS API (vendor-specific) ────────────────────────
    this.register("ROUTEROS_API", "MIKROTIK", routerOsPoller);

    // ── SNMP (universal — works for every vendor) ─────────────
    this.register("SNMP", "*", snmpPoller);

    // ── SSH/CLI (vendor-specific parsers) ─────────────────────
    this.register("SSH_CLI", "CISCO", ciscoSsh);
    this.register("SSH_CLI", "JUNIPER", juniperSsh);
    this.register("SSH_CLI", "ARISTA", aristaSsh);
    this.register("SSH_CLI", "HUAWEI", huaweiSsh);
    this.register("SSH_CLI", "UBIQUITI", ubiquitiSsh);
    this.register("SSH_CLI", "DELL", dellSsh);
    this.register("SSH_CLI", "HPE", hpeSsh);

    // ── NETCONF (vendor-specific YANG models) ─────────────────
    this.register("NETCONF", "CISCO", ciscoNetconf);
    this.register("NETCONF", "JUNIPER", juniperNetconf);
    this.register("NETCONF", "ARISTA", aristaNetconf);

    this.logger.log(
      `Poller registry initialised with ${this.registry.size} entries`,
    );
  }

  /**
   * Resolve the best-fit poller for a given protocol + vendor.
   *
   * @returns DevicePoller or null if no poller registered.
   */
  resolve(protocol: string, vendor: string): DevicePoller | null {
    // 1. Exact match
    const exact = this.registry.get(this.key(protocol, vendor));
    if (exact) return exact;

    // 2. Wildcard / protocol-level fallback
    const wildcard = this.registry.get(this.key(protocol, "*"));
    if (wildcard) return wildcard;

    this.logger.warn(
      `No poller registered for protocol=${protocol}, vendor=${vendor}`,
    );
    return null;
  }

  private register(protocol: string, vendor: string, poller: DevicePoller) {
    this.registry.set(this.key(protocol, vendor), poller);
  }

  private key(protocol: string, vendor: string): string {
    return `${protocol}:${vendor}`;
  }
}
