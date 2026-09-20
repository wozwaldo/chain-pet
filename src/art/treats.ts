// Treat kind -> icon. Gift memos come from other users and may say anything
// (see GiftEvent.kind), so unknown kinds fall back to the gift box.
import type { TreatKind } from '../pet/types'
import { ICONS, type IconDef, type IconName } from './icons'

const TREAT_ICON: Record<TreatKind, IconName> = { apple: 'apple', cookie: 'cookie', fish: 'fish', star: 'star' }

/** Icon for a treat kind; own-property check so 'constructor' / 'toString' from a memo cannot leak prototype members. */
export function treatIconDef(kind: string): IconDef {
  return Object.hasOwn(TREAT_ICON, kind) ? ICONS[TREAT_ICON[kind as TreatKind]] : ICONS.gift
}
