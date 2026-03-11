import { RouterPollJob, NormalizedMetric } from "../constants/queue.constants";

/**
 * Common interface that every vendor/protocol poller must implement.
 * The PollerRegistry resolves the correct implementation at runtime
 * based on (protocol, vendor) from the RouterPollJob.
 */
export interface DevicePoller {
  poll(job: RouterPollJob): Promise<NormalizedMetric[]>;
}
