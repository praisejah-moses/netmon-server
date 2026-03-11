import { Injectable, Logger } from "@nestjs/common";
import { Client, ConnectConfig } from "ssh2";

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SshCredentials {
  username: string;
  password?: string;
  privateKey?: string;
  enablePassword?: string;
}

@Injectable()
export class SshTransportService {
  private readonly logger = new Logger(SshTransportService.name);

  /**
   * Execute a single command over SSH and return the output.
   */
  async exec(
    host: string,
    port: number,
    credentials: SshCredentials,
    command: string,
    timeout = 15000,
  ): Promise<SshExecResult> {
    const conn = await this.connect(host, port, credentials, timeout);
    try {
      return await this.execCommand(conn, command, timeout);
    } finally {
      conn.end();
    }
  }

  /**
   * Execute multiple commands sequentially and return all results.
   */
  async execMultiple(
    host: string,
    port: number,
    credentials: SshCredentials,
    commands: string[],
    timeout = 15000,
  ): Promise<SshExecResult[]> {
    const conn = await this.connect(host, port, credentials, timeout);
    try {
      const results: SshExecResult[] = [];
      for (const cmd of commands) {
        results.push(await this.execCommand(conn, cmd, timeout));
      }
      return results;
    } finally {
      conn.end();
    }
  }

  /**
   * Open an interactive shell session, send commands, and collect output.
   * Useful for devices that require "enable" mode or paginated output.
   */
  async shell(
    host: string,
    port: number,
    credentials: SshCredentials,
    commands: string[],
    timeout = 20000,
  ): Promise<string> {
    const conn = await this.connect(host, port, credentials, timeout);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        conn.end();
        reject(new Error(`SSH shell timeout after ${timeout}ms`));
      }, timeout);

      conn.shell((err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          return reject(err);
        }

        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", () => {
          clearTimeout(timer);
          conn.end();
          resolve(output);
        });

        stream.stderr.on("data", (data: Buffer) => {
          output += data.toString();
        });

        // Disable pagination, enter enable mode if needed
        const allCommands = [
          "terminal length 0",
          "terminal width 512",
          ...(credentials.enablePassword
            ? ["enable", credentials.enablePassword]
            : []),
          ...commands,
          "exit",
        ];

        for (const cmd of allCommands) {
          stream.write(cmd + "\n");
        }
      });
    });
  }

  private connect(
    host: string,
    port: number,
    credentials: SshCredentials,
    timeout: number,
  ): Promise<Client> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const config: ConnectConfig = {
        host,
        port,
        username: credentials.username,
        readyTimeout: timeout,
        algorithms: {
          kex: [
            "ecdh-sha2-nistp256",
            "ecdh-sha2-nistp384",
            "ecdh-sha2-nistp521",
            "diffie-hellman-group-exchange-sha256",
            "diffie-hellman-group14-sha256",
            "diffie-hellman-group14-sha1",
            "diffie-hellman-group1-sha1",
          ],
          serverHostKey: [
            "ssh-rsa",
            "ecdsa-sha2-nistp256",
            "ssh-ed25519",
            "rsa-sha2-256",
            "rsa-sha2-512",
          ],
        },
      };

      if (credentials.privateKey) {
        config.privateKey = credentials.privateKey;
        if (credentials.password) {
          config.passphrase = credentials.password;
        }
      } else {
        config.password = credentials.password;
      }

      conn.on("ready", () => resolve(conn));
      conn.on("error", (err) => reject(err));
      conn.connect(config);
    });
  }

  private execCommand(
    conn: Client,
    command: string,
    timeout: number,
  ): Promise<SshExecResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`SSH exec timeout after ${timeout}ms`));
      }, timeout);

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
        stream.on("close", (code: number) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code: code ?? 0 });
        });
      });
    });
  }
}
