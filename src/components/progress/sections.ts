import type React from 'react';

import type { SectionKey } from '@/lib/progress-sections';

import { SessionLengthSection, TimeOfDaySection } from './buckets';
import { ChangedSection } from './changed';
import { ConsistencySection } from './consistency';
import { DriftSection } from './drift';
import { GoalsSection } from './goals';
import { HearSection } from './hear';
import { HeatmapSection } from './heatmap';
import { InsightsSection } from './insights';
import { Last7Section } from './last7';
import { MovementSection } from './movement';
import { PerformableSection } from './performable';
import { PipelineSection } from './pipeline';
import { RatingSection } from './rating';
import { TimeByFocusSection } from './time-by-focus';
import type { SectionProps } from './types';
import { VolumeSection } from './volume';

export const SECTIONS: Record<SectionKey, React.FC<SectionProps>> = {
  movement: MovementSection,
  goals: GoalsSection,
  heatmap: HeatmapSection,
  volume: VolumeSection,
  hear: HearSection,
  pipeline: PipelineSection,
  performable: PerformableSection,
  changed: ChangedSection,
  insights: InsightsSection,
  timeByFocus: TimeByFocusSection,
  drift: DriftSection,
  consistency: ConsistencySection,
  rating: RatingSection,
  timeOfDay: TimeOfDaySection,
  sessionLength: SessionLengthSection,
  last7: Last7Section,
};
