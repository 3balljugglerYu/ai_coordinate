/**
 * 広告の書き出し（Meta の CSV・X の xlsx を表にしたもの）を、日ごとの行にそろえる。
 *
 * ここで守ること:
 *  - Meta は広告名で広告を見分け、年齢・性別・配置の内訳を行にする（合計の行・0の日は捨てる）
 *  - 年齢と性別を同時に選んだ書き出しは、年齢の行・性別の行に足し合わせる（リーチは二重になるので null）
 *  - X は広告ごとのシートを内訳なしの行に、年齢などのシートを「書き出し全体」の行にする
 *  - 日ごとでない・列が足りない・どちらの形でもない書き出しは、黙って入れずに止める
 */

import { parseCsv } from "@/features/admin-dashboard/lib/ad-stats/parse-csv";
import {
  AdExportFormatError,
  parseAdExport,
  type AdExportTable,
} from "@/features/admin-dashboard/lib/ad-stats/parse-ad-export";

const csv = (text: string): AdExportTable[] => [{ name: "", rows: parseCsv(text) }];

const META_HEAD =
  "レポート開始日,レポート終了日,広告名,年齢,消化金額 (JPY),インプレッション,リーチ,リンククリック,ランディングページビュー";

describe("parseCsv", () => {
  it("引用符の中のカンマ・改行・二重の引用符と、BOM・CRLF・空の行を扱う", () => {
    expect(parseCsv('﻿a,b\r\n"x,1","line\nnext"\r\n\r\n"say ""hi""",\n')).toEqual([
      ["a", "b"],
      ["x,1", "line\nnext"],
      ['say "hi"', ""],
    ]);
  });
});

describe("parseAdExport: Meta", () => {
  it("年齢別の日ごとの書き出しを、広告名で見分けた年齢の行にする", () => {
    const parsed = parseAdExport(
      csv(
        [
          META_HEAD,
          "2026-10-29,2026-10-29,90作品,45-54,376,492,457,21,18",
          "2026-10-29,2026-10-29,90作品,Unknown,1,3,3,,",
          "2026-10-28,2026-10-28,変身動画,25-34,0,0,0,0,0",
          ",,,,377,495,460,21,18",
        ].join("\n"),
      ),
    );

    expect(parsed.platform).toBe("meta");
    expect(parsed.ads).toEqual([{ platform: "meta", adKey: "name:90作品", adName: "90作品" }]);
    expect(parsed.rows).toEqual([
      {
        platform: "meta",
        statDate: "2026-10-29",
        adKey: "name:90作品",
        adName: "90作品",
        breakdownType: "age",
        breakdownValue: "45-54",
        spendJpy: 376,
        impressions: 492,
        reach: 457,
        linkClicks: 21,
        landingPageViews: 18,
        videoViews: null,
      },
      expect.objectContaining({ breakdownValue: "unknown", spendJpy: 1, linkClicks: 0 }),
    ]);
  });

  it("年齢と性別を同時に選んだ書き出しは、年齢・性別それぞれに足し合わせ、リーチは null にする", () => {
    const head = "レポート開始日,レポート終了日,広告名,年齢,性別,消化金額 (JPY),インプレッション,リーチ";
    const parsed = parseAdExport(
      csv(
        [
          head,
          "2026-10-29,2026-10-29,A,25-34,female,100,10,9",
          "2026-10-29,2026-10-29,A,25-34,male,50,5,5",
          "2026-10-29,2026-10-29,A,35-44,male,30,3,3",
        ].join("\n"),
      ),
    );
    const pick = (type: string, value: string) =>
      parsed.rows.find((row) => row.breakdownType === type && row.breakdownValue === value);

    expect(pick("age", "25-34")).toMatchObject({ spendJpy: 150, impressions: 15, reach: null });
    expect(pick("age", "35-44")).toMatchObject({ spendJpy: 30, reach: 3 });
    expect(pick("gender", "male")).toMatchObject({ spendJpy: 80, impressions: 8, reach: null });
    expect(pick("gender", "female")).toMatchObject({ spendJpy: 100, reach: 9 });
  });

  it("配置別の書き出しは、プラットフォーム・配置・端末をつないだ値にする", () => {
    const head =
      "レポート開始日,レポート終了日,広告名,プラットフォーム,配置,デバイスプラットフォーム,消化金額 (JPY),インプレッション";
    const parsed = parseAdExport(
      csv([head, "2026-10-29,2026-10-29,A,Instagram,フィード,アプリ内,13,3"].join("\n")),
    );
    expect(parsed.rows[0]).toMatchObject({
      breakdownType: "placement",
      breakdownValue: "Instagram / フィード / アプリ内",
      linkClicks: null,
      landingPageViews: null,
    });
  });

  it("期間をまとめた（日ごとでない）書き出しは止める", () => {
    expect(() =>
      parseAdExport(csv([META_HEAD, "2026-09-25,2026-10-24,A,25-34,10,10,10,1,1"].join("\n"))),
    ).toThrow("日ごとの書き出しではありません");
  });

  it("消化金額の列が数字でなければ止める", () => {
    expect(() =>
      parseAdExport(csv([META_HEAD, "2026-10-29,2026-10-29,A,25-34,abc,10,10,1,1"].join("\n"))),
    ).toThrow(AdExportFormatError);
  });

  it("必要な列（インプレッション）が無ければ止める", () => {
    expect(() =>
      parseAdExport(
        csv("レポート開始日,レポート終了日,広告名,消化金額 (JPY)\n2026-10-29,2026-10-29,A,1"),
      ),
    ).toThrow("「インプレッション」の列がありません");
  });
});

describe("parseAdExport: X", () => {
  const adSheet: AdExportTable = {
    name: "Ads",
    rows: [
      ["Time period", "Ad ID", "Ad name", "Impressions", "Spend", "Link clicks", "Video views"],
      ["2026-10-24", "111", "90作品_正方形", "0", "0", "0", "0"],
      ["2026-10-25", "111", "90作品_正方形", "3364", "453.885815", "12", "102"],
      ["2026-10-25", "222", "変身_正方形", "5184", "546.001556", "17", "112"],
    ],
  };
  const ageSheet: AdExportTable = {
    name: "Age",
    rows: [
      ["Date", "Age", "Spend", "Impressions", "Link clicks"],
      ["2026-10-25", "25 - 34", "656.065546", "5889", "20"],
      ["2026-10-25", "35 - 44", "343.82", "2659", "9"],
    ],
  };
  const genderSheet: AdExportTable = {
    name: "Gender",
    rows: [
      ["Date", "Gender", "Spend", "Impressions", "Link clicks"],
      ["2026-10-25", "Male", "722.6", "6270", "21"],
    ],
  };

  it("広告ごとのシートを内訳なしの行に、0の日は捨てる", () => {
    const parsed = parseAdExport([adSheet]);

    expect(parsed.platform).toBe("x");
    expect(parsed.ads).toEqual([
      { platform: "x", adKey: "111", adName: "90作品_正方形" },
      { platform: "x", adKey: "222", adName: "変身_正方形" },
    ]);
    expect(parsed.rows).toEqual([
      {
        platform: "x",
        statDate: "2026-10-25",
        adKey: "111",
        adName: "90作品_正方形",
        breakdownType: "none",
        breakdownValue: "",
        spendJpy: 453.89,
        impressions: 3364,
        reach: null,
        linkClicks: 12,
        landingPageViews: null,
        videoViews: 102,
      },
      expect.objectContaining({ adKey: "222", spendJpy: 546 }),
    ]);
  });

  it("年齢・性別のシートは、書き出しの広告すべてをまとめた行にする", () => {
    const parsed = parseAdExport([adSheet, ageSheet, genderSheet]);
    const group = parsed.rows.filter((row) => row.breakdownType !== "none");

    expect(group.map((row) => [row.breakdownType, row.breakdownValue])).toEqual([
      ["age", "25-34"],
      ["age", "35-44"],
      ["gender", "male"],
    ]);
    expect(new Set(group.map((row) => row.adKey))).toEqual(new Set(["all:111,222"]));
    expect(group[0].adName).toBe("この書き出しの広告すべて（90作品_正方形・変身_正方形）");
    // 目印を選べるのは本当の広告だけ
    expect(parsed.ads.map((ad) => ad.adKey)).toEqual(["111", "222"]);
  });

  it("広告ごとのシートが無い X の書き出しは止める", () => {
    expect(() => parseAdExport([ageSheet])).toThrow(AdExportFormatError);
  });

  it("Meta でも X でもない表は止める", () => {
    expect(() => parseAdExport(csv("name,value\na,1"))).toThrow(
      "Meta（広告マネージャの日本語の書き出し）か X（広告の画面の書き出し）の形ではありません",
    );
  });
});
