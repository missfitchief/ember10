import limits from './catalogue-limits.json' with { type: 'json' };

/** Warn before either bounded resource is exhausted; never relax schema validation. */
export function catalogueCapacity(bytes: number, rows: number) {
  return { bytes, rows, maxBytes: limits.maxBytes, maxRows: limits.maxRows,
    nearLimit: bytes >= limits.maxBytes * limits.warningFraction || rows >= limits.maxRows * limits.warningFraction };
}
