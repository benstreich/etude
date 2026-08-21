// Shareable recap cards (#17) — rendered on-screen at 340×425 (4:5) and
// captured at ~1080×1350 via react-native-view-shot, shared as a pure image.
// The monthly card keeps the brand cream/terracotta regardless of theme, like
// the LogoMark; hence the literal hex here and nowhere else.
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { LogoMark } from '@/components/icons';
import { recapStats, tempoDelta } from '@/lib/growth-math';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const CREAM = '#FAF7F2';
const DOT = '#E8A87C';
const W = 340;
const H = 425;

const fmtHero = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ''}`.trim() : `${min} min`);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function Fermata({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M6 26c0-9.5 6.3-17 14-17s14 7.5 14 17" fill="none" stroke={color} strokeWidth={3.4} strokeLinecap="round" />
      <Circle cx={20} cy={27} r={3.4} fill={DOT} />
    </Svg>
  );
}

// stat rows: max 4, empties omitted, zeros never shown as brags
type Row = [string, string | null];
const rows = (list: Row[]) =>
  list.filter((r): r is [string, string] => !!r[1] && r[1] !== '0' && r[1] !== '0 min').slice(0, 4);

export function RecapModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const shotRef = useRef<View>(null);

  if (!visible) return null;

  const nowD = new Date(store.now);
  const year = nowD.getFullYear();
  const month = nowD.getMonth();
  const stats = recapStats({
    sessions: store.sessions,
    minutesByDate: store.minutesByDate,
    breakDays: store.breakDays,
    year,
    month: mode === 'month' ? month : undefined,
  });

  const share = async () => {
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile', width: W * 3.18, height: H * 3.18 });
      if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(`file://${uri.replace(/^file:\/\//, '')}`);
      else store.showToast('Sharing isn’t available here');
    } catch {
      store.showToast('Couldn’t create the image');
    }
  };

  // monthly extras
  const tempoGained = store.pieces.reduce((a, p) => {
    const d = tempoDelta(p.tempoLog ?? [], store.today);
    return a + Math.max(0, d);
  }, 0);
  const monthRows = rows([
    ['Days practiced', stats.daysPracticed ? String(stats.daysPracticed) : null],
    ['Longest streak', stats.longestStreak > 1 ? `${stats.longestStreak} days` : null],
    ['Top piece', stats.topPiece],
    ['Tempo gained', tempoGained > 0 ? `+${tempoGained} BPM` : null],
  ]);

  // year extras
  const finished = store.pieces.filter((p) => !p.archived && p.stage >= store.stages.length - 1).length;
  const bestMonth = stats.monthlyMinutes.some((m) => m > 0)
    ? MONTHS[stats.monthlyMinutes.indexOf(Math.max(...stats.monthlyMinutes))]
    : null;
  const yearRows = rows([
    ['Pieces finished', finished ? String(finished) : null],
    ['Best month', bestMonth],
    ['Longest streak', stats.longestStreak > 1 ? `${stats.longestStreak} days` : null],
  ]);

  const barMax = Math.max(...stats.monthlyMinutes, 1);
  const barColor = (v: number) => (v > barMax * 0.66 ? C.accent : v > barMax * 0.33 ? '#DE8A66' : '#F2CDBB');
  const instrument = store.instruments[0];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ alignItems: 'center', gap: 16 }} showsVerticalScrollIndicator={false}>
            <View style={s.segTrack}>
              {(
                [
                  ['month', 'This month'],
                  ['year', 'Year so far'],
                ] as const
              ).map(([key, label]) => (
                <Pressable key={key} style={[s.segBtn, mode === key && s.segBtnSel]} onPress={() => setMode(key)}>
                  <Text style={[s.segText, mode === key && { color: C.ink }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <View ref={shotRef} collapsable={false}>
              {mode === 'month' ? (
                <View style={[s.card, { backgroundColor: C.accent }]}>
                  <View style={s.brandRow}>
                    <Fermata color={CREAM} />
                    <Text style={[s.wordmark, { color: CREAM }]}>Étude</Text>
                  </View>
                  <Text style={s.monthOverline}>
                    {MONTHS[month].toUpperCase()} {year}
                  </Text>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={[s.hero, { color: CREAM }]} numberOfLines={1} adjustsFontSizeToFit>
                      {fmtHero(stats.totalMin)}
                    </Text>
                    <Text style={[s.heroSub, { color: DOT }]}>of practice this month</Text>
                  </View>
                  <View>
                    {monthRows.map(([label, value]) => (
                      <View key={label} style={s.statRowCream}>
                        <Text style={s.statLabelCream}>{label}</Text>
                        <Text style={s.statValueCream} numberOfLines={1}>
                          {value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={[s.card, { backgroundColor: C.bg, borderWidth: 1, borderColor: C.cardBorder }]}>
                  <View style={s.brandRow}>
                    <LogoMark size={24} />
                    <Text style={[s.wordmark, { color: C.ink }]}>Étude</Text>
                  </View>
                  <Text style={s.yearOverline}>{year} SO FAR</Text>
                  <View style={s.barsRow}>
                    {stats.monthlyMinutes.slice(0, month + 1).map((v, i) => (
                      <View key={i} style={{ flex: 1, height: 54, justifyContent: 'flex-end' }}>
                        <View
                          style={{
                            height: Math.max(4, (v / barMax) * 54),
                            borderRadius: 3,
                            backgroundColor: v > 0 ? barColor(v) : C.track,
                          }}
                        />
                      </View>
                    ))}
                  </View>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={[s.hero, { color: C.ink, fontSize: 66 }]} numberOfLines={1} adjustsFontSizeToFit>
                      {stats.totalMin >= 60 ? `${Math.floor(stats.totalMin / 60)} hours` : `${stats.totalMin} min`}
                    </Text>
                    <Text style={[s.heroSub, { color: C.accent }]}>
                      {instrument ? `at the ${instrument.toLowerCase()} since January` : 'of practice since January'}
                    </Text>
                  </View>
                  <View>
                    {yearRows.map(([label, value]) => (
                      <View key={label} style={[s.statRowCream, { borderTopColor: C.hairline }]}>
                        <Text style={[s.statLabelCream, { color: C.sub }]}>{label}</Text>
                        <Text style={[s.statValueCream, { color: C.ink }]} numberOfLines={1}>
                          {value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch' }}>
              <Pressable style={s.closeBtn} onPress={onClose}>
                <Text style={s.closeText}>Close</Text>
              </Pressable>
              <Pressable style={s.shareBtn} onPress={share}>
                <Text style={s.shareText}>Share</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: C.card, borderRadius: r(22), padding: 20, maxHeight: '92%' },
  segTrack: { flexDirection: 'row', backgroundColor: C.track, borderRadius: r(999), padding: 2.5, alignSelf: 'center' },
  segBtn: { height: 30, paddingHorizontal: 16, borderRadius: r(999), alignItems: 'center', justifyContent: 'center' },
  segBtnSel: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: F.bodySemi, fontSize: fs(12.5), color: C.sub },
  // the card renders at fixed 340×425 — no fs()/r() so the capture is deterministic
  card: { width: W, height: H, borderRadius: 20, padding: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontFamily: F.head, fontSize: 16, letterSpacing: -0.16 },
  monthOverline: { fontFamily: F.bodySemi, fontSize: 11, letterSpacing: 1.4, color: 'rgba(250,247,242,0.65)', marginTop: 16 },
  yearOverline: { fontFamily: F.bodySemi, fontSize: 11, letterSpacing: 1.4, color: C.tertiary, marginTop: 16 },
  hero: { fontFamily: F.head, fontSize: 76, letterSpacing: -2 },
  heroSub: { fontFamily: F.bodyMed, fontSize: 15, marginTop: 2 },
  barsRow: { flexDirection: 'row', gap: 5, marginTop: 18 },
  statRowCream: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(250,247,242,0.25)' },
  statLabelCream: { fontFamily: F.body, fontSize: 13, color: 'rgba(250,247,242,0.7)' },
  statValueCream: { fontFamily: F.bodySemi, fontSize: 13.5, color: CREAM, maxWidth: 180 },
  closeBtn: { flex: 1, height: 48, borderRadius: r(14), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink },
  shareBtn: { flex: 1.4, height: 48, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  shareText: { fontFamily: F.bodySemi, fontSize: fs(15), color: '#FFFFFF' },
}));
