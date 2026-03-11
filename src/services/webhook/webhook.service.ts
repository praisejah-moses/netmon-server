import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, any>;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  async send(url: string, payload: WebhookPayload): Promise<boolean> {
    try {
      await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });
      this.logger.log(`Webhook sent to ${url} for event: ${payload.event}`);
      return true;
    } catch (error) {
      this.logger.error(`Webhook failed for ${url}: ${error.message}`);
      return false;
    }
  }
}
