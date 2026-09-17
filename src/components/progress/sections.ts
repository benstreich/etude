import type React from 'react';

import type { SectionKey } from '@/lib/progress-sections';

import { SessionLengthSection, TimeOfDaySection } from './buckets';
import { CalendarSection } from './calendar';
import { BarChartSection, LineChartSection } from './chart';
import { ChangedSection } from './changed';
import { ConsistencySection } from './consistency';
import { DriftSection } from './drift';
import { GoalsSection } from './goals';
import { HearSection } from './hear';
import { InsightsSection } from './insights';
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
  calendar: CalendarSection,
  lineChart: LineChartSection,
  barChart: BarChartSection,
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
};
