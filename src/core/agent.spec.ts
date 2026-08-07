import { describe, it, expect } from 'vitest';
import { AGENT_TIMEOUT_MS, agentTimeoutMessage } from './agent';

describe('AGENT_TIMEOUT_MS', () => {
  it('gibt einem Agentenlauf zehn Minuten', () => {
    expect(AGENT_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});

describe('agentTimeoutMessage', () => {
  it('nennt die Minuten des Standard-Zeitbudgets', () => {
    expect(agentTimeoutMessage()).toContain('10 Minuten');
  });

  it('folgt einem abweichenden Zeitbudget', () => {
    expect(agentTimeoutMessage(90_000)).toContain('2 Minuten');
    expect(agentTimeoutMessage(60_000)).toContain('1 Minute geantwortet');
  });
});
