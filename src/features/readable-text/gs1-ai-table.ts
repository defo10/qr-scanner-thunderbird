export interface AiSpec {
  /** Exact data length for fixed-length AIs, otherwise the maximum length. */
  readonly length: number;
  readonly fixed: boolean;
}

const fixed = (length: number): AiSpec => ({ length, fixed: true });
const upTo = (length: number): AiSpec => ({ length, fixed: false });

const digitRange = (prefix: string, from = 0, to = 9) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

const entries: [readonly string[], AiSpec][] = [
  [['00'], fixed(18)],
  [['01', '02', '03'], fixed(14)],
  [['04'], fixed(16)],
  [['10', '21', '22'], upTo(20)],
  [['11', '12', '13', '15', '16', '17'], fixed(6)],
  [['20'], fixed(2)],
  [['235'], upTo(28)],
  [['240', '241', '250', '251', '400', '401', '403'], upTo(30)],
  [['242'], upTo(6)],
  [['243', '254', '420'], upTo(20)],
  [['253'], upTo(30)],
  [['255'], upTo(25)],
  [['30', '37'], upTo(8)],
  // Trade measures: 3-digit AI family plus one digit for the decimal point position.
  [['310', '311', '312', '313', '314', '315', '316', '320', '321', '322', '323', '324', '325', '326', '327', '328', '329',
    '330', '331', '332', '333', '334', '335', '336', '337', '340', '341', '342', '343', '344', '345', '346', '347', '348', '349',
    '350', '351', '352', '353', '354', '355', '356', '357', '360', '361', '362', '363', '364', '365', '366', '367', '368', '369',
  ].flatMap(p => digitRange(p)), fixed(6)],
  [digitRange('390'), upTo(15)],
  [digitRange('391'), upTo(18)],
  [digitRange('392'), upTo(15)],
  [digitRange('393'), upTo(18)],
  [digitRange('394'), fixed(4)],
  [digitRange('395'), fixed(6)],
  [['402'], fixed(17)],
  [digitRange('41', 0, 7), fixed(13)],
  [['421'], upTo(12)],
  [['422', '424', '426'], fixed(3)],
  [['423', '425'], upTo(15)],
  [['427'], upTo(3)],
  [['7001'], fixed(13)],
  [['7002'], upTo(30)],
  [['7003'], fixed(10)],
  [['7004'], upTo(4)],
  [['7005'], upTo(12)],
  [['7006'], fixed(6)],
  [['7007'], upTo(12)],
  [['7008'], upTo(3)],
  [['7009'], upTo(10)],
  [['7010'], upTo(2)],
  [['7020', '7021', '7022'], upTo(20)],
  [['7023'], upTo(30)],
  [digitRange('703'), upTo(30)],
  [digitRange('71', 0, 7), upTo(20)],
  [['7240'], upTo(20)],
  [['8001'], fixed(14)],
  [['8002', '8012'], upTo(20)],
  [['8003'], upTo(30)],
  [['8004'], upTo(30)],
  [['8005'], fixed(6)],
  [['8006', '8017', '8018', '8026'], fixed(18)],
  [['8007'], upTo(34)],
  [['8008'], upTo(12)],
  [['8009'], upTo(50)],
  [['8010'], upTo(30)],
  [['8011'], upTo(12)],
  [['8013', '8020'], upTo(25)],
  [['8019'], upTo(10)],
  [['8030'], upTo(90)],
  [['8110', '8112', '8200'], upTo(70)],
  [['8111'], fixed(4)],
  [['90'], upTo(30)],
  [digitRange('9', 1, 9), upTo(90)],
];

// GS1 Application Identifiers are prefix-free, so the first 2-, 3- or 4-digit
// prefix found in the table is the AI.
export const AI_TABLE: ReadonlyMap<string, AiSpec> = new Map(entries.flatMap(([ais, spec]) => ais.map(ai => [ai, spec] as const)));
