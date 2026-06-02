import {cache} from "react";
import {enMessages} from "@/messages/en";
import {jaMessages} from "@/messages/ja";
import {koMessages} from "@/messages/ko";
import {zhCnMessages} from "@/messages/zh-CN";
import {zhTwMessages} from "@/messages/zh-TW";
import {esMessages} from "@/messages/es";
import {ptMessages} from "@/messages/pt";
import {frMessages} from "@/messages/fr";
import {deMessages} from "@/messages/de";
import {itMessages} from "@/messages/it";
import {idMessages} from "@/messages/id";
import {thMessages} from "@/messages/th";
import {viMessages} from "@/messages/vi";
import {hiMessages} from "@/messages/hi";
import {arMessages} from "@/messages/ar";
import type {Locale} from "@/i18n/config";
import type {DeepReplaceStrings} from "@/messages/types";

export type AppMessages = DeepReplaceStrings<typeof jaMessages>;

const allMessages = {
  ja: jaMessages,
  en: enMessages,
  ko: koMessages,
  "zh-CN": zhCnMessages,
  "zh-TW": zhTwMessages,
  es: esMessages,
  pt: ptMessages,
  fr: frMessages,
  de: deMessages,
  it: itMessages,
  id: idMessages,
  th: thMessages,
  vi: viMessages,
  hi: hiMessages,
  ar: arMessages,
} as const satisfies Record<Locale, AppMessages>;
export type ClientMessageNamespace = keyof AppMessages;

const clientNamespaces = [
  "accountManagement",
  "avatarUpload",
  "auth",
  "challenge",
  "common",
  "coordinate",
  "contact",
  "credits",
  "subscription",
  "moderation",
  "nav",
  "footer",
  "follow",
  "i2iPoc",
  "myPage",
  "notifications",
  "profileEdit",
  "referral",
  "searchBar",
  "style",
  "posts",
  "popupBanners",
  "tutorial",
  "home",
  "inspireSubmission",
  "inspirePage",
  "adminStyleTemplates",
  "imageSourcePicker",
  // Creator Looks 詳細ページの Client Component (CreatorLooksDetailClient) が
  // useTranslations("creatorLooksDetail") を使うため client bundle に含める
  "creatorLooksDetail",
] as const satisfies readonly ClientMessageNamespace[];

type NamespaceSelection<TMessages, TNamespaces extends readonly (keyof TMessages)[]> = {
  [TKey in TNamespaces[number]]: TMessages[TKey];
};

function pickNamespaces<
  TMessages extends Record<string, unknown>,
  TNamespaces extends readonly (keyof TMessages)[],
>(messages: TMessages, namespaces: TNamespaces): NamespaceSelection<TMessages, TNamespaces> {
  return namespaces.reduce((accumulator, namespace) => {
    accumulator[namespace] = messages[namespace];
    return accumulator;
  }, {} as NamespaceSelection<TMessages, TNamespaces>);
}

export const getAllMessages = cache(async (locale: Locale) => allMessages[locale]);

export const getClientMessages = cache(async (locale: Locale) =>
  pickNamespaces(allMessages[locale], clientNamespaces)
);
