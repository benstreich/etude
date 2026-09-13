// "+ New" beside any piece/technique picker (#40) — the repertoire was the only
// place you could add one, which meant leaving whatever you were building.
// Collapsed it is a chip; expanded, a name field and a Piece/Technique choice.
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/text';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export type Focus = { name: string; kind: 'Piece' | 'Technique' };

export function AddFocus({ onAdded }: { onAdded?: (focus: Focus) => void }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Focus['kind']>('Piece');

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    if (kind === 'Piece') store.addPiece(n);
    else store.addTechnique(n);
    onAdded?.({ name: n, kind });
    setName('');
    setOpen(false);
  };

  if (!open)
    return (
      <Pressable style={s.newChip} onPress={() => setOpen(true)}>
        <Text style={s.newChipText}>{store.t('addFocus.new')}</Text>
      </Pressable>
    );

  return (
    <View style={s.form}>
      <View style={s.kindRow}>
        {(['Piece', 'Technique'] as const).map((k) => (
          <Pressable key={k} style={[s.kindChip, kind === k && s.kindChipSel]} onPress={() => setKind(k)}>
            <Text style={[s.kindText, kind === k && { color: C.accent }]}>
              {store.t(k === 'Piece' ? 'addFocus.piece' : 'addFocus.technique')}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder={store.t('addFocus.namePlaceholder')}
          placeholderTextColor={C.tertiary}
          autoFocus
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <Pressable style={[s.addBtn, !name.trim() && { opacity: 0.4 }]} disabled={!name.trim()} onPress={submit}>
          <Text style={s.addBtnText}>{store.t('addFocus.add')}</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => { setOpen(false); setName(''); }}>
          <Text style={s.cancel}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  newChip: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.inputBorder, borderRadius: r(999), paddingVertical: 9, paddingHorizontal: 14 },
  newChipText: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.accent },
  form: { gap: 10, width: '100%' },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindChip: { borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, borderRadius: r(999), paddingVertical: 7, paddingHorizontal: 13 },
  kindChipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  kindText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.subStrong },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 44, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, paddingHorizontal: 12, fontFamily: F.body, fontSize: fs(15), color: C.ink },
  addBtn: { height: 44, paddingHorizontal: 16, borderRadius: r(12), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontFamily: F.bodySemi, fontSize: fs(14.5), color: '#FFFFFF' },
  cancel: { fontFamily: F.body, fontSize: fs(22), color: C.tertiary, paddingHorizontal: 2 },
}));
