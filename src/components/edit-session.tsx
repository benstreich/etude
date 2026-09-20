// Shared edit-session bottom sheet — opened from Home recents, Progress day
// detail, and a piece's history. Edits focus / minutes / note, or deletes.
import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';

import { Text } from '@/components/text';
import { Sheet, Stars } from '@/components/ui';
import { success } from '@/lib/haptics';
import { dayLabel, Session, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export function EditSessionSheet({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  // ponytail: keyed remount resets drafts whenever a different session opens
  return (
    <Sheet visible={session !== null} onClose={onClose} grabber style={s.sheet} contentStyle={{ gap: 16 }}>
      {session && <Editor key={session.id} session={session} onClose={onClose} store={store} s={s} C={C} />}
    </Sheet>
  );
}

function Editor({
  session,
  onClose,
  store,
  s,
  C,
}: {
  session: Session;
  onClose: () => void;
  store: ReturnType<typeof useStore>;
  s: ReturnType<typeof useS>;
  C: ReturnType<typeof useC>;
}) {
  const [focus, setFocus] = useState({ title: session.title, meta: session.meta });
  const [min, setMin] = useState(session.min);
  const [note, setNote] = useState(session.note ?? '');
  const [rating, setRating] = useState<number | undefined>(session.rating);
  const [pickerOpen, setPickerOpen] = useState(false);
  const repeat = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const options = [
    ...store.pieces.filter((p) => !p.archived).map((p) => ({ title: p.name, meta: 'Piece' })),
    ...store.techniques.map((t) => ({ title: t, meta: 'Technique' })),
  ];

  const step = (d: number) => setMin((m) => Math.max(1, m + d));
  const holdStart = (d: number) => {
    repeat.current = setInterval(() => step(d), 120);
  };
  const holdEnd = () => clearInterval(repeat.current);

  const save = () => {
    success();
    store.updateSession(session.id, { title: focus.title, meta: focus.meta, min, note, rating });
    store.showToast(store.t('toast.saved'));
    onClose();
  };

  const remove = () =>
    Alert.alert(store.t('editSession.deleteTitle'), store.t('editSession.deleteMessage'), [
      { text: store.t('editSession.cancel'), style: 'cancel' },
      {
        text: store.t('editSession.delete'),
        style: 'destructive',
        onPress: () => {
          store.deleteSession(session.id);
          onClose();
        },
      },
    ]);

  const stepBtn = (label: string, d: number, testID?: string) => (
    <Pressable testID={testID} style={s.stepBtn} onPress={() => step(d)} onLongPress={() => holdStart(d)} onPressOut={holdEnd}>
      <Text style={s.stepGlyph}>{label}</Text>
    </Pressable>
  );

  return (
    <>
            <View style={s.headRow}>
              <Text style={s.title}>{store.t('editSession.title')}</Text>
              <Text style={s.stamp}>{dayLabel(session.date, store.today, store.t, store.lang)}</Text>
            </View>

            <View>
              <Text style={s.label}>{store.t('editSession.focus')}</Text>
              <Pressable style={s.select} onPress={() => setPickerOpen((o) => !o)}>
                <Text style={s.selectText} numberOfLines={1}>
                  {focus.title}
                </Text>
                <Text style={s.chev}>{pickerOpen ? '▴' : '▾'}</Text>
              </Pressable>
              {pickerOpen && (
                <View style={s.chipWrap}>
                  {options.map((o) => {
                    const sel = o.title === focus.title;
                    return (
                      <Pressable
                        key={`${o.meta}:${o.title}`}
                        style={[s.chip, sel && s.chipSel]}
                        onPress={() => {
                          setFocus(o);
                          setPickerOpen(false);
                        }}>
                        <Text style={[s.chipText, sel && { color: C.accent }]}>{o.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View>
              <Text style={s.label}>{store.t('editSession.minutes')}</Text>
              <View style={s.stepper}>
                {stepBtn('−', -5, 'edit-session-minus')}
                <View style={s.stepValue}>
                  <Text style={s.stepValueText}>{min}</Text>
                </View>
                {stepBtn('+', +5, 'edit-session-plus')}
              </View>
            </View>

            <View>
              <Text style={s.label}>{store.t('editSession.rating')}</Text>
              <Stars value={rating} onChange={setRating} />
            </View>

            <View>
              <Text style={s.label}>{store.t('editSession.note')}</Text>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={store.t('editSession.notePlaceholder')}
                placeholderTextColor={C.tertiary}
                multiline
              />
            </View>

            <Pressable testID="edit-session-save" style={({ pressed }) => [s.saveBtn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={save}>
              <Text style={s.saveText}>{store.t('editSession.saveChanges')}</Text>
            </Pressable>
            <Pressable testID="edit-session-delete" style={s.deleteBtn} onPress={remove}>
              <Text style={s.deleteText}>{store.t('editSession.deleteSession')}</Text>
            </Pressable>
    </>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingTop: 10, paddingBottom: 40 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: F.head, fontSize: fs(19), color: C.ink },
  stamp: { fontFamily: F.body, fontSize: fs(13), color: C.sub },
  label: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.sub, marginBottom: 8 },
  // no boxed fields: values sit on a hairline, the way the rest of the app's text does
  select: { height: 44, borderBottomWidth: 1, borderBottomColor: C.staffLine, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { flex: 1, fontFamily: F.head, fontSize: fs(18), color: C.ink },
  chev: { fontSize: fs(13), color: C.sub, marginLeft: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: r(999), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.staffLine, height: 52 },
  stepBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: fs(26), color: C.accent, fontFamily: F.body },
  stepValue: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepValueText: { fontFamily: F.head, fontSize: fs(30), color: C.ink, fontVariant: ['tabular-nums'] },
  noteInput: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: C.staffLine, paddingHorizontal: 0, paddingVertical: 12, fontFamily: F.body, fontSize: fs(15), lineHeight: fs(21), color: C.ink, textAlignVertical: 'top' },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
  deleteBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontFamily: F.bodySemi, fontSize: fs(14.5), color: C.accentDark },
}));
