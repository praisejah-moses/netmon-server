import { AlertEvaluationService } from "./alert-evaluation.service";

describe("AlertEvaluationService - compareValues", () => {
  let service: any;

  beforeEach(() => {
    // Instantiate with null deps since we're only testing the private method via reflection
    service = new AlertEvaluationService(null as any, null as any, null as any);
  });

  it("should correctly evaluate > comparison", () => {
    expect(service.compareValues(90, ">", 85)).toBe(true);
    expect(service.compareValues(80, ">", 85)).toBe(false);
  });

  it("should correctly evaluate < comparison", () => {
    expect(service.compareValues(80, "<", 85)).toBe(true);
    expect(service.compareValues(90, "<", 85)).toBe(false);
  });

  it("should correctly evaluate >= comparison", () => {
    expect(service.compareValues(85, ">=", 85)).toBe(true);
    expect(service.compareValues(84, ">=", 85)).toBe(false);
  });

  it("should correctly evaluate <= comparison", () => {
    expect(service.compareValues(85, "<=", 85)).toBe(true);
    expect(service.compareValues(86, "<=", 85)).toBe(false);
  });

  it("should correctly evaluate == comparison", () => {
    expect(service.compareValues(85, "==", 85)).toBe(true);
    expect(service.compareValues(84, "==", 85)).toBe(false);
  });
});
