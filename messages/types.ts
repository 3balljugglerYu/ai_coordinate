export type DeepReplaceStrings<T> = T extends string
  ? string
  : { [K in keyof T]: DeepReplaceStrings<T[K]> };
