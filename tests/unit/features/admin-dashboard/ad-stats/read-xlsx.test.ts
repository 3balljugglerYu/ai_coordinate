/** @jest-environment node */

/**
 * .xlsx の最小限の読み込み（X の広告の書き出しを、依存を足さずに読む）。
 *
 * ここで守ること:
 *  - 共有文字列・その場の文字列・数字のセルを、列の位置どおりに読む（空いた列は空文字）
 *  - ふりがな（rPh）は値に混ぜない。XML の文字参照はもとの文字に戻す
 *  - シート名は workbook の順、場所は rels で引く
 *  - zip でない・workbook が無い・中身が壊れているときは XlsxReadError で止める
 */

jest.mock("server-only", () => ({}));

import { deflateRawSync } from "node:zlib";
import { readXlsx, XlsxReadError } from "@/features/admin-dashboard/lib/ad-stats/read-xlsx";

/** テスト用の小さな zip を作る（CRC は読み手が見ないので 0） */
function buildZip(files: Record<string, string>, method: 0 | 8 = 8): Uint8Array {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    parts.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Ads" sheetId="1" r:id="rId1"/><sheet name="Age" sheetId="2" r:id="rId2"/></sheets></workbook>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId1" Type="worksheet" Target="/xl/worksheets/sheet1.xml"/>
</Relationships>`;

const SHARED = `<?xml version="1.0" encoding="UTF-8"?>
<sst><si><t>Ad name</t></si><si><r><t>変身</t></r><r><t xml:space="preserve">_正方形</t></r><rPh sb="0" eb="2"><t>ヘンシン</t></rPh></si><si><t>A&amp;B &lt;1&gt;</t></si></sst>`;

const SHEET1 = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Spend</t></is></c></row>
<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"/><c r="C2"><v>453.88</v></c></row>
<row r="3"><c r="A3" t="s"><v>2</v></c><c r="C3"><v>0</v></c></row>
<row r="4"></row>
</sheetData></worksheet>`;

const SHEET2 = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Age</t></is></c></row></sheetData></worksheet>`;

const FILES = {
  "xl/workbook.xml": WORKBOOK,
  "xl/_rels/workbook.xml.rels": RELS,
  "xl/sharedStrings.xml": SHARED,
  "xl/worksheets/sheet1.xml": SHEET1,
  "xl/worksheets/sheet2.xml": SHEET2,
};

describe("readXlsx", () => {
  it("シートを workbook の順に、セルを列の位置どおりに読む", () => {
    const sheets = readXlsx(buildZip(FILES));

    expect(sheets.map((sheet) => sheet.name)).toEqual(["Ads", "Age"]);
    expect(sheets[0].rows).toEqual([
      ["Ad name", "", "Spend"],
      ["変身_正方形", "", "453.88"],
      ["A&B <1>", "", "0"],
    ]);
    expect(sheets[1].rows).toEqual([["Age"]]);
  });

  it("圧縮していない zip の中身も読める", () => {
    expect(readXlsx(buildZip(FILES, 0))[0].rows[1][0]).toBe("変身_正方形");
  });

  it("zip でないファイルは XlsxReadError で止める", () => {
    expect(() => readXlsx(new TextEncoder().encode("Ad name,Spend\nx,1\n"))).toThrow(
      XlsxReadError,
    );
  });

  it("workbook が無い zip は XlsxReadError で止める", () => {
    const rest: Record<string, string> = { ...FILES };
    delete rest["xl/workbook.xml"];
    expect(() => readXlsx(buildZip(rest))).toThrow("workbook がありません");
  });

  it("目次の指す位置が壊れていれば XlsxReadError で止める", () => {
    const zip = buildZip(FILES);
    // 最初の中身のローカルヘッダの印を壊す
    zip[0] = 0;
    expect(() => readXlsx(zip)).toThrow(XlsxReadError);
  });
});
