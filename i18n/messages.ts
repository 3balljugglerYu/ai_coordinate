import {cache} from "react";
import {enMessages} from "@/messages/en";
import {jaMessages} from "@/messages/ja";
import type {Locale} from "@/i18n/config";

type DeepReplaceStrings<T> = T extends string
  ? string
  : { [K in keyof T]: DeepReplaceStrings<T[K]> };

export type AppMessages = DeepReplaceStrings<typeof jaMessages>;

const allMessages = {
  en: enMessages,
  ja: jaMessages,
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
