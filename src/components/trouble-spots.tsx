// Trouble spots on the piece page (#91): named passages with their own minutes,
// last-practised date and trend. Spots live on the piece and sessions point at
// them by id, so a label edit or a piece rename never orphans a session.
import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';

import { Text } from '@/components/text';
import { ActionChip, ChipRow, Overline, SectionHead, Sheet } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { spotStats, type SpotStats } from '@/lib/spot-math';
import { dayLabel, type Piece, type Session, type TroubleSpot, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const TREND_KEY: Record<SpotStats['trend'], string> = { up: 'spots.trendUp', down: 'spots.trendDown', flat: 'spots.trendFlat' };

type Draft = { id: string | null; label: string; note: string };

export function TroubleSpots({ piece, sessions }: { piece: Piece; sessions: Session[] }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const [draft, setDraft] = useState<Draft | null>(null); // the add/edit sheet, null = closed
  const [menu, setMenu] = useState<TroubleSpot | null>(null); // the spot whose options are open
  const [solidOpen, setSolidOpen] = useState(false);

  const spots = piece.spots ?? [];
  const open = spots.filter((sp) => !sp.resolvedAt);
  const solid = spots.filter((sp) => !!sp.resolvedAt);

  const save = () => {
    if (!draft || !draft.label.trim()) return;
    if (draft.id) store.updateSpot(piece.id, draft.id, { label: draft.label, note: draft.note.trim() || undefined });
    else store.addSpot(piece.id, draft.label, draft.note);
    setDraft(null);
  };

  const confirmDelete = (sp: TroubleSpot) => {
    const doDelete = () => {
      store.removeSpot(piece.id, sp.id);
      setMenu(null);
    };
    // ponytail: Alert.alert is a no-op on web; window.confirm covers it
    if (Platform.OS === 'web') {
      if (window.confirm(`${store.t('spots.delete')} ${store.t('spots.deleteBody')}`)) doDelete();
      return;
    }
    Alert.alert(store.t('spots.delete'), store.t('spots.deleteBody'), [
      { text: store.t('editSession.cancel'), style: 'cancel' },
      { text: store.t('spots.delete'), style: 'destructive', onPress: doDelete },
    ]);
  };

  const statsLine = (sp: TroubleSpot) => {
    const st = spotStats(sessions, piece.name, sp.id, store.today);
    return [
      store.t('piece.min', { count: st.min }),
      st.last ? store.t('spots.last', { date: dayLabel(st.last, store.today, store.t, store.lang) }) : store.t('spots.lastNever'),
      store.t(TREND_KEY[st.trend]),
    ].join(' · ');
  };

  const row = (sp: TroubleSpot, dim: boolean) => (
    <View key={sp.id} testID={`spot-row-${sp.id}`} style={[s.row, dim && { opacity: 0.55 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.label} numberOfLines={1}>
          {dim ? '✓ ' : ''}
          {sp.label}
        </Text>
        <Text style={s.sub} numberOfLines={1}>
          {statsLine(sp)}
        </Text>
        {!!sp.note && (
          <Text style={s.note} numberOfLines={2}>
            {sp.note}
          </Text>
        )}
      </View>
      <Pressable
        hitSlop={10}
        style={s.more}
        accessibilityLabel={store.t('spots.options')}
        testID={`spot-menu-${sp.id}`}
        onPress={() => {
          tap();
          setMenu(sp);
        }}>
        <Text style={s.moreText}>⋯</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
      <Overline>{store.t('spots.title')}</Overline>
      <ChipRow>
        <ActionChip icon={() => null} label={store.t('spots.add')} testID="spot-add" onPress={() => setDraft({ id: null, label: '', note: '' })} />
      </ChipRow>
      {spots.length === 0 ? (
        <Text style={s.empty}>{store.t('spots.empty')}</Text>
      ) : (
        <View>
          {open.map((sp) => row(sp, false))}
          {solid.length > 0 && (
            <View style={{ marginTop: open.length ? 10 : 0 }}>
              <SectionHead label={store.t('spots.solidGroup', { n: solid.length })} open={solidOpen} onToggle={() => setSolidOpen((o) => !o)} />
              {solidOpen && solid.map((sp) => row(sp, true))}
            </View>
          )}
        </View>
      )}

      {/* add / edit */}
      <Sheet visible={draft !== null} onClose={() => setDraft(null)} style={s.sheet} contentStyle={{ gap: 14 }}>
        {draft && (
          <>
            <Text style={s.sheetTitle}>{store.t(draft.id ? 'spots.edit' : 'spots.add')}</Text>
            <TextInput
              testID="spot-label-input"
              style={s.input}
              value={draft.label}
              onChangeText={(label) => setDraft({ ...draft, label })}
              placeholder={store.t('spots.labelPlaceholder')}
              placeholderTextColor={C.tertiary}
              autoFocus
              returnKeyType="next"
              maxLength={60}
            />
            <TextInput
              style={s.input}
              value={draft.note}
              onChangeText={(note) => setDraft({ ...draft, note })}
              placeholder={store.t('spots.notePlaceholder')}
              placeholderTextColor={C.tertiary}
              returnKeyType="done"
              onSubmitEditing={save}
              maxLength={200}
            />
            <Pressable testID="spot-save" style={[s.saveBtn, !draft.label.trim() && { opacity: 0.4 }]} disabled={!draft.label.trim()} onPress={save}>
              <Text style={s.saveText}>{store.t('piece.save')}</Text>
            </Pressable>
          </>
        )}
      </Sheet>

      {/* options: solid / reopen, edit, delete */}
      <Sheet visible={menu !== null} onClose={() => setMenu(null)} style={s.sheet}>
        {menu && (
          <>
            <Text style={s.sheetTitle} numberOfLines={2}>
              {menu.label}
            </Text>
            <Pressable
              testID="spot-resolve"
              style={s.sheetRow}
              onPress={() => {
                tap();
                // a patch with `resolvedAt: undefined` drops the field — that is the reopen
                store.updateSpot(piece.id, menu.id, { resolvedAt: menu.resolvedAt ? undefined : store.today });
                setMenu(null);
              }}>
              <Text style={s.sheetRowText}>{store.t(menu.resolvedAt ? 'spots.reopen' : 'spots.resolve')}</Text>
            </Pressable>
            <Pressable
              style={s.sheetRow}
              onPress={() => {
                setMenu(null);
                setDraft({ id: menu.id, label: menu.label, note: menu.note ?? '' });
              }}>
              <Text style={s.sheetRowText}>{store.t('spots.edit')}</Text>
            </Pressable>
            <Pressable style={s.sheetRow} onPress={() => confirmDelete(menu)}>
              <Text style={[s.sheetRowText, { color: C.accent }]}>{store.t('spots.delete')}</Text>
            </Pressable>
          </>
        )}
      </Sheet>
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.hairline },
  label: { fontFamily: F.bodyMed, fontSize: fs(15.5), lineHeight: fs(20), color: C.ink },
  sub: { marginTop: 2, fontFamily: F.body, fontSize: fs(13), color: C.subStrong },
  note: { marginTop: 2, fontFamily: F.accent, fontSize: fs(13), color: C.sub },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: fs(18), color: C.sub, letterSpacing: 1 },
  empty: { fontFamily: F.body, fontSize: fs(14), lineHeight: fs(20), color: C.sub },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink, marginBottom: 4 },
  sheetRow: { height: 52, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: C.hairline },
  sheetRowText: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
  input: { height: 52, borderBottomWidth: 1, borderBottomColor: C.staffLine, paddingHorizontal: 0, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
}));
