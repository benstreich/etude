// Shared edit-session bottom sheet — opened from Home recents, Progress day
// detail, and a piece's history. Edits focus / minutes / note, or deletes.
import React, { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dayLabel, Session, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export function EditSessionSheet({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  // ponytail: keyed remount resets drafts whenever a different session opens
  return (
    <Modal visible={session !== null} transparent animationType="fade" onRequestClose={onClose}>
      {session && <Editor key={session.id} session={session} onClose={onClose} store={store} s={s} C={C} />}
    </Modal>
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const repeat = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const winH = useWindowDimensions().height;
  const insets = useSafeAreaInsets();

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
    store.updateSession(session.id, { title: focus.title, meta: focus.meta, min, note });
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

  const stepBtn = (label: string, d: number) => (
    <Pressable style={s.stepBtn} onPress={() => step(d)} onLongPress={() => holdStart(d)} onPressOut={holdEnd}>
      <Text style={s.stepGlyph}>{label}</Text>
    </Pressable>
  );

  return (
    <Pressable style={s.backdrop} onPress={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        <Pressable style={[s.sheet, { height: winH - insets.top - 12 }]} onPress={() => {}}>
          <View style={s.grabber} />
          {/* flex-end keeps the form at the bottom, within thumb reach, when it doesn't fill the sheet */}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, flexGrow: 1, justifyContent: 'flex-end' }}>
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
                {stepBtn('−', -5)}
                <View style={s.stepValue}>
                  <Text style={s.stepValueText}>{min}</Text>
                </View>
                {stepBtn('+', +5)}
              </View>
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

            <Pressable style={({ pressed }) => [s.saveBtn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={save}>
              <Text style={s.saveText}>{store.t('editSession.saveChanges')}</Text>
            </Pressable>
            <Pressable style={s.deleteBtn} onPress={remove}>
              <Text style={s.deleteText}>{store.t('editSession.deleteSession')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingTop: 10, paddingBottom: 40 },
  grabber: { width: 36, height: 4.5, borderRadius: r(999), backgroundColor: C.chartInactive, alignSelf: 'center', marginBottom: 16 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: F.head, fontSize: fs(19), color: C.ink },
  stamp: { fontFamily: F.body, fontSize: fs(13), color: C.sub },
  label: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.sub, marginBottom: 8 },
  select: { height: 52, borderRadius: r(14), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { flex: 1, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  chev: { fontSize: fs(13), color: C.sub, marginLeft: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: r(999), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  stepper: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  stepBtn: { width: 52, height: 52, borderRadius: r(14), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: fs(24), color: C.ink, fontFamily: F.body },
  stepValue: { flex: 1, height: 52, borderRadius: r(14), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  stepValueText: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  noteInput: { minHeight: 72, borderRadius: r(14), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 14, fontFamily: F.body, fontSize: fs(15), lineHeight: fs(21), color: C.ink, textAlignVertical: 'top' },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
  deleteBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontFamily: F.bodySemi, fontSize: fs(14.5), color: C.accentDark },
}));
