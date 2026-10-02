import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useIsFocused } from 'expo-router';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';

import {
  CheckIcon,
  CloseIcon,
  LoopIcon,
  MoveIcon,
  PauseIcon,
  PlayIcon,
  ScissorsIcon,
  ShareIcon,
  StarIcon,
  TrashIcon,
  UndoIcon,
} from '@/components/icons';
import { Pressable } from '@/components/press';
import { Text } from '@/components/text';
import { ActionChip, ChipRow, Sheet } from '@/components/ui';
import { applyAudioMode } from '@/lib/audio-mode';
import { tap, thud } from '@/lib/haptics';
import { detectSilence } from '@/lib/silence-math';
import { dayLabel, Recording, resolveRecordingUri, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';
import {
  clearTrim,
  dragHandle,
  inPoint,
  isTrimmed,
  MIN_CLIP,
  nearestHandle,
  nudgeTrim,
  outPoint,
  setFromPlayhead,
  setHandle,
  timeAt,
  type Handle as TrimHandle,
} from '@/lib/trim-math';

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
// tenths, for the trim bounds — a 0.1s nudge has to be legible or the buttons look dead
// (rounded to tenths first: flooring the fraction showed 0.8 as "0:00.7" on float error)
const fmtFine = (sec: number) => {
  const d = Math.round(sec * 10);
  return `${fmt(Math.floor(d / 10))}.${d % 10}`;
};

// what the share sheet is told the file is; imports keep their own extension
const MIME: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  '3gp': 'audio/3gpp',
  amr: 'audio/amr',
  webm: 'audio/webm',
  caf: 'audio/x-caf',
};
const mimeOf = (uri: string) => MIME[uri.split('.').pop()?.toLowerCase() ?? ''] ?? 'audio/*';

// The scrub/trim strip for a take with no level samples — an imported file. Values
// are never drawn as heights (see `hasWave`); the array only sets how finely the
// track is divided, so the playhead and the trim shading have somewhere to land.
const FLAT_WAVE: number[] = Array(60).fill(0);

// Put both handles at once, each through setHandle so MIN_CLIP and the ordering
// invariant hold. The out point moves first: the in point then clamps against the
// new bound rather than the one the user is replacing.
const snapTo = (c: Recording, t: { start: number; end: number }) => {
  const out = setHandle(c, 'end', t.end);
  return setHandle({ ...c, ...out }, 'start', t.start);
};

const RATES = [1, 0.75, 0.5];
const nextRate = (rate: number) => RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 0.75;
const rateLabel = (rate: number) => `${rate === 1 ? '1' : String(rate).replace(/^0/, '')}×`;

// "Today, 2:35 PM" — older recordings without a timestamp just show the day
const when = (r: Recording, store: ReturnType<typeof useStore>) =>
  dayLabel(r.date, store.today, store.t, store.lang) +
  (r.at ? `, ${new Date(r.at).toLocaleTimeString(store.lang, { hour: 'numeric', minute: '2-digit' })}` : '');

/**
 * One player per list — starting a row stops whichever row was playing.
 * `onMove` turns on the "move to another piece" action; the orphan list uses it.
 */
export function RecordingsList({
  recordings,
  showPiece = false,
  onMove,
}: {
  recordings: Recording[];
  showPiece?: boolean;
  onMove?: (r: Recording) => void;
}) {
  const s = useS();
  const C = useC();
  const store = useStore();
  // 100ms status ticks: at the default 500 a trimmed-off cough played on every
  // loop before the out-point effect caught it
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [trimId, setTrimId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // the trim being edited, held out of the store until Save — dragging a handle
  // used to rewrite the take on every frame, with no way back to where you started
  const [trim, setTrim] = useState<{ start: number; end: number } | null>(null);
  const [waveW, setWaveW] = useState(1);
  const [sheetWaveW, setSheetWaveW] = useState(1); // the trim sheet's own, wider waveform
  const grabbed = useRef<TrimHandle>('start'); // handle claimed on touch-down, held for the whole drag
  const [loopDraft, setLoopDraft] = useState(false); // the trim sheet's Loop, saved with the trim
  const [dragging, setDragging] = useState(false); // a trim handle is held: the sheet must not scroll
  // Set by `replace` until the new file reports: until then the status is still the
  // old take's, and its position (say 0:45) read as "past the out point" of a short
  // new take, which paused it the moment it started.
  const switching = useRef(false);

  // while trimming, `clip` is the draft (bounds and loop); everywhere else the take's own
  const clipOf = (r: Recording) => (trimId === r.id && trim ? { ...r, ...trim, loop: loopDraft } : r);

  // adjust-state-during-render pattern (react.dev "you might not need an effect").
  // A looping take restarts instead of clearing: running to the end of the file is
  // the only way an *untrimmed* take ever finishes, so this is where its loop lives
  // (the out-point effect below only ever fires for a trimmed one). One that doesn't
  // loop parks at its in point and stays open — clearing the row collapsed its
  // toolbar (share, speed) out from under the finger reaching for it.
  const [prevFinish, setPrevFinish] = useState(status.didJustFinish);
  if (prevFinish !== status.didJustFinish) {
    setPrevFinish(status.didJustFinish);
    if (status.didJustFinish) {
      const done = recordings.find((r) => r.id === currentId);
      if (!done) setCurrentId(null);
      else {
        const c = clipOf(done);
        player.seekTo(inPoint(c));
        if (c.loop) player.play();
      }
    }
  }

  // the trim is non-destructive: the file keeps its tail, playback stops at the
  // out point (and loops back to the in point when the row is set to loop)
  const current = recordings.find((r) => r.id === currentId);
  const currentClip = current ? clipOf(current) : undefined;
  useEffect(() => {
    if (!currentClip || !status.playing) return;
    if (switching.current) {
      if (status.currentTime > inPoint(currentClip) + 1) return; // still the previous file's status
      switching.current = false;
    }
    // Only a real out point is enforced. An untrimmed take ends with its file, which
    // didJustFinish handles: the stored length is approximate (whole seconds on older
    // takes, 0 for an import whose length couldn't be read) and cut the tail short.
    if (currentClip.end === undefined || currentClip.end >= currentClip.sec) return;
    if (status.currentTime < currentClip.end) return;
    player.seekTo(inPoint(currentClip));
    if (!currentClip.loop) player.pause(); // parked at the in point, so the next tap replays the clip
  }, [currentClip, status.currentTime, status.playing, player]);

  // an import whose length couldn't be read is stored as 0s; the loaded file knows.
  // `player.duration` rather than the status: right after a switch that is still the old file's.
  const updateRecording = store.updateRecording;
  useEffect(() => {
    if (!current || current.sec > 0 || status.duration <= 0) return;
    const d = player.duration;
    if (Number.isFinite(d) && d > 0) updateRecording(current.id, { sec: Math.round(d * 10) / 10 });
  }, [current, status.duration, player, updateRecording]);

  // A tab keeps its screen mounted, so leaving it used to carry the audio with you.
  // This watches the blur instead of cleaning up after itself on purpose (#96):
  // useFocusEffect's cleanup ALSO runs on unmount, and by then expo-audio has
  // released the player — pausing a released one throws and takes the app down.
  // Every ordinary exit blurs the screen first, so the cleanup ran harmlessly while
  // the player was still alive; deleting the last take was the one thing that
  // unmounted this list with its screen still focused, which is why that alone
  // crashed. An unmount needs no pause anyway — releasing the player stops the sound.
  // Clearing the row is the same adjust-state-during-render pattern as the loop
  // above; only the pause itself belongs in an effect.
  const focused = useIsFocused();
  const [prevFocused, setPrevFocused] = useState(focused);
  if (prevFocused !== focused) {
    setPrevFocused(focused);
    if (!focused) setCurrentId(null);
  }
  useEffect(() => {
    if (!focused) player.pause();
  }, [focused, player]);

  const toggle = (r: Recording) => {
    const c = clipOf(r); // the draft bounds when this is the take being trimmed
    if (currentId === r.id) {
      if (status.playing) player.pause();
      else {
        // a handle moved past the playhead while paused: start the clip over
        const t = player.currentTime;
        if (t < inPoint(c) || (c.end !== undefined && t >= c.end)) player.seekTo(inPoint(c));
        player.play();
      }
      return;
    }
    applyAudioMode({ playsInSilentMode: true, allowsRecording: false });
    player.replace(resolveRecordingUri(r.uri));
    switching.current = true;
    // expo-audio exposes this as a native setter, not hook state — same exemption
    // as drone.tsx. Pitch correction keeps a half-speed take in tune.
    // eslint-disable-next-line react-hooks/immutability
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(r.rate ?? 1);
    player.seekTo(inPoint(c));
    player.play();
    setCurrentId(r.id);
  };

  const cycleRate = (r: Recording) => {
    const rate = nextRate(r.rate ?? 1);
    store.updateRecording(r.id, { rate });
    if (currentId === r.id) {
      // eslint-disable-next-line react-hooks/immutability
      player.shouldCorrectPitch = true;
      player.setPlaybackRate(rate);
    }
  };

  const remove = (r: Recording) => {
    if (currentId === r.id) {
      player.pause();
      setCurrentId(null);
    }
    try {
      new File(resolveRecordingUri(r.uri)).delete();
    } catch {}
    store.deleteRecording(r.id);
  };

  // A take is the one thing here that can't be made again, and the bin sits a
  // thumb's width from star and trim. Ask first — this deletes the file too.
  const confirmRemove = (r: Recording) => {
    const label = r.name || (showPiece ? r.piece : store.t('recordings.untitled'));
    const title = store.t('recordings.deleteTitle');
    const body = store.t('recordings.deleteBody', { name: label });
    // ponytail: Alert.alert is a no-op on web; window.confirm covers it (see practice.tsx)
    if (Platform.OS === 'web') {
      if (window.confirm(`${title} ${body}`)) remove(r);
      return;
    }
    Alert.alert(title, body, [
      { text: store.t('recordings.moveCancel'), style: 'cancel' },
      { text: store.t('recordings.delete'), style: 'destructive', onPress: () => remove(r) },
    ]);
  };

  // ponytail: shares the whole file — trimming AAC needs a native encoder we don't have
  const share = async (r: Recording) => {
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
      await Sharing.shareAsync(resolveRecordingUri(r.uri), { mimeType: mimeOf(r.uri), dialogTitle: r.name || r.piece });
    } catch {
      store.showToast(store.t('recordings.shareFailed'));
    }
  };

  const commitName = (r: Recording) => {
    store.renameRecording(r.id, draft);
    setEditingId(null);
  };

  // dragging the wave trims the handle claimed on touch-down; otherwise it scrubs.
  // Claiming once is what keeps a drag from jumping to the other handle mid-gesture.
  const openTrim = (r: Recording) => {
    setTrimId(r.id);
    setTrim({ start: inPoint(r), end: outPoint(r) });
    setLoopDraft(!!r.loop);
  };
  const closeTrim = () => {
    setTrimId(null);
    setTrim(null);
    setDragging(false);
  };
  const saveTrim = (r: Recording) => {
    // a draft spanning the whole file is "no trim", not a trim that happens to fit
    if (trim) store.updateRecording(r.id, { ...(trim.start <= 0 && trim.end >= r.sec ? clearTrim() : trim), loop: loopDraft });
    closeTrim();
  };

  // playback scrub only — trimming now happens in its own sheet (below), on its own wider waveform
  const onWaveGrant = (r: Recording, x: number) => {
    if (currentId === r.id) player.seekTo(timeAt(r, x, waveW));
  };
  const onWaveMove = (r: Recording, x: number) => {
    if (currentId === r.id) player.seekTo(timeAt(r, x, waveW));
  };
  const onTrimGrant = (r: Recording, x: number) => {
    setDragging(true);
    const c = clipOf(r);
    grabbed.current = nearestHandle(c, x, sheetWaveW);
    setTrim(dragHandle(c, grabbed.current, x, sheetWaveW));
  };
  const onTrimMove = (r: Recording, x: number) => setTrim(dragHandle(clipOf(r), grabbed.current, x, sheetWaveW));

  // starred ("my reference take") float to the top — the same takes Compare and
  // the Progress "hear the difference" section reach for, so the order matches.
  // Memoised because the player status ticks ~10×/s and re-renders this list; the
  // takes themselves only change when the store does. Above the early return: a
  // hook after it would change hook order the first time a take is added.
  const list = useMemo(
    () => [...recordings].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0)),
    [recordings]
  );

  const trimRec = trimId ? (recordings.find((r) => r.id === trimId) ?? null) : null;
  const trimClip = trimRec ? clipOf(trimRec) : null; // the draft bounds, held out of the store until Save

  if (recordings.length === 0) return null;

  return (
    <View>
      {list.map((r, i) => {
        const playing = currentId === r.id && status.playing;
        const trimming = trimId === r.id;
        const c = clipOf(r); // draft bounds while trimming, the saved ones otherwise
        const open = currentId === r.id;
        // An imported take carries no level samples, and gating the strip on them
        // took the scrub surface and the trim grips away with the picture — trimming
        // one was nudge-only, 0.1s a tap. Draw a flat track instead: no waveform to
        // show, but the same thing to drag.
        const wave = r.wave?.length ? r.wave : FLAT_WAVE;
        const hasWave = !!r.wave?.length;
        const at = currentId === r.id ? status.currentTime : inPoint(c);
        const rate = r.rate ?? 1;
        const label = r.name || (showPiece ? r.piece : store.t('recordings.untitled'));
        return (
          <View key={r.id} style={[i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}>
            <View style={s.row}>
              <Pressable
                style={[s.playBtn, playing && { backgroundColor: C.accent }]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={store.t(playing ? 'recordings.pause' : 'recordings.play', { name: label })}
                onPress={() => toggle(r)}>
                {playing ? <PauseIcon color={C.bg} size={14} /> : <PlayIcon color={C.bg} size={14} />}
              </Pressable>
              <View style={{ flex: 1 }}>
                {editingId === r.id ? (
                  <TextInput
                    style={s.nameInput}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={store.t('recordings.namePlaceholder')}
                    placeholderTextColor={C.tertiary}
                    autoFocus
                    onSubmitEditing={() => commitName(r)}
                    returnKeyType="done"
                  />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint={store.t('recordings.renameHint')}
                    onPress={() => {
                      setDraft(r.name ?? '');
                      setEditingId(r.id);
                    }}>
                    <Text style={s.piece} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={s.meta}>
                      {when(r, store)} {'·'} {fmt(outPoint(r) - inPoint(r))}
                      {isTrimmed(r) ? ` · ${store.t('recordings.trimmed')}` : ''}
                      {rate !== 1 ? ` · ${rateLabel(rate)}` : ''}
                      {r.starred ? ` · ${store.t('recordings.reference')}` : ''}
                    </Text>
                  </Pressable>
                )}
              </View>
              {editingId === r.id ? (
                <>
                  <Pressable style={s.iconBtn} hitSlop={8} accessibilityLabel={store.t('recordings.cancel')} onPress={() => setEditingId(null)}>
                    <CloseIcon />
                  </Pressable>
                  <Pressable style={s.iconBtn} hitSlop={8} accessibilityLabel={store.t('recordings.save')} onPress={() => commitName(r)}>
                    <CheckIcon />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={s.iconBtn}
                    hitSlop={8}
                    accessibilityLabel={store.t(r.starred ? 'recordings.unstar' : 'recordings.star')}
                    onPress={() => store.toggleStar(r.id)}>
                    <StarIcon filled={!!r.starred} color={r.starred ? C.accent : C.faint} />
                  </Pressable>
                  {/* a take too short (or of unknown length, 0s) to hold a clip has nothing to trim */}
                  {r.sec > MIN_CLIP && (
                    <Pressable
                      style={s.iconBtn}
                      hitSlop={8}
                      accessibilityLabel={store.t('recordings.trim')}
                      testID="recording-trim"
                      onPress={() => {
                        if (trimming) closeTrim();
                        else {
                          thud(true);
                          openTrim(r);
                        }
                      }}>
                      <ScissorsIcon color={trimming ? C.accent : C.sub} />
                    </Pressable>
                  )}
                  {/* always shown, not in the playing-only toolbar: filing a take
                      shouldn't need it playing first */}
                  {onMove && (
                    <Pressable style={s.iconBtn} hitSlop={8} accessibilityLabel={store.t('recordings.move')} onPress={() => onMove(r)}>
                      <MoveIcon />
                    </Pressable>
                  )}
                  <Pressable style={s.iconBtn} hitSlop={8} accessibilityLabel={store.t('recordings.delete')} onPress={() => confirmRemove(r)}>
                    <TrashIcon />
                  </Pressable>
                </>
              )}
            </View>

            {open && (
              <View
                style={s.wave}
                onLayout={(e) => setWaveW(e.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => currentId === r.id}
                onMoveShouldSetResponder={() => currentId === r.id}
                onResponderGrant={(e) => onWaveGrant(r, e.nativeEvent.locationX)}
                onResponderMove={(e) => onWaveMove(r, e.nativeEvent.locationX)}>
                {wave.map((v, j) => {
                  const barAt = ((j + 0.5) / wave.length) * r.sec;
                  const outside = barAt < inPoint(c) || barAt > outPoint(c);
                  return (
                    <View
                      key={j}
                      style={{
                        // a placeholder track is a thin line, never a fake waveform:
                        // an invented shape would make trim and Compare lie about the audio
                        flex: 1,
                        height: hasWave ? 4 + v * 24 : 3,
                        borderRadius: 2,
                        opacity: outside ? 0.25 : 1,
                        backgroundColor: !outside && barAt <= at ? C.accent : C.chartInactive,
                      }}
                    />
                  );
                })}
              </View>
            )}

            {open && (
              <View style={s.toolBar}>
                <Text style={s.meta}>
                  {fmt(at)} / {fmt(outPoint(r))}
                </Text>
                <View style={{ flex: 1 }} />
                <ChipRow>
                  <ActionChip
                    icon={() => null}
                    label={rateLabel(rate)}
                    accessibilityLabel={store.t('recordings.speed', { rate: rateLabel(rate) })}
                    active={rate !== 1}
                    onPress={() => cycleRate(r)}
                  />
                  <ActionChip
                    icon={(color) => <LoopIcon color={color} />}
                    label={store.t('recordings.loop')}
                    active={!!r.loop}
                    onPress={() => store.updateRecording(r.id, { loop: !r.loop })}
                  />
                  <ActionChip icon={(color) => <ShareIcon color={color} size={18} />} label={store.t('recordings.share')} onPress={() => share(r)} />
                </ChipRow>
              </View>
            )}
          </View>
        );
      })}

      <TrimSheet
        recording={trimRec}
        clip={trimClip}
        waveW={sheetWaveW}
        onLayoutWave={setSheetWaveW}
        onGrant={(x) => trimRec && onTrimGrant(trimRec, x)}
        onMove={(x) => trimRec && onTrimMove(trimRec, x)}
        onRelease={() => setDragging(false)}
        dragging={dragging}
        onNudge={(handle, steps) => trimClip && setTrim(nudgeTrim(trimClip, handle, steps))}
        // the player's own position, not the last (up to 100ms old) status tick
        onHere={currentId === trimId && trimClip ? (handle) => setTrim(setFromPlayhead(trimClip, handle, player.currentTime)) : undefined}
        playing={currentId === trimId && status.playing}
        // the native-setter exemption toggle already carries (shouldCorrectPitch)
        // eslint-disable-next-line react-hooks/immutability
        onTogglePlay={() => trimRec && toggle(trimRec)}
        loop={loopDraft}
        onToggleLoop={() => setLoopDraft((l) => !l)}
        onTrimSilence={(t) => trimClip && setTrim(snapTo(trimClip, t))}
        onClear={() => trimRec && setTrim({ start: 0, end: trimRec.sec })}
        onShare={() => trimRec && share(trimRec)}
        onCancel={closeTrim}
        onSave={() => trimRec && saveTrim(trimRec)}
      />
    </View>
  );
}

/**
 * Trim moves into the app's Sheet (#88): today's inline panel borrowed its own
 * borders and radii from nowhere in particular. `recording`/`clip` null means
 * closed or closing — the body unmounts immediately, same as every other sheet
 * keyed off a nullable "current item" (see EditSessionSheet).
 */
function TrimSheet({
  recording,
  clip,
  waveW,
  onLayoutWave,
  onGrant,
  onMove,
  onRelease,
  dragging,
  onNudge,
  onHere,
  playing,
  onTogglePlay,
  loop,
  onToggleLoop,
  onTrimSilence,
  onClear,
  onShare,
  onCancel,
  onSave,
}: {
  recording: Recording | null;
  clip: Recording | null;
  waveW: number;
  onLayoutWave: (w: number) => void;
  onGrant: (x: number) => void;
  onMove: (x: number) => void;
  onRelease: () => void;
  dragging: boolean;
  onNudge: (handle: TrimHandle, steps: number) => void;
  onHere?: (handle: TrimHandle) => void;
  playing: boolean;
  onTogglePlay: () => void;
  loop: boolean;
  onToggleLoop: () => void;
  onTrimSilence: (t: { start: number; end: number }) => void;
  onClear: () => void;
  onShare: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    // a held handle turns the sheet's scroll off, or a slightly diagonal drag became a scroll
    <Sheet visible={recording !== null} onClose={onCancel} grabber scrollEnabled={!dragging}>
      {recording && clip && (
        <TrimEditor
          key={recording.id}
          recording={recording}
          clip={clip}
          waveW={waveW}
          onLayoutWave={onLayoutWave}
          onGrant={onGrant}
          onMove={onMove}
          onRelease={onRelease}
          onNudge={onNudge}
          onHere={onHere}
          playing={playing}
          onTogglePlay={onTogglePlay}
          loop={loop}
          onToggleLoop={onToggleLoop}
          onTrimSilence={onTrimSilence}
          onClear={onClear}
          onShare={onShare}
          onCancel={onCancel}
          onSave={onSave}
        />
      )}
    </Sheet>
  );
}

function TrimEditor({
  recording,
  clip,
  waveW,
  onLayoutWave,
  onGrant,
  onMove,
  onRelease,
  onNudge,
  onHere,
  playing,
  onTogglePlay,
  loop,
  onToggleLoop,
  onTrimSilence,
  onClear,
  onShare,
  onCancel,
  onSave,
}: {
  recording: Recording;
  clip: Recording;
  waveW: number;
  onLayoutWave: (w: number) => void;
  onGrant: (x: number) => void;
  onMove: (x: number) => void;
  onRelease: () => void;
  onNudge: (handle: TrimHandle, steps: number) => void;
  onHere?: (handle: TrimHandle) => void;
  playing: boolean;
  onTogglePlay: () => void;
  loop: boolean;
  onToggleLoop: () => void;
  onTrimSilence: (t: { start: number; end: number }) => void;
  onClear: () => void;
  onShare: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const wave = recording.wave?.length ? recording.wave : FLAT_WAVE;
  const hasWave = !!recording.wave?.length;
  // The sheet only has the 60-bar wave, not the raw level stream the recorder saw,
  // so these bounds land within a bar of the ones auto-trim used — close enough for
  // a snap the user can then drag, which is the whole point of offering it here.
  const silence = useMemo(
    () => (recording.wave?.length ? detectSilence(recording.wave, recording.sec) : null),
    [recording.wave, recording.sec]
  );

  return (
    <View style={{ gap: 18 }}>
      <View style={s.trimTitleRow}>
        <Text style={s.trimTitle}>{store.t('recordings.trimTake')}</Text>
        <Text style={s.trimName} numberOfLines={1}>
          {recording.name || (recording.piece ?? '')}
        </Text>
      </View>

      <View
        style={s.trimWave}
        onLayout={(e) => onLayoutWave(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onGrant(e.nativeEvent.locationX)}
        onResponderMove={(e) => onMove(e.nativeEvent.locationX)}
        onResponderTerminationRequest={() => false}
        onResponderRelease={onRelease}
        onResponderTerminate={onRelease}>
        {wave.map((v, j) => {
          const barAt = ((j + 0.5) / wave.length) * recording.sec;
          const outside = barAt < inPoint(clip) || barAt > outPoint(clip);
          return (
            <View
              key={j}
              style={{
                flex: 1,
                height: hasWave ? 8 + v * 56 : 4,
                borderRadius: 2,
                backgroundColor: outside ? C.chartInactive : C.accent,
                opacity: outside ? 0.3 : 1,
              }}
            />
          );
        })}
        <TrimHandleMark x={(inPoint(clip) / recording.sec) * waveW} label={fmtFine(inPoint(clip))} above />
        <TrimHandleMark x={(outPoint(clip) / recording.sec) * waveW} label={fmtFine(outPoint(clip))} above={false} />
      </View>

      <View style={{ gap: 8 }}>
        <Bound
          label={store.t('recordings.in')}
          value={fmtFine(inPoint(clip))}
          onNudge={(steps) => onNudge('start', steps)}
          onHere={onHere && (() => onHere('start'))}
          hereLabel={store.t('recordings.here')}
          a11y={{ earlier: store.t('recordings.inEarlier'), later: store.t('recordings.inLater'), here: store.t('recordings.inHere') }}
        />
        <Bound
          label={store.t('recordings.out')}
          value={fmtFine(outPoint(clip))}
          onNudge={(steps) => onNudge('end', steps)}
          onHere={onHere && (() => onHere('end'))}
          hereLabel={store.t('recordings.here')}
          a11y={{ earlier: store.t('recordings.outEarlier'), later: store.t('recordings.outLater'), here: store.t('recordings.outHere') }}
        />
      </View>

      <View style={s.trimFooterRow}>
        {/* the sheet covers the row's own play button; "Here" needs the take playing */}
        <Pressable
          style={[s.playBtn, playing && { backgroundColor: C.accent }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={store.t(playing ? 'recordings.pause' : 'recordings.play', {
            name: recording.name || (recording.piece ?? ''),
          })}
          testID="trim-play"
          onPress={onTogglePlay}>
          {playing ? <PauseIcon color={C.bg} size={14} /> : <PlayIcon color={C.bg} size={14} />}
        </Pressable>
        <Text style={s.meta}>{store.t('recordings.clipLength', { len: fmtFine(outPoint(clip) - inPoint(clip)) })}</Text>
        <View style={{ flex: 1 }} />
        <ChipRow>
          <ActionChip icon={(color) => <LoopIcon color={color} />} label={store.t('recordings.loop')} active={loop} onPress={onToggleLoop} />
          {hasWave && (
            <ActionChip
              icon={(color) => <ScissorsIcon color={color} size={18} />}
              label={store.t('recordings.trimSilence')}
              disabled={!silence}
              accessibilityLabel={silence ? undefined : store.t('recordings.trimSilenceNone')}
              testID="trim-silence"
              onPress={() => silence && onTrimSilence(silence)}
            />
          )}
          <ActionChip icon={(color) => <UndoIcon color={color} />} label={store.t('recordings.clearTrim')} onPress={onClear} />
          <ActionChip icon={(color) => <ShareIcon color={color} size={18} />} label={store.t('recordings.share')} onPress={onShare} />
        </ChipRow>
      </View>
      {/* the share button sits inside the trim sheet, which reads as
          "share the clip" — it can't be, so say so rather than surprise */}
      <Text style={s.meta}>{store.t('recordings.shareWholeHint')}</Text>

      <View style={{ gap: 10 }}>
        <Pressable style={s.trimSaveBtn} testID="trim-save" onPress={onSave}>
          <Text style={s.trimSaveBtnText}>{store.t('recordings.saveTrim')}</Text>
        </Pressable>
        <Pressable style={s.trimCancelBtn} hitSlop={8} testID="trim-cancel" onPress={onCancel}>
          <Text style={s.trimCancelText}>{store.t('recordings.cancelTrim')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A handle on the trim waveform: the 3px bar itself, plus its own time label riding above (in) or below (out) it. */
function TrimHandleMark({ x, label, above }: { x: number; label: string; above: boolean }) {
  const s = useS();
  const C = useC();
  return (
    <View pointerEvents="none" style={[s.trimHandle, { left: x - 1.5, backgroundColor: C.accent }]}>
      <View style={[s.trimHandlePillWrap, above ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 6 }]}>
        <View style={s.trimHandlePill}>
          <Text style={s.trimHandlePillText}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

/** One trim bound: its time, a 30px nudge either side (0.1s steps), and "put it where I'm listening". */
function Bound({
  label,
  value,
  onNudge,
  onHere,
  hereLabel,
  a11y,
}: {
  label: string;
  value: string;
  onNudge: (steps: number) => void;
  onHere?: () => void;
  hereLabel: string;
  /** What −, + and Here do to *this* bound — the glyphs alone say nothing to a screen reader. */
  a11y: { earlier: string; later: string; here: string };
}) {
  const s = useS();
  const { t } = useStore();
  const nudge = (steps: number, glyph: string, key: string) => (
    <Pressable
      key={key}
      style={s.nudge}
      hitSlop={7}
      accessibilityRole="button"
      accessibilityLabel={steps < 0 ? a11y.earlier : a11y.later}
      onPress={() => {
        tap();
        onNudge(steps);
      }}>
      <Text style={s.nudgeText}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={s.boundRow}>
      <Text style={s.boundLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={s.boundValue}>{value}</Text>
      <View style={{ flex: 1 }} />
      {nudge(-1, '−', 'd')}
      {nudge(1, '+', 'i')}
      {onHere && <ActionChip icon={() => null} label={hereLabel} accessibilityLabel={a11y.here} onPress={onHere} />}
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
    playBtn: {
      width: 34,
      height: 34,
      borderRadius: r(17),
      backgroundColor: C.ink,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
    },
    piece: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink },
    meta: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 1 },
    nameInput: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink, padding: 0, borderBottomWidth: 1, borderBottomColor: C.accent },
    iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 32, marginBottom: 10 },
    toolBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
    boundRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    boundLabel: { fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 0.5, color: C.tertiary, minWidth: 26 },
    boundValue: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.ink },
    // the same size-30 stepper button geometry as ui.tsx's `Stepper`
    nudge: { width: 30, height: 30, borderRadius: r(15), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
    nudgeText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
    trimTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    trimTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink },
    trimName: { flexShrink: 1, fontFamily: F.body, fontSize: fs(13), color: C.sub },
    trimWave: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 2, height: 72, marginTop: 12, marginBottom: 20 },
    trimHandle: { position: 'absolute', top: -6, bottom: -6, width: 3, borderRadius: 1.5 },
    trimHandlePillWrap: { position: 'absolute', left: -20, width: 43, alignItems: 'center' },
    trimHandlePill: { minHeight: 20, paddingVertical: 2, paddingHorizontal: 8, borderRadius: r(10), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
    trimHandlePillText: { fontFamily: F.bodyMed, fontSize: fs(11), color: '#fff', fontVariant: ['tabular-nums'] },
    trimFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    trimSaveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
    trimSaveBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.bg },
    trimCancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
    trimCancelText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  })
);
