// Sheet music attached to a piece (#60): the card on the piece page, the pill
// in a running session, and the viewer both of them open.
//
// Every attachment is a list of images by the time it gets here — PDFs were
// rasterised to pages at import — so the viewer is one horizontal pager and
// nothing else.
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Pressable } from '@/components/press';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { forPiece, type Attachment } from '@/lib/attachment-math';
import { NoPdfRendererError, pickAttachments, UnsupportedFileError } from '@/lib/attachments';
import { resolveRecordingUri, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const MAX_ZOOM = 5;

/** Attachments of one piece, newest first. Empty when the piece has none. */
export function useScores(piece: string | undefined) {
  const store = useStore();
  return piece ? forPiece(store.attachments, piece) : [];
}

/** Adds files to `piece`, turning the picker's failures into toasts. */
function useAddScore(piece: string) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      store.addAttachments(await pickAttachments(piece));
    } catch (e) {
      if (e instanceof NoPdfRendererError) store.showToast(store.t('score.noPdfRenderer'));
      else if (e instanceof UnsupportedFileError) store.showToast(store.t('score.unsupported'));
      else store.showToast(store.t('score.importFailed'));
    } finally {
      setBusy(false);
    }
  };
  return { add, busy };
}

/** "Score" card for the piece page: thumbnails, an add tile, long-press to edit. */
export function ScoreCard({ piece }: { piece: string }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const scores = useScores(piece);
  const { add, busy } = useAddScore(piece);
  const [open, setOpen] = useState<Attachment | null>(null);
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [draft, setDraft] = useState('');

  const pageCount = scores.reduce((a, x) => a + x.files.length, 0);

  return (
    <View style={{ gap: 12 }}>
      <View style={s.headRow}>
        <Overline>{store.t('score.title')}</Overline>
        {/* matches the Recordings header (Overline + a quiet count) so the two
            "your material" sections on this page read as a pair */}
        {scores.length > 0 && (
          <Text style={s.headCount}>
            {store.t('score.filesCount', { count: scores.length })} {'·'} {store.t('score.pages', { count: pageCount })}
          </Text>
        )}
      </View>
      <Card style={{ padding: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {scores.map((a) => (
            <Pressable
              key={a.id}
              style={s.thumb}
              onPress={() => setOpen(a)}
              onLongPress={() => {
                setEditing(a);
                setDraft(a.name);
              }}>
              <Image source={{ uri: resolveRecordingUri(a.files[0]) }} style={s.thumbImg} contentFit="cover" transition={120} />
              {/* rename/delete used to be long-press only, which nobody found */}
              <Pressable
                style={s.thumbMore}
                hitSlop={8}
                accessibilityLabel={store.t('score.more')}
                onPress={() => {
                  setEditing(a);
                  setDraft(a.name);
                }}>
                <Text style={s.thumbMoreGlyph}>{'\u22EF'}</Text>
              </Pressable>
              <View style={s.thumbFoot}>
                <Text style={s.thumbName} numberOfLines={1}>
                  {a.name}
                </Text>
                {a.files.length > 1 && <Text style={s.thumbPages}>{store.t('score.pages', { count: a.files.length })}</Text>}
              </View>
            </Pressable>
          ))}
          <Pressable style={[s.addTile, busy && { opacity: 0.4 }]} disabled={busy} onPress={add}>
            <Text style={s.addPlus}>+</Text>
            <Text style={s.addLabel}>{store.t('score.add')}</Text>
          </Pressable>
        </ScrollView>
        {scores.length === 0 && <Text style={s.hint}>{store.t('score.emptyHint')}</Text>}
      </Card>

      <ScoreViewer piece={piece} start={open} onClose={() => setOpen(null)} />

      {/* long-press sheet: rename or delete, the same two verbs recordings have */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={s.menu} onPress={() => {}}>
            <TextInput
              style={s.nameInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={store.t('score.namePlaceholder')}
              placeholderTextColor={C.tertiary}
              autoFocus
              onSubmitEditing={() => {
                if (editing) store.renameAttachment(editing.id, draft);
                setEditing(null);
              }}
            />
            <Pressable
              style={s.menuRow}
              onPress={() => {
                if (editing) store.renameAttachment(editing.id, draft);
                setEditing(null);
              }}>
              <Text style={s.menuText}>{store.t('score.save')}</Text>
            </Pressable>
            <Pressable
              style={s.menuRow}
              onPress={() => {
                if (editing) store.deleteAttachment(editing.id);
                setEditing(null);
              }}>
              <Text style={[s.menuText, { color: C.accent }]}>{store.t('score.delete')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * "Score" pill for the running session. Renders nothing when the focus has no
 * attachments — the timer, metronome and recorder keep running behind the sheet.
 */
export function ScorePill({ piece }: { piece: string }) {
  const s = useS();
  const store = useStore();
  const scores = useScores(piece);
  const [open, setOpen] = useState<Attachment | null>(null);
  if (scores.length === 0) return null;
  return (
    <>
      <Pressable style={s.pill} onPress={() => setOpen(scores[0])}>
        <Text style={s.pillText}>{store.t('score.title')}</Text>
      </Pressable>
      <ScoreViewer piece={piece} start={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Full-screen pager over one attachment's pages, with pinch-zoom. */
export function ScoreViewer({ piece, start, onClose }: { piece: string; start: Attachment | null; onClose: () => void }) {
  const s = useS();
  const store = useStore();
  const scores = useScores(piece);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [current, setCurrent] = useState(0);
  const [page, setPage] = useState(0);

  // `start` names the attachment; the pager works in indexes
  const [prevStart, setPrevStart] = useState<string | null>(null);
  if (start && prevStart !== start.id) {
    setPrevStart(start.id);
    setCurrent(Math.max(0, scores.findIndex((a) => a.id === start.id)));
    setPage(0);
  }
  if (!start && prevStart !== null) setPrevStart(null);

  const active = scores[current];

  return (
    <Modal visible={!!start} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {!!start && <KeepAwake />}
      <View style={[s.viewer, { paddingTop: insets.top }]}>
        <View style={s.viewerBar}>
          <View style={{ flex: 1 }}>
            <Text style={s.viewerTitle} numberOfLines={1}>
              {active?.name ?? ''}
            </Text>
            {!!active && active.files.length > 1 && (
              <Text style={s.viewerSub}>{store.t('score.pageOf', { n: page + 1, total: active.files.length })}</Text>
            )}
          </View>
          <Pressable hitSlop={10} onPress={onClose}>
            <Text style={s.viewerClose}>{store.t('score.done')}</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {(active?.files ?? []).map((f) => (
            <ZoomablePage key={f} uri={resolveRecordingUri(f)} width={width} height={height - insets.top - 56} />
          ))}
        </ScrollView>

        {/* more than one score on this piece: a strip to switch between them */}
        {scores.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.switcher}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {scores.map((a, i) => (
              <Pressable
                key={a.id}
                style={[s.switchChip, i === current && s.switchChipSel]}
                onPress={() => {
                  setCurrent(i);
                  setPage(0);
                }}>
                <Text style={[s.switchText, i === current && { color: '#fff' }]} numberOfLines={1}>
                  {a.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// its own component, so the hook only runs while the viewer is actually open
function KeepAwake() {
  useKeepAwake();
  return null;
}

/**
 * One page. Pinch to zoom, drag to pan, double-tap to reset.
 * ponytail: pan is unclamped — at 1x the page fills the screen anyway, and a
 * double-tap always brings it back. Clamp to the scaled bounds if it annoys.
 */
function ZoomablePage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scale = useSharedValue(1);
  const base = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      base.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(MAX_ZOOM, Math.max(1, base.value * e.scale));
    });

  // at 1x the horizontal drag belongs to the pager, so panning only moves a
  // zoomed page — two fingers, so a one-finger swipe always changes page
  const pan = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      x.value = startX.value + e.translationX;
      y.value = startY.value + e.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.value > 1;
      scale.value = withTiming(zoomed ? 1 : 2.5);
      x.value = withTiming(0);
      y.value = withTiming(0);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" transition={120} />
      </Animated.View>
    </GestureDetector>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  headCount: { fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary },
  thumb: { width: 92, borderRadius: r(10), overflow: 'hidden', backgroundColor: C.track },
  thumbImg: { width: 92, height: 108, backgroundColor: '#fff' },
  thumbFoot: { paddingHorizontal: 6, paddingVertical: 5 },
  thumbMore: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(28,26,23,0.55)', // same scrim the viewer backdrop uses
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbMoreGlyph: { fontFamily: F.bodySemi, fontSize: fs(13), color: '#FFFFFF', lineHeight: fs(15) },
  thumbName: { fontFamily: F.bodyMed, fontSize: fs(11.5), color: C.ink },
  thumbPages: { fontFamily: F.bodyMed, fontSize: fs(10.5), color: C.tertiary },
  addTile: { width: 92, height: 108, borderRadius: r(10), borderWidth: 1, borderStyle: 'dashed', borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center', gap: 2 },
  addPlus: { fontFamily: F.bodyMed, fontSize: fs(24), color: C.sub, lineHeight: fs(28) },
  addLabel: { fontFamily: F.bodyMed, fontSize: fs(11.5), color: C.sub },
  hint: { fontFamily: F.bodyMed, fontSize: fs(12.5), color: C.tertiary, marginTop: 10 },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: r(999), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  // menu sits in the top third, not centred: it holds an autofocused field and a centred one lands under the keyboard on iOS
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', alignItems: 'center', justifyContent: 'flex-start', padding: 32, paddingTop: '18%' },
  menu: { width: '100%', backgroundColor: C.card, borderRadius: r(16), padding: 12, gap: 4 },
  nameInput: { height: 48, borderBottomWidth: 1, borderBottomColor: C.staffLine, paddingHorizontal: 0, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  menuRow: { height: 46, justifyContent: 'center', paddingHorizontal: 14 },
  menuText: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  // the viewer is its own dark room: white paper reads best against it, and it
  // stays that way whatever the app theme is set to
  viewer: { flex: 1, backgroundColor: '#111' },
  viewerBar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  viewerTitle: { fontFamily: F.bodySemi, fontSize: fs(15), color: '#fff' },
  viewerSub: { fontFamily: F.bodyMed, fontSize: fs(12), color: 'rgba(255,255,255,0.6)' },
  viewerClose: { fontFamily: F.bodySemi, fontSize: fs(15), color: '#fff' },
  switcher: { position: 'absolute', left: 0, right: 0, bottom: 24, maxHeight: 36 },
  switchChip: { height: 32, paddingHorizontal: 12, borderRadius: r(999), backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', maxWidth: 160 },
  switchChipSel: { backgroundColor: C.accent },
  switchText: { fontFamily: F.bodyMed, fontSize: fs(12.5), color: 'rgba(255,255,255,0.75)' },
}));
