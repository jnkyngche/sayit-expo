import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { audioFile } from './audio-store';
import type { SpeakParams } from './tts-api';
import type { AudioState, Folder, SentenceSummary, Word } from '../bridge/webMessages';

const PAGE_SIZE = 30;

type SentenceRow = {
  id: string;
  text: string;
  phonetic: string | null;
  words: string | null;
  folder_id: string;
  audio_key: string;
  audio_state: AudioState;
  saved_at: number;
  voice: string;
  speed: number;
};

function toSentenceSummary(row: SentenceRow): SentenceSummary {
  return {
    id: row.id,
    text: row.text,
    phonetic: row.phonetic,
    words: row.words ? (JSON.parse(row.words) as Word[]) : null,
    folderId: row.folder_id,
    audioState: row.audio_state,
    savedAt: row.saved_at,
    voice: row.voice,
    speed: row.speed,
  };
}

export const db = SQLite.openDatabaseSync('sayit.db');

export function migrateDb() {
  // SQLite는 커넥션마다 외래키 제약이 기본 OFF다. 이걸 안 켜면 스키마의
  // ON DELETE CASCADE가 조용히 무시되고 folder를 지워도 문장이 안 지워진다.
  db.execSync('PRAGMA foreign_keys = ON;');

  db.execSync(`
    CREATE TABLE IF NOT EXISTS folder (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_sentence (
      id          TEXT PRIMARY KEY,
      text        TEXT NOT NULL,
      phonetic    TEXT,
      words       TEXT,                                  -- JSON: Word[] ({text, phonetic, start?, end?})
      folder_id   TEXT NOT NULL REFERENCES folder(id) ON DELETE CASCADE,
      audio_key   TEXT NOT NULL,
      audio_state TEXT NOT NULL DEFAULT 'none',
      saved_at    INTEGER NOT NULL,
      voice       TEXT NOT NULL,                         -- ensureAudio가 파일 유실 시 재생성할 때 필요
      speed       REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sentence_folder
      ON saved_sentence(folder_id, saved_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sentence_key
      ON saved_sentence(audio_key);
  `);

  // 부팅 시 1회 — 다운로드 중에 앱이 죽어 영원히 'downloading'으로 남은 행을 되돌린다.
  db.runSync("UPDATE saved_sentence SET audio_state = 'none' WHERE audio_state = 'downloading'");
}

export function deleteSentence(id: string) {
  db.withTransactionSync(() => {
    const row = db.getFirstSync<{ audio_key: string }>(
      'SELECT audio_key FROM saved_sentence WHERE id = ?',
      [id]
    );
    if (!row) return;

    db.runSync('DELETE FROM saved_sentence WHERE id = ?', [id]);

    const { n } = db.getFirstSync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM saved_sentence WHERE audio_key = ?',
      [row.audio_key]
    )!;
    // 이 키를 쓰는 마지막 행이 지워졌을 때만 파일을 삭제한다 — 다른 폴더에 같은
    // 문장이 남아 있으면 그쪽 재생이 깨진다.
    if (n === 0) {
      const file = audioFile(row.audio_key);
      if (file.exists) file.delete();
    }
  });
}

export function listFolders(): Folder[] {
  const rows = db.getAllSync<{ id: string; name: string; sentence_count: number }>(`
    SELECT folder.id, folder.name, COUNT(saved_sentence.id) AS sentence_count
    FROM folder
    LEFT JOIN saved_sentence ON saved_sentence.folder_id = folder.id
    GROUP BY folder.id
    ORDER BY folder.created_at ASC
  `);
  return rows.map((row) => ({ id: row.id, name: row.name, sentenceCount: row.sentence_count }));
}

export function createFolder(name: string): Folder {
  const id = Crypto.randomUUID();
  db.runSync('INSERT INTO folder (id, name, created_at) VALUES (?, ?, ?)', [id, name, Date.now()]);
  return { id, name, sentenceCount: 0 };
}

export function getSentenceById(sentenceId: string): SentenceSummary | null {
  const row = db.getFirstSync<SentenceRow>('SELECT * FROM saved_sentence WHERE id = ?', [sentenceId]);
  return row ? toSentenceSummary(row) : null;
}

export function listSentences(
  folderId: string,
  cursor?: string
): { sentences: SentenceSummary[]; nextCursor: string | null } {
  const rows = cursor
    ? db.getAllSync<SentenceRow>(
        'SELECT * FROM saved_sentence WHERE folder_id = ? AND saved_at < ? ORDER BY saved_at DESC LIMIT ?',
        [folderId, Number(cursor), PAGE_SIZE]
      )
    : db.getAllSync<SentenceRow>(
        'SELECT * FROM saved_sentence WHERE folder_id = ? ORDER BY saved_at DESC LIMIT ?',
        [folderId, PAGE_SIZE]
      );

  const nextCursor = rows.length === PAGE_SIZE ? String(rows[rows.length - 1].saved_at) : null;
  return { sentences: rows.map(toSentenceSummary), nextCursor };
}

export function insertSentence(params: {
  folderId: string;
  text: string;
  phonetic?: string;
  words?: Word[];
  audioKey: string;
  voice: string;
  speed: number;
}): SentenceSummary {
  const id = Crypto.randomUUID();
  const savedAt = Date.now();
  db.runSync(
    `INSERT INTO saved_sentence
       (id, text, phonetic, words, folder_id, audio_key, audio_state, saved_at, voice, speed)
     VALUES (?, ?, ?, ?, ?, ?, 'none', ?, ?, ?)`,
    [
      id,
      params.text,
      params.phonetic ?? null,
      params.words ? JSON.stringify(params.words) : null,
      params.folderId,
      params.audioKey,
      savedAt,
      params.voice,
      params.speed,
    ]
  );
  return {
    id,
    text: params.text,
    phonetic: params.phonetic ?? null,
    words: params.words ?? null,
    folderId: params.folderId,
    audioState: 'none',
    savedAt,
    voice: params.voice,
    speed: params.speed,
  };
}

/** AUDIO_REQUEST/AUDIO_PREFETCH에서 ensureAudio를 호출하기 위해 필요한 값 전부. */
export function getSentenceSpeakParams(
  sentenceId: string
): { audioKey: string; params: SpeakParams } | null {
  const row = db.getFirstSync<{ audio_key: string; text: string; voice: string; speed: number }>(
    'SELECT audio_key, text, voice, speed FROM saved_sentence WHERE id = ?',
    [sentenceId]
  );
  if (!row) return null;
  return { audioKey: row.audio_key, params: { text: row.text, voice: row.voice, speed: row.speed } };
}
