// "Which instrument is this on?" (#58 follow-up).
//
// A piece or technique can belong to several instruments, and the session log keeps
// exactly one. Guessing the first of the set files half of those minutes against an
// instrument that was never picked up, which quietly skews every per-instrument total
// downstream. So when the answer is ambiguous — and only then, see instrumentChoices —
// the player is asked before the minutes are written.
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/press';
import { Text } from '@/components/text';
import { Sheet } from '@/components/ui';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export function InstrumentAsk({
  visible,
  name,
  choices,
  onPick,
  onClose,
  subline,
}: {
  visible: boolean;
  /** The piece or technique being practised, named so the question has a subject. */
  name: string;
  choices: string[];
  onPick: (instrument: string) => void;
  onClose: () => void;
  /** Overrides the wording — a routine asks about its segments, not about itself. */
  subline?: string;
}) {
  const s = useS();
  const C = useC();
  const store = useStore();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ gap: 6, paddingBottom: 4 }}>
        <Text style={s.title}>{store.t('instrumentAsk.title')}</Text>
        <Text style={s.subline}>{subline ?? store.t('instrumentAsk.subline', { name })}</Text>
      </View>
      <View style={{ gap: 8, paddingTop: 10 }}>
        {choices.map((i) => (
          <Pressable key={i} style={s.row} onPress={() => onPick(i)}>
            <Text style={s.rowText}>{i}</Text>
            <Text style={[s.chevron, { color: C.tertiary }]}>›</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const useS = themed(({ C, fs, r }: T) =>
  StyleSheet.create({
    title: { fontFamily: F.head, fontSize: fs(22), color: C.ink },
    subline: { fontFamily: F.body, fontSize: fs(13.5), lineHeight: fs(19), color: C.sub },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      paddingHorizontal: 16,
      borderRadius: r(14),
      borderWidth: 1,
      borderColor: C.cardBorder,
      backgroundColor: C.card,
    },
    rowText: { flex: 1, fontFamily: F.bodyMed, fontSize: fs(15.5), color: C.ink },
    chevron: { fontSize: fs(18) },
  })
);
