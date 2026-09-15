import type React from 'react';

import type { SectionKey } from '@/lib/progress-sections';

import { SessionLengthSection, TimeOfDaySection } from './buckets';
import { ConsistencySection } from './consistency';
import { DriftSection } from './drift';
import { GoalsSection } from './goals';
import { HeatmapSection } from './heatmap';
import { InsightsSection } from './insights';
import { Last7Section } from './last7';
import { RatingSection } from './rating';
import { TimeByFocusSection } from './time-by-focus';
import type { SectionProps } from './types';
import { VolumeSection } from './volume';

// The five piece-first sections (movement, hear, pipeline, performable, changed)
// land in Task 5 of the 2026-09-15 plan; ProgressBody skips a key with no component.
export const SECTIONS: Partial<Record<SectionKey, React.FC<SectionProps>>> = {
  goals: GoalsSection,
  heatmap: HeatmapSection,
  volume: VolumeSection,
  insights: InsightsSection,
  timeByFocus: TimeByFocusSection,
  drift: DriftSection,
  consistency: ConsistencySection,
  rating: RatingSection,
  timeOfDay: TimeOfDaySection,
  sessionLength: SessionLengthSection,
  last7: Last7Section,
};
