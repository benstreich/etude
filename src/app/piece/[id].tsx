// Piece detail — stage, stats, target tempo, recordings, and session history.
// ponytail: sessions/recordings join on the piece *name*, like everywhere else
// in the app (pieces can't be renamed); move to id-joins if rename ever lands.
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Calendar } from '@/components/calendar';
import { EditSessionSheet } from '@/components/edit-session';
import { ReportModal } from '@/components/report-modal';
import { MetronomeIcon } from '@/components/icons';
import { LiveWaveform, MeasureBar, NoteTempo, WaveformIcon } from '@/components/motifs';
import { RecordingsList } from '@/components/recordings';
import { pieceInstruments, toggleInstrument } from '@/lib/instrument-math';
import { recordingPair } from '@/lib/movement-math';
import { ScoreCard } from '@/components/score';
import { TempoLadder } from '@/components/tempo-ladder';
import { Text } from '@/components/text';
import { TroubleSpots } from '@/components/trouble-spots';
import { ActionChip, BackLink, Card, ChipRow, Overline, RuledStats, Sheet, stageColor, Stars } from '@/components/ui';
import { deadlineStatus } from '@/lib/goal-math';
import { tap } from '@/lib/haptics';
import { pickRecordings } from '@/lib/import-recording';
import { useTakeRecorder } from '@/lib/use-take-recorder';
import { pieceRatings, ratingForecast, rollingAvg } from '@/lib/rating-math';
import { MAX_BPM } from '@/lib/metronome-math';
import { minPerBpm, tempoForecast } from '@/lib/stats-math';
import { dayLabel, Session, useStore } from '@/lib/store';
import { tempoTerm } from '@/lib/tempo';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

const fmtTime = (min: number, t: (key: string, opts?: Record<string, unknown>) => string) =>
  min >= 60 ? t('piece.hoursMin', { h: Math.floor(min / 60), m: min % 60 }) : t('piece.min', { count: min });
/** One rung of the stage ladder: fades between track and stage colour, staggered so a jump reads as a climb. */
function Seg({ filled, delay, color, track, style }: { filled: boolean; delay: number; color: string; track: string; style: object }) {
  const { reduceMotion } = useTheme();
  const v = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    v.value = reduceMotion ? (filled ? 1 : 0) : withDelay(delay, withTiming(filled ? 1 : 0, { duration: 260 }));
  }, [filled, delay, reduceMotion, v]);
  const anim = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(v.value, [0, 1], [track, color]) }));
  return <Animated.View style={[style, anim]} />;
}

export default function PieceDetail() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false); // this piece's practice report (#99)
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [tempoOpen, setTempoOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [target, setTarget] = useState('');
  const [targetStars, setTargetStars] = useState<number | undefined>();
  const [editSess, setEditSess] = useState<Session | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  const piece = store.allPieces.find((p) => p.id === id); // techniques live here too (#83)
  // recording without a session running: the same recorder the practice screen
  // uses, filed under this piece — "let me just capture this passage". Above the
  // early return below, or the hook order changes when the piece goes away.
  const take = useTakeRecorder(() => piece?.name ?? null);

  if (!piece) return null; // removed while open — the back nav below already left

  const sessions = store.sessions.filter((x) => x.title === piece.name);
  const recordings = store.recordings.filter((r) => r.piece === piece.name);
  // starring a take is what steers this: recordingPair prefers starred takes,
  // so "compare" opens on the two the player marked rather than the two newest
  const pair = recordingPair(recordings);
  const comparePair = pair ? { a: pair[0].id, b: pair[1].id } : { a: recordings[0]?.id, b: recordings[1]?.id };
  const totalMin = sessions.reduce((a, x) => a + x.min, 0);
  const last = sessions[0]?.date; // sessions are kept sorted newest-first
  const forecast = tempoForecast(piece.tempoLog ?? [], piece.targetBpm, store.today, sessions);
  const n = store.stages.length;
  const stage = Math.min(piece.stage, n - 1);
  const added = piece.addedAt
    ? new Date(piece.addedAt).toLocaleDateString(store.lang, { month: 'long', day: 'numeric' })
    : null;

  // "mastered by" deadline (#56): days left plus whether the stage kept pace
  const ratings = pieceRatings(piece, sessions);
  const ratingAvg = rollingAvg(ratings);
  const deadline = piece.targetDate
    ? deadlineStatus({
        targetDate: piece.targetDate,
        todayKey: store.today,
        addedAt: piece.addedAt,
        stage,
        stages: n,
        targetBpm: piece.targetBpm,
        tempoReachDate: piece.targetBpm ? (forecast?.reachDate ?? null) : undefined,
        targetRating: piece.targetRating,
        ratingAvg,
        ratingReachDate: piece.targetRating ? (ratingForecast(ratings, piece.targetRating, store.today)?.reachDate ?? null) : undefined,
      })
    : null;
  const laggingNote = deadline && deadline.lagging.length
    ? store.t('piece.lagging', { list: deadline.lagging.map((k) => store.t(`piece.${k}Word`)).join(' · ') })
    : null;
  const deadlineNote = deadline
    ? deadline.done
      ? store.t('piece.deadlineDone')
      : deadline.overdue
        ? store.t('piece.deadlineOverdue', { count: -deadline.days })
        : store.t(deadline.days === 0 ? 'piece.deadlineToday' : 'piece.deadlineIn', { count: deadline.days })
    : null;

  const openTempo = () => {
    setCur(piece.currentBpm ? String(piece.currentBpm) : '');
    setTarget(piece.targetBpm ? String(piece.targetBpm) : '');
    setTargetStars(piece.targetRating);
    setTempoOpen(true);
  };
  // takes recorded outside the app: pick, copy in, list them like any other recording
  const importTakes = async () => {
    try {
      for (const t of await pickRecordings()) store.addRecording(piece.name, t.uri, t.sec, undefined, t.name);
    } catch {
      store.showToast(store.t('piece.importFailed'));
    }
  };
  const saveTempo = () => {
    const parse = (t: string) => {
      const v = Math.round(Number(t));
      return Number.isFinite(v) && v > 0 && v <= MAX_BPM ? v : undefined;
    };
    store.updatePiece(piece.id, { currentBpm: parse(cur), targetBpm: parse(target), targetRating: targetStars });
    setTempoOpen(false);
  };

  // recording rename fields can sit anywhere down the page; this keeps the focused one above the keyboard
  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: C.bg }} keyboardShouldPersistTaps="handled" bottomOffset={16} contentContainerStyle={[s.page, { paddingTop: insets.top + 16 }]}>
      <View style={s.navRow}>
        <BackLink label={store.t('tabs.repertoire')} onPress={() => router.back()} />
        <Pressable testID="piece-menu" hitSlop={8} onPress={() => setMenuOpen(true)}>
          <Text style={s.navGlyph}>⋯</Text>
        </Pressable>
      </View>

      <View>
        {/* cover above the title, not beside it — a long title wraps and the pair fought for width */}
        {!!piece.artwork && <Image source={{ uri: piece.artwork }} style={{ width: 96, height: 96, borderRadius: 14, marginTop: 28, backgroundColor: C.track }} contentFit="cover" transition={150} />}
        <Text style={[s.title, !!piece.artwork && { marginTop: 16 }]}>{piece.name}</Text>
        <Text style={s.meta}>
          {[piece.kind === 'Technique' ? store.t('addFocus.technique') : piece.by, added && store.t('piece.added', { date: added })].filter(Boolean).join(' · ') || ' '}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <View style={s.rowBetween}>
          <Overline>{store.t('piece.stage')}</Overline>
          <Text style={[s.stageName, { color: stageColor(C, stage, n) }]}>{store.stages[stage] ?? store.t('piece.noStage')}</Text>
        </View>
        {/* a technique need not sit on the ladder at all: tapping its current stage again clears it */}
        <View style={[s.segRow, { marginTop: 14 }]}>
          {store.stages.map((_, i) => (
            <Pressable
              key={i}
              testID={`piece-stage-${i}`}
              style={{ flex: 1 }}
              hitSlop={{ top: 10, bottom: 10 }}
              onPress={() => {
                tap();
                store.updatePiece(piece.id, { stage: piece.kind === 'Technique' && i === stage ? -1 : i });
              }}>
              <Seg filled={i <= stage} delay={i <= stage ? i * 70 : 0} color={stageColor(C, stage, n)} track={C.staffLine} style={s.seg} />
            </Pressable>
          ))}
        </View>
        <View style={[s.segRow, { marginTop: 8 }]}>
          {store.stages.map((label, i) => (
            <Text key={i} style={[s.stageLabel, i === stage && { color: C.accent, fontFamily: F.bodySemi }]} numberOfLines={1}>
              {label}
            </Text>
          ))}
        </View>
        {/* stage -1 means "none" and every consumer already reads it as not-finished */}
        {piece.kind === 'Technique' && (
          <Pressable hitSlop={8} style={[s.noStageBtn, stage < 0 && { backgroundColor: C.accentTint }]} onPress={() => store.updatePiece(piece.id, { stage: stage < 0 ? 0 : -1 })}>
            <Text style={[s.noStageText, stage < 0 && { color: C.accent }]}>{stage < 0 ? store.t('piece.noStageOn') : store.t('piece.noStage')}</Text>
          </Pressable>
        )}
      </View>

      {/* Which instruments this is played on. One piece, several instruments —
          each session records the one you actually picked on Practice. */}
      {store.instruments.length > 1 && (
        <View style={{ marginTop: 20, gap: 10 }}>
          <Overline>{store.t('piece.instruments')}</Overline>
          <View style={s.instRow}>
            {store.instruments.map((i) => {
              const on = pieceInstruments(piece).includes(i);
              return (
                <Pressable
                  key={i}
                  style={[s.instChip, on && { borderColor: C.accent, backgroundColor: C.accentTint }]}
                  onPress={() => {
                    tap();
                    store.updatePiece(piece.id, toggleInstrument(piece, i));
                  }}>
                  <Text style={[s.instChipText, on && { color: C.accent }]}>{i}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.instHint}>
            {pieceInstruments(piece).length === 0 ? store.t('piece.instrumentsAll') : store.t('piece.instrumentsHint')}
          </Text>
        </View>
      )}

      <RuledStats
        items={[
          { label: store.t('piece.total'), value: fmtTime(totalMin, store.t) },
          { label: store.t('piece.sessionsStat'), value: String(sessions.length) },
          { label: store.t('piece.last'), value: last ? dayLabel(last, store.today, store.t, store.lang) : '—' },
        ]}
      />

      {piece.currentBpm || piece.targetBpm ? (
        <View>
          <View style={s.rowBetween}>
            <Overline>{store.t('piece.targetTempo')}</Overline>
            {minPerBpm(piece.tempoLog ?? [], sessions) !== null && (
              <Text style={s.tempoTarget}>{store.t('piece.minPerBpm', { n: minPerBpm(piece.tempoLog ?? [], sessions) })}</Text>
            )}
          </View>
          <Pressable style={{ marginTop: 12, flexDirection: 'row', alignItems: 'baseline', gap: 8 }} onPress={openTempo}>
            {piece.currentBpm ? <NoteTempo bpm={piece.currentBpm} size={22} /> : <Text style={s.tempoValue}>—</Text>}
            {!!piece.targetBpm && (
              <>
                <Text style={s.tempoArrow}>→</Text>
                <Text style={s.tempoTargetNum}>{piece.targetBpm}</Text>
                <Text style={s.tempoTerm}>{tempoTerm(piece.targetBpm)}</Text>
              </>
            )}
          </Pressable>
          {!!piece.currentBpm && !!piece.targetBpm && (
            <View style={{ marginTop: 14 }}>
              <MeasureBar segments={[1, 1, 1, 1]} done={Math.max(0, Math.min(1, (piece.currentBpm - 30) / (piece.targetBpm - 30)))} />
            </View>
          )}
          {/* #61 §1: straight-line forecast to the target, and a plateau nudge */}
          {forecast?.reachDate && (
            <Text style={[s.tempoTarget, { marginTop: 8, color: C.success, fontFamily: F.body }]}>
              {store.t('piece.forecast', { target: piece.targetBpm, date: new Date(forecast.reachDate + 'T12:00:00').toLocaleDateString(store.lang, { month: 'long', day: 'numeric' }) })}
            </Text>
          )}
          {forecast?.plateau && <Text style={[s.tempoTarget, { marginTop: 8, color: C.accent }]}>{store.t('piece.plateau')}</Text>}
        </View>
      ) : (
        <Pressable testID="piece-add-target-tempo" style={s.ghostRow} onPress={openTempo}>
          <MetronomeIcon color={C.sub} />
          <Text style={s.ghostRowText}>{store.t('piece.addTargetTempo')}</Text>
        </Pressable>
      )}

      {piece.targetDate && deadline ? (
        <Pressable style={s.masterByRow} onPress={() => setDateOpen(true)}>
          <View>
            <Overline>{store.t('piece.masterBy')}</Overline>
            <Text style={s.masterByDate}>
              {new Date(piece.targetDate + 'T12:00:00').toLocaleDateString(store.lang, { month: 'long', day: 'numeric' })}
              <Text style={s.tempoTarget}> · {deadlineNote}</Text>
            </Text>
          </View>
          <Text style={[s.stageName, { color: deadline.done ? C.success : deadline.onTrack ? C.success : C.accent }]}>
            {deadline.done ? store.t('piece.mastered') : deadline.onTrack ? store.t('piece.onTrack') : store.t('piece.behind')}
          </Text>
        </Pressable>
      ) : (
        <Pressable style={s.ghostRow} onPress={() => setDateOpen(true)}>
          <Text style={s.ghostRowText}>{store.t('piece.addTargetDate')}</Text>
        </Pressable>
      )}
      {piece.targetDate && !!laggingNote && <Text style={[s.tempoTarget, { color: C.accent }]}>{laggingNote}</Text>}

      {/* the passages that need separate work, with their own minutes (#91) */}
      <TroubleSpots piece={piece} sessions={sessions} />

      <TempoLadder piece={piece} />

      <ScoreCard piece={piece.name} />

      {/* the header always shows so a take recorded elsewhere can be imported before the first in-app one */}
      <View style={{ gap: 12 }}>
        {/* Three actions never fit beside the heading on a phone: the row overflowed
            its parent, which on Android also swallows the taps that land outside it.
            Heading on its own line, actions wrapping underneath. */}
        <Overline>{recordings.length ? store.t('piece.recordingsCount', { count: recordings.length }) : store.t('piece.recordings')}</Overline>
        <ChipRow>
          <ActionChip
            icon={(color) => <WaveformIcon color={color} />}
            label={take.recording ? store.t('piece.stopTake') : store.t('piece.recordTake')}
            active={take.recording}
            haptic="thud"
            testID="piece-record"
            onPress={take.toggle}
          />
          {!take.recording && <ActionChip icon={() => null} label={store.t('piece.importTake')} onPress={importTakes} />}
          {recordings.length >= 2 && !take.recording && (
            <ActionChip
              icon={() => null}
              label={store.t('piece.compare')}
              onPress={() =>
                router.push({
                  pathname: '/compare',
                  // the same before/after Progress uses: starred takes win, else oldest vs newest
                  params: { piece: piece.name, ...comparePair },
                })
              }
            />
          )}
        </ChipRow>
        {take.recording && (
          <View style={{ marginTop: 4, marginBottom: 10, gap: 8 }}>
            <LiveWaveform active={!take.paused} getLevel={take.micLevel} onSample={take.onSample} />
            {/* pause and discard, the same pair Practice offers — without discard the
                only way out of a take started by mistake was to save it and delete it */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <Pressable hitSlop={8} onPress={take.pauseResume}>
                <Text style={s.compareLink}>{take.paused ? store.t('practice.resumeTake') : store.t('practice.pauseTake')}</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={take.discard}>
                <Text style={[s.compareLink, { color: C.sub }]}>{store.t('practice.discardTake')}</Text>
              </Pressable>
            </View>
          </View>
        )}
        {recordings.length > 0 ? (
          <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
            <RecordingsList recordings={recordings} />
          </Card>
        ) : (
          <Text style={s.emptyHint}>{store.t('piece.noTakesHint')}</Text>
        )}
      </View>

      {sessions.length > 0 && (
        <View>
          <Overline>{store.t('piece.history')}</Overline>
          <View style={{ marginTop: 6 }}>
            {sessions.map((sess) => (
              <Pressable key={sess.id} style={s.histRow} onPress={() => setEditSess(sess)}>
                <Text style={s.histDay}>{dayLabel(sess.date, store.today, store.t, store.lang)}</Text>
                {/* the spot the minutes went to, if any (#91); an id whose spot was deleted shows nothing */}
                <Text style={s.histNote} numberOfLines={1}>
                  {[sess.note, sess.spot ? piece.spots?.find((sp) => sp.id === sess.spot)?.label : undefined].filter(Boolean).join(' · ')}
                </Text>
                {!!sess.rating && <Text style={s.histRating}>★ {sess.rating}</Text>}
                <Text style={s.histMin}>{store.t('piece.min', { count: sess.min })}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <EditSessionSheet session={editSess} onClose={() => setEditSess(null)} />
      <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} piece={piece.name} />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>{piece.name}</Text>
            <Pressable
              style={s.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                setNewName(piece.name);
                setRenameOpen(true);
              }}>
              <Text style={s.sheetRowText}>{store.t('piece.rename')}</Text>
            </Pressable>
            <Pressable
              testID="share-piece-report"
              style={s.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}>
              <Text style={s.sheetRowText}>{store.t('report.sharePieceReport')}</Text>
            </Pressable>
            <Pressable
              style={s.sheetRow}
              onPress={() => {
                store.setArchived(piece.id, !piece.archived);
                setMenuOpen(false);
                router.back();
              }}>
              <Text style={s.sheetRowText}>{piece.archived ? store.t('piece.restore') : store.t('piece.archive')}</Text>
            </Pressable>
            <Pressable
              style={s.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                router.back();
                store.removePiece(piece.id);
              }}>
              <Text style={[s.sheetRowText, { color: C.accent }]}>{store.t('piece.remove')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Sheet visible={renameOpen} onClose={() => setRenameOpen(false)} style={s.sheet} contentStyle={{ gap: 14 }}>
        <Text style={s.sheetTitle}>{store.t('piece.rename')}</Text>
        <TextInput
          style={s.input}
          value={newName}
          onChangeText={setNewName}
          placeholder={piece.name}
          placeholderTextColor={C.tertiary}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => store.renamePiece(piece.id, newName) && setRenameOpen(false)}
        />
        <Pressable style={[s.saveBtn, !newName.trim() && { opacity: 0.4 }]} disabled={!newName.trim()} onPress={() => store.renamePiece(piece.id, newName) && setRenameOpen(false)}>
          <Text style={s.saveText}>{store.t('piece.save')}</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={tempoOpen} onClose={() => setTempoOpen(false)} style={s.sheet} contentStyle={{ gap: 14 }}>
              <Text style={s.sheetTitle}>{store.t('piece.targetTempo')}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(
                  [
                    [store.t('piece.currentBpm'), cur, setCur, 'tempo-current-input'],
                    [store.t('piece.targetBpm'), target, setTarget, 'tempo-target-input'],
                  ] as const
                ).map(([ph, val, set, id]) => (
                  <TextInput
                    key={ph}
                    testID={id}
                    style={s.input}
                    value={val}
                    onChangeText={(t) => set(t.replace(/\D/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder={ph}
                    placeholderTextColor={C.tertiary}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={s.tempoTarget}>{store.t('piece.targetRating')}</Text>
                <Stars value={targetStars} onChange={setTargetStars} size={22} />
              </View>
              <Pressable testID="tempo-target-save" style={s.saveBtn} onPress={saveTempo}>
                <Text style={s.saveText}>{store.t('piece.save')}</Text>
              </Pressable>
      </Sheet>
      <Modal visible={dateOpen} transparent animationType="fade" onRequestClose={() => setDateOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setDateOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>{store.t('piece.masterBy')}</Text>
            <Calendar
              value={piece.targetDate ?? null}
              direction="future"
              onPick={(k) => {
                store.updatePiece(piece.id, { targetDate: k });
                setDateOpen(false);
              }}
            />
            {!!piece.targetDate && (
              <Pressable
                style={s.sheetRow}
                onPress={() => {
                  store.updatePiece(piece.id, { targetDate: undefined });
                  setDateOpen(false);
                }}>
                <Text style={[s.sheetRowText, { color: C.accent, textAlign: 'center' }]}>{store.t('piece.clearTargetDate')}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAwareScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 36 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  navGlyph: { fontSize: fs(20), color: C.sub, letterSpacing: 2 },
  title: { marginTop: 28, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
  meta: { fontFamily: F.body, fontSize: fs(17), color: C.subStrong, marginTop: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardLabel: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  stageName: { fontFamily: F.body, fontSize: fs(16) },
  segRow: { flexDirection: 'row', gap: 5 },
  seg: { height: 3, borderRadius: 2 },
  stageLabel: { flex: 1, fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary },
  noStageBtn: { alignSelf: 'flex-start', marginTop: 14, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.track, justifyContent: 'center' },
  noStageText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  tempoValue: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink, marginTop: 2 },
  tempoArrow: { fontSize: fs(18), color: C.barline },
  tempoTargetNum: { fontFamily: F.bodyMed, fontSize: fs(22), color: C.subStrong, fontVariant: ['tabular-nums'] },
  tempoTarget: { fontFamily: F.body, fontSize: fs(13), color: C.subStrong },
  tempoTerm: { fontFamily: F.body, fontSize: fs(18), color: C.subStrong },
  ghostRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.staffLine },
  ghostRowText: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.sub },
  masterByRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.staffLine },
  masterByDate: { marginTop: 6, fontFamily: F.bodyMed, fontSize: fs(17), color: C.ink },
  compareLink: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  instRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  instChip: { paddingHorizontal: 14, height: 34, borderRadius: r(17), borderWidth: 1, borderColor: C.hairline, alignItems: 'center', justifyContent: 'center' },
  instChipText: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  instHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  emptyHint: { fontFamily: F.body, fontSize: fs(14), lineHeight: fs(20), color: C.sub },
  histRow: { flexDirection: 'row', alignItems: 'center', height: 44, gap: 12, borderBottomWidth: 1, borderBottomColor: C.hairline },
  histDay: { width: 88, fontFamily: F.body, fontSize: fs(14), color: C.subStrong },
  histNote: { flex: 1, fontFamily: F.body, fontSize: fs(14.5), color: C.subStrong },
  histRating: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  histMin: { fontFamily: F.body, fontSize: fs(14), color: C.ink, fontVariant: ['tabular-nums'] },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40, gap: 14 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink, marginBottom: 4 },
  sheetRow: { height: 52, justifyContent: 'center' },
  sheetRowText: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
  input: { flex: 1, height: 52, borderBottomWidth: 1, borderBottomColor: C.staffLine, paddingHorizontal: 0, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
}));
