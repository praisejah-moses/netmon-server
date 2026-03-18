export const QUEUE_NAMES = {
  ROUTER_POLL: "router-poll-queue",
  SNMP_POLL: "snmp-poll-queue",
  SSH_POLL: "ssh-poll-queue",
  NETCONF_POLL: "netconf-poll-queue",
  METRIC_PROCESSING: "metric-processing-queue",
} as const;

export interface RouterPollJob {
  routerId: string;
  organizationId: string;
  protocol: string;
  vendor: string;
  osType?: string;
  ipAddress: string;
  apiPort: number;
  sshPort: number;
  netconfPort: number;
  /** Resolved VPN interface name (from linked VpnConfig or direct override). Undefined for direct-connect devices. */
  vpnInterface?: string;
}

export interface MetricProcessingJob {
  routerId: string;
  organizationId: string;
  metrics: NormalizedMetric[];
}

export interface NormalizedMetric {
  timestamp: string;
  organizationId: string;
  routerId: string;
  interface?: string;
  metricName: string;
  metricValue: number;
}
