import { describe, it, expect } from 'vitest';
import {
  defaultPermission,
  effectivePermission,
  decideOutcome,
  FS_OP_LABELS,
} from './permissions';
import type { FsOp } from '@/types';

describe('defaultPermission', () => {
  it('erlaubt lesende Operationen still', () => {
    for (const op of ['read', 'list', 'exists', 'stat'] as FsOp[]) {
      expect(defaultPermission(op)).toBe('allow');
    }
  });

  it('fragt bei schreibenden/löschenden Operationen', () => {
    for (const op of ['write', 'mkdir', 'delete'] as FsOp[]) {
      expect(defaultPermission(op)).toBe('ask');
    }
  });
});

describe('effectivePermission', () => {
  it('nutzt die Vorgabe, wenn nichts gesetzt ist', () => {
    expect(effectivePermission(undefined, 'write')).toBe('ask');
    expect(effectivePermission({}, 'read')).toBe('allow');
  });

  it('bevorzugt die gesetzte Berechtigung', () => {
    expect(effectivePermission({ write: 'allow' }, 'write')).toBe('allow');
    expect(effectivePermission({ read: 'deny' }, 'read')).toBe('deny');
  });
});

describe('decideOutcome', () => {
  it('erlaubt einmalig ohne zu merken', () => {
    expect(decideOutcome('allow-once')).toEqual({ allowed: true });
  });
  it('erlaubt dauerhaft und merkt "allow"', () => {
    expect(decideOutcome('allow-always')).toEqual({ allowed: true, remember: 'allow' });
  });
  it('lehnt einmalig ab ohne zu merken', () => {
    expect(decideOutcome('deny-once')).toEqual({ allowed: false });
  });
  it('lehnt dauerhaft ab und merkt "deny"', () => {
    expect(decideOutcome('deny-always')).toEqual({ allowed: false, remember: 'deny' });
  });
});

describe('FS_OP_LABELS', () => {
  it('hat für jede Operation eine sprechende Bezeichnung', () => {
    for (const op of ['read', 'write', 'list', 'exists', 'stat', 'delete', 'mkdir'] as FsOp[]) {
      expect(typeof FS_OP_LABELS[op]).toBe('string');
      expect(FS_OP_LABELS[op].length).toBeGreaterThan(0);
    }
  });
});
