import {
  Baby,
  Ban,
  Bed,
  Briefcase,
  CalendarOff,
  CircleHelp,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Plane,
  Stethoscope,
  Sun,
  TreePalm,
  Umbrella,
  type LucideIcon,
} from 'lucide-react';

import type { CommonKey } from '@/i18n/keys';

/**
 * The icon vocabulary — **chosen here, on purpose**.
 *
 * The backend stores `icon` as a free string of up to fifty characters and
 * documents why: icon sets disagree on spelling (`umbrella-beach`,
 * `umbrellaBeach`, `ph:umbrella-beach`), so a pattern narrow enough to be worth
 * validating would reject whichever set the frontend actually ships. The API
 * takes the name it is given; **the vocabulary is this application's to
 * choose**, and this file is that choice.
 *
 * It is a closed list rather than a free text field because the value is drawn
 * on a screen. A typed name is a broken glyph on every row of a list, on a
 * calendar and in a report legend, discovered by whoever opens the screen next
 * — while a picker of fifteen options costs nothing and cannot produce one.
 *
 * The names are lucide's own kebab-case ids, so what is stored is meaningful
 * outside this map and a later consumer can resolve it without a lookup table
 * of ours.
 */

export interface LeaveTypeIconOption {
  /** The stored value, and lucide's own id for the glyph. */
  name: string;
  icon: LucideIcon;
  /** Key of the label shown in the picker. */
  labelKey: CommonKey;
}

export const LEAVE_TYPE_ICON_OPTIONS: readonly LeaveTypeIconOption[] = [
  { name: 'umbrella', icon: Umbrella, labelKey: 'leaveTypes.icons.umbrella' },
  { name: 'tree-palm', icon: TreePalm, labelKey: 'leaveTypes.icons.treePalm' },
  { name: 'sun', icon: Sun, labelKey: 'leaveTypes.icons.sun' },
  { name: 'plane', icon: Plane, labelKey: 'leaveTypes.icons.plane' },
  { name: 'stethoscope', icon: Stethoscope, labelKey: 'leaveTypes.icons.stethoscope' },
  { name: 'heart-pulse', icon: HeartPulse, labelKey: 'leaveTypes.icons.heartPulse' },
  { name: 'bed', icon: Bed, labelKey: 'leaveTypes.icons.bed' },
  { name: 'baby', icon: Baby, labelKey: 'leaveTypes.icons.baby' },
  { name: 'graduation-cap', icon: GraduationCap, labelKey: 'leaveTypes.icons.graduationCap' },
  { name: 'briefcase', icon: Briefcase, labelKey: 'leaveTypes.icons.briefcase' },
  { name: 'house', icon: House, labelKey: 'leaveTypes.icons.house' },
  { name: 'landmark', icon: Landmark, labelKey: 'leaveTypes.icons.landmark' },
  { name: 'calendar-off', icon: CalendarOff, labelKey: 'leaveTypes.icons.calendarOff' },
  { name: 'ban', icon: Ban, labelKey: 'leaveTypes.icons.ban' },
];

/** What a new leave type starts with, so the required field is never empty. */
export const DEFAULT_LEAVE_TYPE_ICON = 'umbrella';

const ICONS_BY_NAME = new Map(LEAVE_TYPE_ICON_OPTIONS.map((option) => [option.name, option.icon]));

/**
 * The glyph for a stored name, or a neutral placeholder.
 *
 * The fallback is not defensive padding: the column holds whatever was stored,
 * including a name seeded before this list existed or left behind by a set this
 * application no longer ships. A question mark says "this icon is unknown"
 * where a crash or an empty cell would say nothing.
 */
export const leaveTypeIcon = (name: string): LucideIcon => ICONS_BY_NAME.get(name) ?? CircleHelp;