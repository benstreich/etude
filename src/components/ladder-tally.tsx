// The clean-pass tally (#90), shown inside a running session. The player taps
// after each repetition; N clean ones in a row bump the metronome a step.
//
// Deliberately a leaf: it subscribes to `running` and `bpm` only. The metronome
// provider goes out of its way not to re-render the app once per beat (the pulse
// is a module-level listener set, metronome.tsx), and useBeat() here would undo
// that for no gain — nothing in this block moves on the beat.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GearIcon } from '@/components/icons';
import { Pressable } from '@/components/press';
import { Text } from '@/components/text';
import { Sheet, Stepper, Switch } from '@/components/ui';
import { success, tap } from '@/lib/haptics';
import { ladderStep, resolveLadder } from '@/lib/ladder-math';
import { useMetronome } from '@/lib/metronome';
import { Piece, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export function LadderTally({ piece }: { piece: Piece }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const metronome = useMetronome();
  const cfg = resolveLadder(piece.ladder);
  const target = piece.targetBpm ?? 0;

  // The tally is ephemeral on purpose: a fresh session starts at zero, and
  // writing it would mean touching the persisted blob on every tap.
  const [tally, setTally] = useState(0);

  // A BPM change the player made themselves means a different exercise, so the
  // reps before it stop counting towards the next bump. `ours` marks the change
  // this component just made, which must not reset the tally it just reset.
  const ours = useRef<number | null>(null);
  const lastBpm = useRef(metronome.bpm);
  useEffect(() => {
    const bpm = metronome.bpm;
    if (bpm === lastBpm.current) return;
    lastBpm.current = bpm;
    if (ours.current === bpm) {
      ours.current = null;
      return;
    }
    setTally(0);
  }, [metronome.bpm]);

  if (!cfg.on || !target || piece.kind === 'Technique') return null;

  // Stopping the metronome collapses the block to its hint rather than removing
  // it — a control that disappears under the finger moves everything below it.
  if (!metronome.running)
    return (
      <View style={s.wrap}>
        <Text style={s.hint}>{store.t('tempoLadder.autoHint')}</Text>
        <ConfigButton piece={piece} />
      </View>
    );

  const onEvent = (event: 'pass' | 'miss') => {
    const r = ladderStep({ tally, bpm: metronome.bpm }, event, { need: cfg.need, step: cfg.step, target });
    setTally(r.tally);
    if (!r.advanced) return tap();
    ours.current = r.bpm;
    lastBpm.current = r.bpm;
    metronome.setBpm(r.bpm);
    store.logTempo(piece.id, r.bpm);
    success();
    store.showToast(r.reachedTarget ? store.t('tempoLadder.targetReached') : store.t('tempoLadder.advanced', { bpm: r.bpm }));
  };

  return (
    <View style={s.wrap}>
      <Pressable
        testID="ladder-miss"
        hitSlop={8}
        style={s.missBtn}
        accessibilityLabel={store.t('tempoLadder.miss')}
        onPress={() => onEvent('miss')}>
        <Text style={s.missText}>{store.t('tempoLadder.miss')}</Text>
      </Pressable>

      {/* the same filled/empty dots the repertoire rows use for stages */}
      <View testID="ladder-tally" style={s.dots} accessibilityLabel={store.t('tempoLadder.tallyA11y', { n: tally, need: cfg.need })}>
        {Array.from({ length: cfg.need }, (_, i) => (
          <View key={i} style={[s.dot, { backgroundColor: i < tally ? C.accent : C.track }]} />
        ))}
      </View>

      <Pressable
        testID="ladder-pass"
        hitSlop={8}
        style={s.passBtn}
        accessibilityLabel={store.t('tempoLadder.pass')}
        onPress={() => onEvent('pass')}>
        <Text style={s.passText}>{store.t('tempoLadder.pass')}</Text>
      </Pressable>

      <ConfigButton piece={piece} />
    </View>
  );
}

/** The same two numbers the piece page exposes, reachable without leaving the session. */
function ConfigButton({ piece }: { piece: Piece }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const cfg = resolveLadder(piece.ladder);
  const set = (patch: Partial<typeof cfg>) => store.updatePiece(piece.id, { ladder: { ...cfg, ...patch } });

  return (
    <>
      <Pressable testID="ladder-config" hitSlop={8} accessibilityLabel={store.t('tempoLadder.auto')} onPress={() => setOpen(true)}>
        <GearIcon size={18} color={C.sub} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} grabber>
        <View style={{ gap: 18 }}>
          <Text style={s.sheetTitle}>{store.t('tempoLadder.auto')}</Text>
          <LadderRows cfg={cfg} onChange={set} />
        </View>
      </Sheet>
    </>
  );
}

/**
 * Enable, passes needed, step — shared verbatim between the in-session sheet and
 * the piece page's tempo card, so the two can never drift into saying different
 * things about the same three numbers.
 */
export function LadderRows({
  cfg,
  onChange,
}: {
  cfg: { on: boolean; need: number; step: number };
  onChange: (patch: Partial<{ on: boolean; need: number; step: number }>) => void;
}) {
  const s = useS();
  const store = useStore();
  return (
    <View style={{ gap: 4 }}>
      <View style={s.row}>
        <Text style={s.rowLabel}>{store.t('tempoLadder.auto')}</Text>
        <Switch testID="ladder-auto-switch" value={cfg.on} onChange={(on) => onChange({ on })} />
      </View>
      {cfg.on && (
        <>
          <View style={s.row}>
            <Text style={s.rowLabel}>{store.t('tempoLadder.passesNeeded')}</Text>
            <Stepper value={cfg.need} min={1} max={10} size={30} onChange={(need) => onChange({ need })} />
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>{store.t('tempoLadder.stepBpm')}</Text>
            <Stepper value={cfg.step} min={1} max={12} size={30} onChange={(step) => onChange({ step })} />
          </View>
        </>
      )}
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 24, paddingVertical: 10, paddingHorizontal: 16, borderRadius: r(14), backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
  hint: { flex: 1, fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  passBtn: { height: 44, paddingHorizontal: 20, borderRadius: r(22), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  passText: { fontFamily: F.bodySemi, fontSize: fs(15), color: '#FFFFFF' },
  missBtn: { height: 36, paddingHorizontal: 14, borderRadius: r(18), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  missText: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  rowLabel: { flex: 1, fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink },
  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink },
}));
