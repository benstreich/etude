// Removing a piece deletes its stages, tempo log, spots and score files for good,
// so both places that offer it (the Repertoire long-press sheet and the piece
// page menu) ask first — the same way folder, spot and session deletes do.
import { Alert, Platform } from 'react-native';

import type { Piece, useStore } from '@/lib/store';

type Store = ReturnType<typeof useStore>;

/** Confirm, then remove the piece and run `after` (closing a menu, navigating back). */
export function confirmRemovePiece(store: Pick<Store, 't' | 'removePiece'>, piece: Pick<Piece, 'id' | 'name'>, after?: () => void) {
  const title = store.t('repertoire.removeTitle', { name: piece.name });
  const body = store.t('repertoire.removeBody');
  const doRemove = () => {
    after?.();
    store.removePiece(piece.id);
  };
  // ponytail: Alert.alert is a no-op on web; window.confirm covers it
  if (Platform.OS === 'web') {
    if (window.confirm(`${title} ${body}`)) doRemove();
    return;
  }
  Alert.alert(title, body, [
    { text: store.t('editSession.cancel'), style: 'cancel' },
    { text: store.t('repertoire.remove'), style: 'destructive', onPress: doRemove },
  ]);
}
