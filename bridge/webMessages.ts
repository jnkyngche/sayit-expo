// 웹(Next.js) <-> 네이티브 postMessage 브릿지 계약.
// 웹 쪽은 window.ReactNativeWebView.postMessage(JSON.stringify(...))로 아래 타입의 메시지를 보낸다.
// Word/Folder 필드 이름은 sayIt-web의 src/types/sentence.ts, src/types/folder.ts와 맞춘 것이다 —
// 둘 중 하나만 바꾸면 계약이 어긋나니 같이 수정한다.
export type WebToNativeMessage =
  | { type: 'OPEN_CAMERA' }
  | { type: 'NAVIGATE_PUSH'; url: string; title?: string }
  | { type: 'NAVIGATE_POP' }
  | { type: 'LIBRARY_FOLDERS' }
  | { type: 'LIBRARY_CREATE_FOLDER'; name: string }
  | { type: 'LIBRARY_RENAME_FOLDER'; folderId: string; name: string }
  | { type: 'LIBRARY_LIST'; folderId: string; cursor?: string }
  | {
      type: 'LIBRARY_SAVE';
      folderId: string;
      text: string;
      phonetic?: string;
      words?: Word[];
      voice: string;
      speed: number;
    }
  | { type: 'LIBRARY_DELETE'; sentenceId: string }
  | { type: 'SENTENCE_GET'; sentenceId: string }
  | { type: 'AUDIO_REQUEST'; sentenceId: string }
  | { type: 'AUDIO_PREFETCH'; sentenceIds: string[] };

export type AudioState = 'none' | 'downloading' | 'ready';

// sayIt-web의 Word와 동일. start/end는 PronunciationPlayer가 단어 구간 재생에 쓴다.
export type Word = { text: string; phonetic: string; start?: number; end?: number };

export type Folder = { id: string; name: string; sentenceCount: number };

export type SentenceSummary = {
  id: string;
  text: string;
  phonetic: string | null;
  words: Word[] | null;
  folderId: string;
  audioState: AudioState;
  savedAt: number;
  // 이 문장을 다른 폴더에도 저장할 때(LIBRARY_SAVE) 같은 audioKey로 재사용하려면 필요하다.
  voice: string;
  speed: number;
};

// 네이티브가 webviewRef.postMessage(JSON.stringify(...))로 웹에 보내는 메시지.
export type NativeToWebMessage =
  | { type: 'PHOTO_CAPTURED'; base64: string }
  | { type: 'AUDIO_STATE'; key: string; state: AudioState }
  | { type: 'LIBRARY_FOLDERS_OK'; folders: Folder[] }
  | { type: 'LIBRARY_CREATE_FOLDER_OK'; folder: Folder }
  | { type: 'LIBRARY_RENAME_FOLDER_OK'; folder: Folder }
  | { type: 'LIBRARY_LIST_OK'; folderId: string; sentences: SentenceSummary[]; nextCursor: string | null }
  | { type: 'LIBRARY_SAVE_OK'; sentence: SentenceSummary }
  | { type: 'LIBRARY_DELETE_OK'; sentenceId: string }
  | { type: 'SENTENCE_GET_OK'; sentence: SentenceSummary }
  | { type: 'SENTENCE_GET_ERROR'; sentenceId: string; reason: 'not_found' }
  // PronunciationPlayer가 Web Audio API로 직접 decodeAudioData하므로 data: URL이 아니라
  // raw base64로 보낸다 — data: URL로 감싸면 웹에서 다시 base64ToArrayBuffer 전에 벗겨내야 한다.
  | { type: 'AUDIO_READY'; sentenceId: string; base64: string }
  | { type: 'AUDIO_ERROR'; sentenceId: string; reason: 'offline' | 'not_found' };
