import generatedValidate from './generated/validateTextureRecipe';

import {
  appendJsonPointer,
  duplicatePropertyDiagnostic,
  inputTooLargeDiagnostic,
  mapSchemaErrors,
  parseFailureDiagnostic,
  type SchemaValidationError,
  type ValidationDiagnostic,
  type ValidationResult,
} from './diagnostics';

/** Keep import payloads bounded before any parser work occurs. */
export const MAX_RECIPE_JSON_BYTES = 1_048_576;
const MAX_JSON_DEPTH = 128;

type StandaloneValidator = ((value: unknown) => boolean) & {
  errors?: readonly SchemaValidationError[] | null;
};

const standaloneValidator = generatedValidate as unknown as StandaloneValidator;

export type ParsedJsonResult =
  { ok: true; value: unknown } | { ok: false; diagnostics: ValidationDiagnostic[] };

type JsonRecord = { [key: string]: JsonValue };
type JsonValue = null | boolean | number | string | JsonValue[] | JsonRecord;

class JsonSyntaxError extends Error {
  readonly position: number;

  constructor(position: number) {
    super('invalid JSON');
    this.name = 'JsonSyntaxError';
    this.position = position;
  }
}

type DuplicateProperty = { path: string; key: string };

class JsonParser {
  private index = 0;
  private readonly duplicateProperties: DuplicateProperty[] = [];
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse(): { value: JsonValue; duplicateProperties: DuplicateProperty[] } {
    this.skipWhitespace();
    const value = this.parseValue('', 0);
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new JsonSyntaxError(this.index);
    return { value, duplicateProperties: this.duplicateProperties };
  }

  private parseValue(path: string, depth: number): JsonValue {
    if (depth > MAX_JSON_DEPTH) throw new JsonSyntaxError(this.index);
    this.skipWhitespace();
    const character = this.source[this.index];
    if (character === '{') return this.parseObject(path, depth + 1);
    if (character === '[') return this.parseArray(path, depth + 1);
    if (character === '"') return this.parseString();
    if (character === 't' && this.consumeLiteral('true')) return true;
    if (character === 'f' && this.consumeLiteral('false')) return false;
    if (character === 'n' && this.consumeLiteral('null')) return null;
    return this.parseNumber();
  }

  private parseObject(path: string, depth: number): JsonRecord {
    this.index += 1;
    const result: JsonRecord = {};
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.consume('}')) return result;

    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') throw new JsonSyntaxError(this.index);
      const key = this.parseString();
      const keyPath = appendJsonPointer(path, key);
      if (keys.has(key)) this.duplicateProperties.push({ path: keyPath, key });
      keys.add(key);
      this.skipWhitespace();
      if (!this.consume(':')) throw new JsonSyntaxError(this.index);
      const value = this.parseValue(keyPath, depth);
      // defineProperty avoids the special __proto__ setter while retaining JSON's
      // own-property semantics for hostile but syntactically valid input.
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.skipWhitespace();
      if (this.consume('}')) return result;
      if (!this.consume(',')) throw new JsonSyntaxError(this.index);
    }
  }

  private parseArray(path: string, depth: number): JsonValue[] {
    this.index += 1;
    const result: JsonValue[] = [];
    this.skipWhitespace();
    if (this.consume(']')) return result;

    while (true) {
      const itemPath = appendJsonPointer(path, String(result.length));
      result.push(this.parseValue(itemPath, depth));
      this.skipWhitespace();
      if (this.consume(']')) return result;
      if (!this.consume(',')) throw new JsonSyntaxError(this.index);
    }
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === '"') {
        this.index += 1;
        try {
          return JSON.parse(this.source.slice(start, this.index)) as string;
        } catch {
          throw new JsonSyntaxError(start);
        }
      }
      if (character === '\\') {
        this.index += 1;
        const escape = this.source[this.index];
        if (escape === 'u') {
          const code = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(code)) throw new JsonSyntaxError(this.index);
          this.index += 5;
          continue;
        }
        if (
          escape !== '"' &&
          escape !== '\\' &&
          escape !== '/' &&
          escape !== 'b' &&
          escape !== 'f' &&
          escape !== 'n' &&
          escape !== 'r' &&
          escape !== 't'
        ) {
          throw new JsonSyntaxError(this.index);
        }
        this.index += 1;
        continue;
      }
      if (character !== undefined && character.charCodeAt(0) < 0x20) {
        throw new JsonSyntaxError(this.index);
      }
      this.index += 1;
    }
    throw new JsonSyntaxError(start);
  }

  private parseNumber(): number {
    const match = this.source
      .slice(this.index)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (match === null) throw new JsonSyntaxError(this.index);
    this.index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) throw new JsonSyntaxError(this.index);
    return number;
  }

  private consumeLiteral(literal: string): boolean {
    if (!this.source.startsWith(literal, this.index)) return false;
    this.index += literal.length;
    return true;
  }

  private consume(character: string): boolean {
    if (this.source[this.index] !== character) return false;
    this.index += 1;
    return true;
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) break;
      this.index += 1;
    }
  }
}

/** Validate an already-parsed candidate against the generated Draft 2020-12 validator. */
export function validateRecipeShape(value: unknown): ValidationResult {
  const valid = standaloneValidator(value);
  if (valid) return { ok: true };
  return {
    ok: false,
    diagnostics: mapSchemaErrors(standaloneValidator.errors),
  };
}

/** Parse bounded JSON while rejecting duplicate keys at every object depth. */
export function parseRecipeText(text: string): ParsedJsonResult {
  if (typeof text !== 'string') return { ok: false, diagnostics: [parseFailureDiagnostic()] };
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_RECIPE_JSON_BYTES) {
    return { ok: false, diagnostics: [inputTooLargeDiagnostic(MAX_RECIPE_JSON_BYTES)] };
  }

  try {
    const parsed = new JsonParser(text).parse();
    if (parsed.duplicateProperties.length > 0) {
      const duplicateProperties = [...parsed.duplicateProperties].sort(
        (left, right) =>
          left.path.localeCompare(right.path, 'en') || left.key.localeCompare(right.key, 'en'),
      );
      return {
        ok: false,
        diagnostics: duplicateProperties.map(({ path, key }) =>
          duplicatePropertyDiagnostic(path, key),
        ),
      };
    }
    return { ok: true, value: parsed.value };
  } catch {
    return { ok: false, diagnostics: [parseFailureDiagnostic()] };
  }
}

export { mapSchemaErrors };
export type { ValidationDiagnostic, ValidationResult } from './diagnostics';
