import { Injectable, Logger } from "@nestjs/common";
import { Client } from "ssh2";

export interface NetconfCredentials {
  username: string;
  password?: string;
  privateKey?: string;
}

/**
 * RFC 6241 NETCONF transport over SSH (subsystem).
 *
 * Opens an SSH connection, starts the "netconf" subsystem, exchanges
 * <hello> capabilities, then sends <rpc> requests and parses <rpc-reply> XML.
 */
@Injectable()
export class NetconfTransportService {
  private readonly logger = new Logger(NetconfTransportService.name);
  private static readonly DELIMITER = "]]>]]>";

  /**
   * Send one or more NETCONF RPC requests and return the raw XML replies.
   */
  async request(
    host: string,
    port: number,
    credentials: NetconfCredentials,
    rpcs: string[],
    timeout = 20000,
  ): Promise<string[]> {
    const conn = await this.connect(host, port, credentials, timeout);
    try {
      const stream = await this.openSubsystem(conn, timeout);

      // Wait for server hello
      await this.readMessage(stream, timeout);

      // Send client hello
      stream.write(this.buildHello());

      const replies: string[] = [];
      for (const rpc of rpcs) {
        stream.write(rpc + NetconfTransportService.DELIMITER);
        const reply = await this.readMessage(stream, timeout);
        replies.push(reply);
      }

      // Close session gracefully
      stream.write(
        `<rpc message-id="close"><close-session/></rpc>${NetconfTransportService.DELIMITER}`,
      );

      return replies;
    } finally {
      conn.end();
    }
  }

  private buildHello(): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<hello xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">',
      "  <capabilities>",
      "    <capability>urn:ietf:params:netconf:base:1.0</capability>",
      "  </capabilities>",
      "</hello>",
      NetconfTransportService.DELIMITER,
    ].join("\n");
  }

  private connect(
    host: string,
    port: number,
    credentials: NetconfCredentials,
    timeout: number,
  ): Promise<Client> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const config: any = {
        host,
        port,
        username: credentials.username,
        readyTimeout: timeout,
      };
      if (credentials.privateKey) {
        config.privateKey = credentials.privateKey;
        if (credentials.password) config.passphrase = credentials.password;
      } else {
        config.password = credentials.password;
      }

      conn.on("ready", () => resolve(conn));
      conn.on("error", (err) => reject(err));
      conn.connect(config);
    });
  }

  private openSubsystem(conn: Client, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("NETCONF subsystem open timeout"));
      }, timeout);

      conn.subsys("netconf", (err, stream) => {
        clearTimeout(timer);
        if (err) return reject(err);
        resolve(stream);
      });
    });
  }

  private readMessage(stream: any, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("NETCONF read timeout"));
      }, timeout);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const delimIdx = buffer.indexOf(NetconfTransportService.DELIMITER);
        if (delimIdx !== -1) {
          cleanup();
          resolve(buffer.substring(0, delimIdx));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        stream.removeListener("data", onData);
      };

      stream.on("data", onData);
    });
  }
}
