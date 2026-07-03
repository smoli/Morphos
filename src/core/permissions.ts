import type { FsOp, FsPermissions, PermDecision, PermMode } from '@/types';

/** Lesende Operationen sind standardmäßig still erlaubt, verändernde fragen nach. */
const READING: readonly FsOp[] = ['read', 'list', 'exists', 'stat'];

/** Vorgabe-Berechtigung für eine Operation, solange der Anwender nichts geändert hat. */
export function defaultPermission(op: FsOp): PermMode {
  return READING.includes(op) ? 'allow' : 'ask';
}

/** Effektive Berechtigung: gesetzter Wert oder Vorgabe. */
export function effectivePermission(perms: FsPermissions | undefined, op: FsOp): PermMode {
  return perms?.[op] ?? defaultPermission(op);
}

/** Wertet die Dialog-Entscheidung aus: erlaubt? und ggf. dauerhaft zu merkender Modus. */
export function decideOutcome(decision: PermDecision): { allowed: boolean; remember?: PermMode } {
  switch (decision) {
    case 'allow-once':
      return { allowed: true };
    case 'allow-always':
      return { allowed: true, remember: 'allow' };
    case 'deny-once':
      return { allowed: false };
    case 'deny-always':
      return { allowed: false, remember: 'deny' };
  }
}

/** Sprechende Bezeichnungen der Operationen für den Berechtigungsdialog. */
export const FS_OP_LABELS: Record<FsOp, string> = {
  read: 'Datei lesen',
  write: 'Datei schreiben',
  list: 'Ordner auflisten',
  exists: 'Existenz prüfen',
  stat: 'Datei-Info lesen',
  delete: 'löschen',
  mkdir: 'Ordner anlegen',
};
