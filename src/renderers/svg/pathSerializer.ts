/** Renderer-facing structural command shape shared with domain PathIR. */
export type PathCommand =
  | Readonly<{ kind: 'move'; x: number; y: number }>
  | Readonly<{ kind: 'line'; x: number; y: number }>
  | Readonly<{
      kind: 'cubic';
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x: number;
      y: number;
    }>
  | Readonly<{ kind: 'close' }>;

const QUANTIZATION_SCALE = 1_000_000;

const quantize = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  const rounded = Math.round(value * QUANTIZATION_SCALE) / QUANTIZATION_SCALE;
  if (!Number.isFinite(rounded)) throw new RangeError(`${label} exceeds safe precision.`);
  return Object.is(rounded, -0) ? 0 : rounded;
};

const number = (value: number, label: string): string => quantize(value, label).toString();

/** Serialize validated absolute PathIR commands as deterministic compact SVG data. */
export function serializePathCommands(commands: readonly PathCommand[]): string {
  if (!Array.isArray(commands) || commands.length < 2) {
    throw new RangeError('SVG path commands must contain a move and close command.');
  }

  // Normalize and validate the complete input before emitting any output.
  const normalized = commands.map((command, index): PathCommand => {
    if (typeof command !== 'object' || command === null || typeof command.kind !== 'string') {
      throw new TypeError(`SVG path command ${index} is invalid.`);
    }
    switch (command.kind) {
      case 'move':
        return {
          kind: 'move',
          x: quantize(command.x, `commands[${index}].x`),
          y: quantize(command.y, `commands[${index}].y`),
        };
      case 'line':
        return {
          kind: 'line',
          x: quantize(command.x, `commands[${index}].x`),
          y: quantize(command.y, `commands[${index}].y`),
        };
      case 'cubic':
        return {
          kind: 'cubic',
          c1x: quantize(command.c1x, `commands[${index}].c1x`),
          c1y: quantize(command.c1y, `commands[${index}].c1y`),
          c2x: quantize(command.c2x, `commands[${index}].c2x`),
          c2y: quantize(command.c2y, `commands[${index}].c2y`),
          x: quantize(command.x, `commands[${index}].x`),
          y: quantize(command.y, `commands[${index}].y`),
        };
      case 'close':
        return { kind: 'close' };
      default:
        throw new RangeError(`SVG path command ${index} kind is unsupported.`);
    }
  });

  if (normalized[0]?.kind !== 'move') {
    throw new RangeError('SVG path commands must start with move.');
  }
  if (normalized.at(-1)?.kind !== 'close') {
    throw new RangeError('SVG path commands must end with close.');
  }
  if (
    normalized.slice(1, -1).some((command) => command.kind === 'move' || command.kind === 'close')
  ) {
    throw new RangeError(
      'SVG path commands may contain only line or cubic segments between move and close.',
    );
  }

  return normalized
    .map((command) => {
      switch (command.kind) {
        case 'move':
          return `M ${number(command.x, 'move.x')} ${number(command.y, 'move.y')}`;
        case 'line':
          return `L ${number(command.x, 'line.x')} ${number(command.y, 'line.y')}`;
        case 'cubic':
          return `C ${number(command.c1x, 'cubic.c1x')} ${number(command.c1y, 'cubic.c1y')} ${number(command.c2x, 'cubic.c2x')} ${number(command.c2y, 'cubic.c2y')} ${number(command.x, 'cubic.x')} ${number(command.y, 'cubic.y')}`;
        case 'close':
          return 'Z';
      }
    })
    .join(' ');
}
