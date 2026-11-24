export type GlyphPiece = { char: string; font: string };
export type TextStyle = {
  width: number;
  characterSpacing?: number;
  align?: 'left' | 'right';
};
type Run = { font: string; text: string; width: number };
type Line = { runs: Run[]; width: number; height: number };

const BREAKS_AROUND =
  /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const NO_BREAK_BEFORE = /^[ 、。，．：；！？）」』】〉》・ー…]/u;
const NO_BREAK_AFTER = /[ （「『【〈《]$/u;

const textOf = (pieces: GlyphPiece[]) =>
  pieces.map(({ char }) => char).join('');
const isSpace = (pieces: GlyphPiece[]) =>
  pieces.every(({ char }) => char === ' ');
const isWordChar = (char: string) => char !== ' ' && !BREAKS_AROUND.test(char);

const segmentsOf = (pieces: GlyphPiece[]) => {
  const units: GlyphPiece[][] = [];
  for (const piece of pieces) {
    const last = units.at(-1);
    const previous = last?.at(-1);
    if (last && previous && isWordChar(previous.char) && isWordChar(piece.char))
      last.push(piece);
    else units.push([piece]);
  }

  const segments: GlyphPiece[][] = [];
  for (const unit of units) {
    const last = segments.at(-1);
    if (
      last &&
      (NO_BREAK_BEFORE.test(textOf(unit)) || NO_BREAK_AFTER.test(textOf(last)))
    )
      last.push(...unit);
    else segments.push([...unit]);
  }
  return segments;
};

export const createTextLayout = (
  doc: PDFKit.PDFDocument,
  piecesOf: (text: string) => GlyphPiece[],
) => {
  // https://github.com/foliojs/pdfkit/blob/v0.21.0/docs/text.md#text-measurements
  const runsOf = (pieces: GlyphPiece[], characterSpacing: number): Run[] =>
    pieces
      .reduce<{ font: string; text: string }[]>((runs, { char, font }) => {
        const last = runs.at(-1);
        if (last?.font === font) last.text += char;
        else runs.push({ font, text: char });
        return runs;
      }, [])
      .map((run) => ({
        ...run,
        width:
          doc.font(run.font).widthOfString(run.text, { characterSpacing }) +
          characterSpacing,
      }));
  const widthOf = (pieces: GlyphPiece[], characterSpacing: number) =>
    runsOf(pieces, characterSpacing).reduce((sum, run) => sum + run.width, 0);

  const lineOf = (pieces: GlyphPiece[], characterSpacing: number): Line => {
    const trimmed = [...pieces];
    while (trimmed.at(-1)?.char === ' ') trimmed.pop();
    const runs = runsOf(trimmed, characterSpacing);
    return {
      runs,
      width: runs.reduce((sum, run) => sum + run.width, 0),
      height: Math.max(
        ...runs.map((run) => doc.font(run.font).currentLineHeight(true)),
      ),
    };
  };

  const wrap = (pieces: GlyphPiece[], width: number, characterSpacing = 0) => {
    const lines: GlyphPiece[][] = [];
    let line: GlyphPiece[] = [];
    let lineWidth = 0;
    const place = (segment: GlyphPiece[]) => {
      const segmentWidth = widthOf(segment, characterSpacing);
      if (line.length > 0 && lineWidth + segmentWidth > width) {
        lines.push(line);
        line = [];
        lineWidth = 0;
      }
      if (line.length === 0 && isSpace(segment)) return;
      if (line.length === 0 && segmentWidth > width && segment.length > 1) {
        segment.forEach((piece) => place([piece]));
        return;
      }
      line.push(...segment);
      lineWidth += segmentWidth;
    };
    segmentsOf(pieces).forEach(place);
    if (line.length > 0) lines.push(line);
    return lines.map((entry) => lineOf(entry, characterSpacing));
  };

  const layout = (text: string, { width, characterSpacing }: TextStyle) => {
    const lines = text
      .split('\n')
      .flatMap((paragraph) =>
        wrap(piecesOf(paragraph), width, characterSpacing),
      );
    return {
      lines,
      height: lines.reduce((sum, line) => sum + line.height, 0),
    };
  };

  const draw = (
    lines: Line[],
    x: number,
    top: number,
    { width, characterSpacing = 0, align = 'left' }: TextStyle,
  ) => {
    let y = top;
    for (const line of lines) {
      let cursor = align === 'right' ? x + width - line.width : x;
      for (const run of line.runs) {
        doc
          .font(run.font)
          .text(run.text, cursor, y, { lineBreak: false, characterSpacing });
        cursor += run.width;
      }
      y += line.height;
    }
  };

  return { layout, draw };
};
