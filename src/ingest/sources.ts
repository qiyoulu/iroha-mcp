import { readFileSync } from "node:fs";

export type IngestSource = {
  path?: string;
  content?: string;
  format_hint?:
    | "w3c-tokens"
    | "tailwind"
    | "css"
    | "markdown"
    | "figma-variables"
    | "auto";
};

export type RecognizedSource = {
  format: "w3c-tokens" | "tailwind" | "css" | "markdown" | "figma-variables" | "unknown";
  raw: string;
  identifier: string;
};

export function readSource(source: IngestSource): RecognizedSource {
  const identifier = source.path ?? "<inline>";
  let raw: string;
  if (source.path) {
    raw = readFileSync(source.path, "utf8");
  } else if (source.content !== undefined) {
    raw = source.content;
  } else {
    throw new Error(`ingest source ${identifier} has neither path nor content`);
  }
  const format = source.format_hint && source.format_hint !== "auto"
    ? source.format_hint
    : detectFormat(raw, identifier);
  return { format, raw, identifier };
}

export function detectFormat(raw: string, identifier: string): RecognizedSource["format"] {
  const filename = identifier.toLowerCase();
  if (filename.endsWith(".tokens.json") || filename.endsWith(".tokens")) return "w3c-tokens";
  if (
    filename.includes("tailwind.config") ||
    /^module\.exports\s*=/m.test(raw) ||
    /^export default/m.test(raw)
  ) {
    if (/theme\s*:/m.test(raw) && /(colors|fontFamily|spacing|borderRadius|boxShadow)/m.test(raw)) {
      return "tailwind";
    }
  }
  if (filename.endsWith(".css") || /:root\s*\{/m.test(raw)) {
    return "css";
  }
  if (filename.endsWith(".md") || filename.endsWith(".markdown") || /^#\s/m.test(raw)) {
    return "markdown";
  }
  if (filename.includes("figma") && /"variables"/m.test(raw)) {
    return "figma-variables";
  }

  if (/"\$\w+"\s*:/m.test(raw) || /"\$\w+"\s*:/m.test(raw)) {
    return "w3c-tokens";
  }
  if (/--[\w-]+\s*:/m.test(raw)) {
    return "css";
  }
  if (/^#\s/m.test(raw) || /^##\s/m.test(raw)) {
    return "markdown";
  }

  return "unknown";
}
