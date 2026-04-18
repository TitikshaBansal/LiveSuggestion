export type SuggestionType =
  | 'question_to_ask'
  | 'talking_point'
  | 'answer_to_question'
  | 'fact_check'
  | 'clarification';

export interface SuggestionCard {
  id: string;
  type: SuggestionType;
  title: string;
  preview: string;
}

export interface SuggestionBatch {
  id: string;
  t: string;
  cards: SuggestionCard[];
}

export interface TranscriptLine {
  id: string;
  t: string;
  text: string;
}

export type ChatRole = 'user' | 'assistant';

// `kind` is only set on user messages — tells the UI/export whether a
// message came from the text box or from tapping a suggestion card.
export type ChatMessageKind = 'typed' | 'card_click';

export interface ChatMessage {
  id: string;
  t: string;
  role: ChatRole;
  content: string;
  kind?: ChatMessageKind;
  linkedCardId?: string;
  streaming?: boolean;
}

export interface Settings {
  groqKey: string;
  suggestionsPrompt: string;
  expandPrompt: string;
  chatPrompt: string;
  suggestionsWindowChars: number;
  expandWindowChars: number;
  refreshIntervalMs: number;
}

export interface SuggestionsRequestBody {
  recentTranscript: string;
  earlierTranscript: string;
  previousSuggestions: { type: SuggestionType; title: string; preview: string }[];
  systemPrompt: string;
}

export interface ExpandRequestBody {
  transcript: string;
  card: { type: SuggestionType; title: string; preview: string };
  systemPrompt: string;
}

export interface ChatRequestBody {
  transcript: string;
  history: { role: ChatRole; content: string }[];
  message: string;
  systemPrompt: string;
}

export interface ExportConfig {
  models: { transcription: string; chat: string };
  contextWindows: { suggestionsChars: number; expandChars: number };
  refreshIntervalMs: number;
  prompts: { suggestions: string; expand: string; chat: string };
}

export interface SessionExport {
  recordingStart: string;
  recordingEnd: string | null;
  exportedAt: string;
  config: ExportConfig;
  transcript: { t: string; text: string }[];
  suggestionBatches: {
    t: string;
    cards: { id: string; type: SuggestionType; title: string; preview: string }[];
  }[];
  chat: {
    id: string;
    t: string;
    role: ChatRole;
    content: string;
    kind?: ChatMessageKind;
    linkedCardId?: string;
  }[];
}
