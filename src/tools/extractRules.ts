import type { CtaStyle } from "../config/schema.js";

export type ExtractInput = {
  approved: string[];
  rejected?: string[];
};

export type ExtractOutput = {
  suggestions: {
    sentence_case: boolean;
    proper_nouns: string[];
    forbidden_words: string[];
    forbid_exclamation: boolean;
    forbid_superlatives: boolean;
    cta_style: CtaStyle;
  };
  notes: {
    sentence_case: string;
    proper_nouns: string;
    forbidden_words: string;
    exclamation: string;
    superlatives: string;
    cta_style: string;
  };
  sample_size: { approved: number; rejected: number };
};

const CTA_VERB_RE =
  /\b(join|get started|sign up|learn more|try|start|book|contact|register|subscribe|download|request|read more|view|see|explore|discover|build|create|make|launch|go|click|tap)\b(?:\s+[A-Za-z][\w'-]*){0,2}/gi;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
}

function detectCapitalizedMidSentence(text: string): string[] {
  const flagged: string[] = [];
  let i = 0;
  let atSentenceStart = true;

  while (i < text.length) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[.!?]/.test(ch)) {
      while (i < text.length && /[.!?\s]/.test(text[i])) i++;
      atSentenceStart = true;
      continue;
    }

    const start = i;
    while (i < text.length && !/\s/.test(text[i]) && !/[.!?]/.test(text[i])) {
      i++;
    }
    const word = text.slice(start, i);

    if (atSentenceStart) {
      atSentenceStart = false;
      continue;
    }

    if (/^[A-Z]/.test(word)) {
      flagged.push(word);
    }
  }

  return flagged;
}

function analyzeSentenceCase(approved: string[]): { suggestion: boolean; note: string } {
  let sentenceCaseCount = 0;
  let titleCaseCount = 0;
  let sentenceTotal = 0;
  for (const sample of approved) {
    const sentences = sample.split(/(?<=[.!?\n])\s+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w) && w.length > 3);
      if (words.length < 2) continue;
      sentenceTotal++;
      const capitalized = words.filter((w) => /^[A-Z]/.test(w)).length;
      const startsCapitalized = /^[A-Z]/.test(words[0]);
      if (capitalized === 1 && startsCapitalized) {
        sentenceCaseCount++;
      } else if (capitalized >= words.length * 0.6) {
        titleCaseCount++;
      } else {
        sentenceCaseCount++;
      }
    }
  }
  const suggestion = sentenceCaseCount >= titleCaseCount;
  const note =
    sentenceTotal === 0
      ? "no analyzable sentences."
      : `${sentenceCaseCount} sentence-case / ${titleCaseCount} title-case across ${sentenceTotal} sentences.`;
  return { suggestion, note };
}

function extractProperNounCandidates(approved: string[]): { candidates: string[]; note: string } {
  const counts = new Map<string, number>();
  for (const sample of approved) {
    const detected = detectCapitalizedMidSentence(sample);
    for (const word of detected) {
      const lower = word.toLowerCase();
      counts.set(lower, (counts.get(lower) || 0) + 1);
    }
  }
  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
  const note =
    candidates.length === 0
      ? "no capitalized mid-sentence words recurring across 2+ samples."
      : `${candidates.length} candidate(s) (appearing in 2+ samples).`;
  return { candidates, note };
}

function extractForbiddenCandidates(
  approved: string[],
  rejected: string[]
): { candidates: string[]; note: string } {
  if (rejected.length === 0) {
    return { candidates: [], note: "no rejected samples provided — cannot suggest." };
  }
  const approvedWords = new Set<string>();
  for (const sample of approved) {
    for (const word of tokenize(sample)) {
      approvedWords.add(word);
    }
  }
  const candidates = new Set<string>();
  for (const sample of rejected) {
    for (const word of tokenize(sample)) {
      if (word.length <= 3) continue;
      if (approvedWords.has(word)) continue;
      candidates.add(word);
    }
  }
  const sorted = [...candidates].sort();
  const note =
    sorted.length === 0
      ? "no candidates (rejected words all appear in approved)."
      : `${sorted.length} candidate(s) (in rejected, not in approved).`;
  return { candidates: sorted, note };
}

function analyzeExclamation(approved: string[]): { suggestion: boolean; note: string } {
  let count = 0;
  for (const sample of approved) {
    const matches = sample.match(/!/g);
    if (matches) count += matches.length;
  }
  const suggestion = count === 0;
  const note = `${count} exclamation mark(s) across ${approved.length} sample(s).`;
  return { suggestion, note };
}

function analyzeSuperlatives(approved: string[]): { suggestion: boolean; note: string } {
  let count = 0;
  for (const sample of approved) {
    const matches = sample.match(/\b(best|fastest|simplest|greatest|most|ultimate|#1)\b/gi);
    if (matches) count += matches.length;
  }
  const suggestion = count === 0;
  const note = `${count} superlative(s) across ${approved.length} sample(s).`;
  return { suggestion, note };
}

function analyzeCtaStyle(approved: string[]): { suggestion: CtaStyle; note: string } {
  const phrases: string[] = [];
  for (const sample of approved) {
    const matches = sample.match(CTA_VERB_RE);
    if (matches) phrases.push(...matches);
  }
  if (phrases.length === 0) {
    return { suggestion: "free", note: "no CTA-like phrases observed." };
  }
  const wordCounts = phrases.map((p) => p.split(/\s+/).length);
  const avg = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const single = wordCounts.filter((c) => c === 1).length;
  let suggestion: CtaStyle;
  if (single / phrases.length >= 0.7) suggestion = "verb_only";
  else if (avg <= 2.5) suggestion = "verb_noun";
  else suggestion = "free";
  const note = `${phrases.length} CTA-like phrase(s); avg ${avg.toFixed(1)} words; ${single} single-verb.`;
  return { suggestion, note };
}

export function extractRules(input: ExtractInput): ExtractOutput {
  const approved = input.approved;
  const rejected = input.rejected ?? [];

  const sentenceCase = analyzeSentenceCase(approved);
  const properNouns = extractProperNounCandidates(approved);
  const forbidden = extractForbiddenCandidates(approved, rejected);
  const exclamation = analyzeExclamation(approved);
  const superlatives = analyzeSuperlatives(approved);
  const cta = analyzeCtaStyle(approved);

  return {
    suggestions: {
      sentence_case: sentenceCase.suggestion,
      proper_nouns: properNouns.candidates,
      forbidden_words: forbidden.candidates,
      forbid_exclamation: exclamation.suggestion,
      forbid_superlatives: superlatives.suggestion,
      cta_style: cta.suggestion,
    },
    notes: {
      sentence_case: sentenceCase.note,
      proper_nouns: properNouns.note,
      forbidden_words: forbidden.note,
      exclamation: exclamation.note,
      superlatives: superlatives.note,
      cta_style: cta.note,
    },
    sample_size: { approved: approved.length, rejected: rejected.length },
  };
}