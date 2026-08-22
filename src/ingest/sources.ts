import { readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

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

/**
 * Resolved allowlist of directories that `iroha_ingest` is permitted to read from.
 *
 * Sources:
 *   1. `IROHA_ALLOW_PATH` env var — comma-separated absolute paths. Intended for
 *      docker / launchd / production setups where the user controls the runtime.
 *   2. `process.cwd()` — implicit. Any relative path is resolved against cwd.
 *      A user running `iroha-mcp` from their project directory can ingest files
 *      in that project without extra config.
 *   3. `~/.config/iroha-mcp/` — implicit. The tool's own config directory; users
 *      commonly stash brand materials alongside their config.
 *
 * Anything outside the resolved allowlist is rejected at read time. This is the
 * data-exfiltration guard for the canonical MCP-attacker-controls-the-tool-input
 * threat model — see audit finding #2.
 *
 * Resolved on every call (not memoized at module load) so that process.chdir()
 * in tests and runtime cwd changes are respected without restarting the server.
 */
function resolveAllowlist(): string[] {
  const envPath = process.env.IROHA_ALLOW_PATH;
  const envPaths = envPath
    ? envPath.split(",").map((p) => p.trim()).filter(Boolean).map((p) => resolve(p))
    : [];
  return [
    resolve(process.cwd()),
    resolve(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".config", "iroha-mcp"),
    ...envPaths,
  ];
}

function safeRealpath(p: string): string {
  // realpathSync throws if the path doesn't exist; for the allowlist check
  // we want the canonical form when possible and the input as fallback.
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function isPathAllowed(absPath: string): boolean {
  // Canonicalize both sides through realpath so symlinked paths (macOS
  // /var/folders -> /private/var/folders, /tmp -> /private/tmp, etc.) match.
  // Without this, the allowlist check fails on any path the OS resolves
  // through a symlink — a common case on macOS test runners.
  const target = safeRealpath(absPath);
  const allowedDirs = resolveAllowlist();
  for (const allowedRaw of allowedDirs) {
    const allowed = safeRealpath(allowedRaw);
    if (target === allowed) return true;
    if (target.startsWith(allowed + "/")) return true;
  }
  return false;
}

/**
 * Allowed-path error surfaced to the MCP client. We deliberately do NOT echo
 * the requested path or the allowlist contents back to the client — that would
 * leak the operator's filesystem layout to a potentially-untrusted caller.
 */
class PathNotAllowedError extends Error {
  constructor() {
    super(
      "path is not within an allowed directory. " +
        "set IROHA_ALLOW_PATH (comma-separated absolute paths) to grant access, " +
        "or pass inline `content` instead of `path`."
    );
  }
}

export function readSource(source: IngestSource): RecognizedSource {
  const identifier = source.path ?? "<inline>";
  let raw: string;

  if (source.path) {
    if (!isAbsolute(source.path) && !source.path.startsWith(".")) {
      throw new Error(
        `ingest source ${identifier}: path must be absolute or relative-to-cwd (start with "./" or "../")`
      );
    }
    const abs = resolve(source.path);
    if (!isPathAllowed(abs)) {
      throw new PathNotAllowedError();
    }
    if (!existsSync(abs)) {
      throw new Error(`ingest source ${identifier}: file not found at ${abs}`);
    }
    const stat = statSync(abs);
    if (!stat.isFile()) {
      throw new Error(`ingest source ${identifier}: not a regular file (${abs})`);
    }
    // 10 MB cap. Brand materials (tokens, css, small docs) are typically <100 KB;
    // anything bigger is probably a misconfigured path pointing at a node_modules
    // tree or a log file.
    const MAX_BYTES = 10 * 1024 * 1024;
    if (stat.size > MAX_BYTES) {
      throw new Error(
        `ingest source ${identifier}: file is ${stat.size} bytes; max is ${MAX_BYTES}. ` +
          `split the source or pass inline content instead.`
      );
    }
    raw = readFileSync(abs, "utf8");
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
  if (filename.endsWith(".json5")) return "w3c-tokens";
  if (filename.endsWith(".yml") || filename.endsWith(".yaml")) return "w3c-tokens";
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

  if (/^"?props"?\s*:\s*\{/m.test(raw) || /^"?aliases"?\s*:\s*\{/m.test(raw)) {
    return "w3c-tokens";
  }

  if (/"\$\w+"\s*:/m.test(raw) || /\$value\s*:/m.test(raw) || /\$type\s*:/m.test(raw)) {
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
