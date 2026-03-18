import { VpnConfigGeneratorService } from "./vpn-config-generator.service";
import { VpnProtocol } from "../../../generated/prisma/client.js";

describe("VpnConfigGeneratorService", () => {
  let service: VpnConfigGeneratorService;

  beforeEach(() => {
    service = new VpnConfigGeneratorService();
  });

  it("should generate WireGuard config", () => {
    const config = service.generateConfig(VpnProtocol.WIREGUARD, {
      interfaceName: "wg0",
      subnet: "10.10.0.0/24",
      endpoint: "203.0.113.1:51820",
      publicKey: "testPublicKey==",
    });

    expect(config).toContain("[Interface]");
    expect(config).toContain("10.10.0.0/24");
    expect(config).toContain("[Peer]");
    expect(config).toContain("testPublicKey==");
  });

  it("should generate OpenVPN config", () => {
    const config = service.generateConfig(VpnProtocol.OPENVPN, {
      interfaceName: "tun0",
      subnet: "10.20.0.0/24",
      endpoint: "vpn.example.com",
    });

    expect(config).toContain("dev tun0");
    expect(config).toContain("proto udp");
    expect(config).toContain("vpn.example.com");
  });

  it("should generate IPSec config", () => {
    const config = service.generateConfig(VpnProtocol.IPSEC, {
      interfaceName: "ipsec0",
      subnet: "10.30.0.0/24",
      endpoint: "198.51.100.1",
    });

    expect(config).toContain("conn ipsec0");
    expect(config).toContain("ikev2");
    expect(config).toContain("198.51.100.1");
  });
});
