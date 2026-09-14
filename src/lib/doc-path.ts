// Recordings and score attachments persist a documents-relative path: absolute
// URIs rot on iOS, where the app container UUID changes on every update.
// Anything that still has a scheme (blob:, http:, a legacy file:// not under
// documents) passes through.
//
// Its own file rather than store.tsx's, so attachments.ts can convert paths
// without importing the store that imports it back.
import { Paths } from 'expo-file-system';

const docUri = () => {
  try {
    const d = Paths.document.uri;
    return d.endsWith('/') ? d : `${d}/`;
  } catch {
    return ''; // web
  }
};

export const toStoredUri = (uri: string) => {
  const d = docUri();
  return d && uri.startsWith(d) ? uri.slice(d.length) : uri;
};

/** Documents-relative → absolute. Named for recordings; used by scores too. */
export const resolveRecordingUri = (stored: string) => (stored.includes(':') ? stored : docUri() + stored);
