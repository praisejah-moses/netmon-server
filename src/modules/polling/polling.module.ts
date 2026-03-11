import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUE_NAMES } from "./constants/queue.constants";
import { PollingSchedulerService } from "./polling-scheduler.service";
import { RouterPollWorker } from "./router-poll.worker";
// Existing pollers
import { RouterOsPollerService } from "./pollers/routeros-poller.service";
import { SnmpPollerService } from "./pollers/snmp-poller.service";
// SSH pollers
import { SshTransportService } from "./pollers/ssh/ssh-transport.service";
import { CiscoSshPollerService } from "./pollers/ssh/cisco-ssh-poller.service";
import { JuniperSshPollerService } from "./pollers/ssh/juniper-ssh-poller.service";
import { AristaSshPollerService } from "./pollers/ssh/arista-ssh-poller.service";
import { HuaweiSshPollerService } from "./pollers/ssh/huawei-ssh-poller.service";
import { UbiquitiSshPollerService } from "./pollers/ssh/ubiquiti-ssh-poller.service";
import { DellSshPollerService } from "./pollers/ssh/dell-ssh-poller.service";
import { HpeSshPollerService } from "./pollers/ssh/hpe-ssh-poller.service";
// NETCONF pollers
import { NetconfTransportService } from "./pollers/netconf/netconf-transport.service";
import { CiscoNetconfPollerService } from "./pollers/netconf/cisco-netconf-poller.service";
import { JuniperNetconfPollerService } from "./pollers/netconf/juniper-netconf-poller.service";
import { AristaNetconfPollerService } from "./pollers/netconf/arista-netconf-poller.service";
// Registry
import { PollerRegistryService } from "./pollers/poller-registry.service";
import { RoutersModule } from "../routers/routers.module";
import { MetricsModule } from "../metrics/metrics.module";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.ROUTER_POLL },
      { name: QUEUE_NAMES.SNMP_POLL },
      { name: QUEUE_NAMES.SSH_POLL },
      { name: QUEUE_NAMES.NETCONF_POLL },
      { name: QUEUE_NAMES.METRIC_PROCESSING },
    ),
    RoutersModule,
    MetricsModule,
  ],
  providers: [
    PollingSchedulerService,
    RouterPollWorker,
    // Existing pollers
    RouterOsPollerService,
    SnmpPollerService,
    // SSH transport + vendor parsers
    SshTransportService,
    CiscoSshPollerService,
    JuniperSshPollerService,
    AristaSshPollerService,
    HuaweiSshPollerService,
    UbiquitiSshPollerService,
    DellSshPollerService,
    HpeSshPollerService,
    // NETCONF transport + vendor parsers
    NetconfTransportService,
    CiscoNetconfPollerService,
    JuniperNetconfPollerService,
    AristaNetconfPollerService,
    // Registry
    PollerRegistryService,
  ],
  exports: [PollingSchedulerService],
})
export class PollingModule {}
