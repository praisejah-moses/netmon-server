import { Test, TestingModule } from "@nestjs/testing";
import { CryptoService } from "../../services/crypto/crypto.service";
import { ConfigService } from "@nestjs/config";

describe("CryptoService", () => {
  let service: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "CREDENTIAL_ENCRYPTION_KEY") {
                return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
              }
              return "";
            },
          },
        },
      ],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should encrypt and decrypt a string", () => {
    const plaintext = "my-secret-router-password";
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(":")).toHaveLength(3);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for the same input", () => {
    const plaintext = "same-password";
    const encrypted1 = service.encrypt(plaintext);
    const encrypted2 = service.encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);

    expect(service.decrypt(encrypted1)).toBe(plaintext);
    expect(service.decrypt(encrypted2)).toBe(plaintext);
  });
});
