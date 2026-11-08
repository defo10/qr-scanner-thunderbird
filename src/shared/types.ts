export type CodeFormat = 'DataMatrix' | 'QRCode' | 'MicroQRCode' | 'rMQRCode' | 'Aztec' | 'PDF417';
export type ContentKind = 'Text' | 'Binary' | 'GS1' | 'ISO15434' | 'Mixed' | 'UnknownECI';

export interface DecodedCode {
  readonly format: CodeFormat;
  /** Raw decoded text; control characters such as the GS1 separator \x1D are kept. */
  readonly text: string;
  /** Raw payload bytes, Base64-encoded. */
  readonly bytesB64: string;
  readonly contentKind: ContentKind;
  /** ISO/IEC 15424 identifier, e.g. "]d2" for GS1 Data Matrix. */
  readonly symbologyId: string;
}

export type SourceRef =
  | { readonly kind: 'attachment'; readonly name: string; readonly partName: string; readonly page?: number }
  | { readonly kind: 'inline'; readonly name: string; readonly partName?: string; readonly dataUriIndex?: number };

export type ErrorReason =
  | 'too-large' | 'page-limit' | 'timeout' | 'unreadable'
  | 'encrypted-pdf' | 'unsupported-type';

export interface SourceError {
  readonly source: SourceRef;
  readonly reason: ErrorReason;
  readonly detail?: Readonly<Record<string, number>>;
}

export interface ScanEntry extends DecodedCode {
  readonly sources: readonly SourceRef[];
}
