import { Injectable, Logger } from "@nestjs/common";
import { VpnProtocol } from "@prisma/client";

export interface VpnInterfaceConfig {
  interfaceName: string;
  subnet: string;
  endpoint?: string;
  publicKey?: string;
  configData?: string;
}

/**
 * Generates VPN configuration files for different protocols.
 * In production, these configs would be applied to the server's
 * network stack via system commands.
 */
@Injectable()
export class VpnConfigGeneratorService {
  private readonly logger = new Logger(VpnConfigGeneratorService.name);

  generateConfig(protocol: VpnProtocol, config: VpnInterfaceConfig): string {
    switch (protocol) {
      case VpnProtocol.WIREGUARD:
        return this.generateWireGuardConfig(config);
      case VpnProtocol.OPENVPN:
        return this.generateOpenVpnConfig(config);
      case VpnProtocol.IPSEC:
        return this.generateIpSecConfig(config);
      default:
        throw new Error(`Unsupported VPN protocol: ${protocol}`);
    }
  }

  private generateWireGuardConfig(config: VpnInterfaceConfig): string {
    return `# WireGuard Configuration - ${config.interfaceName}
[Interface]
Address = ${config.subnet}
ListenPort = 51820

[Peer]
PublicKey = ${config.publicKey || "REPLACE_WITH_PEER_PUBLIC_KEY"}
AllowedIPs = ${config.subnet}
Endpoint = ${config.endpoint || "REPLACE_WITH_PEER_ENDPOINT:51820"}
PersistentKeepalive = 25
`;
  }

  private generateOpenVpnConfig(config: VpnInterfaceConfig): string {
    return `# OpenVPN Configuration - ${config.interfaceName}
dev ${config.interfaceName}
dev-type tun
proto udp
remote ${config.endpoint || "REPLACE_WITH_REMOTE_HOST"} 1194
resolv-retry infinite
nobind
persist-key
persist-tun
cipher AES-256-GCM
auth SHA256
verb 3

# Routing
route ${config.subnet.split("/")[0]} ${this.cidrToNetmask(config.subnet)}
`;
  }

  private generateIpSecConfig(config: VpnInterfaceConfig): string {
    return `# IPSec / strongSwan Configuration - ${config.interfaceName}
conn ${config.interfaceName}
    type=tunnel
    left=%defaultroute
    leftsubnet=0.0.0.0/0
    right=${config.endpoint || "REPLACE_WITH_PEER_IP"}
    rightsubnet=${config.subnet}
    ike=aes256-sha256-modp2048
    esp=aes256-sha256
    keyexchange=ikev2
    auto=start
`;
  }

  private cidrToNetmask(cidr: string): string {
    const bits = parseInt(cidr.split("/")[1] || "24", 10);
    const mask: number[] = [];
    for (let i = 0; i < 4; i++) {
      const n = Math.min(bits - i * 8, 8);
      mask.push(n > 0 ? 256 - Math.pow(2, 8 - n) : 0);
    }
    return mask.join(".");
  }
}
