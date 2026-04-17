export type PropertyType =
  | "text"
  | "recipient"
  | "date"
  | "number"
  | "boolean"
  | "enum"
  | "url";

export type PropertyCategory = "mail" | "document" | "common" | "contact";

export type PropertyOperator = ":" | "=" | "<>" | "<" | ">" | "<=" | ">=" | "..";

export type Experience = "classic" | "new" | "premium" | "reference";

export interface Property {
  name: string;
  category: PropertyCategory;
  type: PropertyType;
  operators: PropertyOperator[];
  description: string;
  examples: string[];
  values?: string[];
  valuesRef?: "kindValues";
  recipientExpansion?: boolean;
  appliesTo: Experience[];
  premium?: boolean;
  aliases?: string[];
  unit?: string;
}

export interface PropertyOperatorSpec {
  op: PropertyOperator;
  name: string;
  query: string;
  supportedTypes: PropertyType[];
  description: string;
}

export interface BooleanOperatorSpec {
  name: "AND" | "OR" | "NOT" | "NEAR";
  symbol: string;
  alias?: string;
  description: string;
  uppercase: boolean;
  freeTextOnly?: boolean;
}

export interface WildcardRules {
  prefix: { symbol: string; description: string; supported: boolean };
  suffix: { symbol: string; description: string; supported: boolean };
  infix: { symbol: string; description: string; supported: boolean };
  substring: { symbol: string; description: string; supported: boolean };
  notes: string[];
}

export interface DateFormat {
  pattern: string;
  example: string;
  note?: string;
}

export interface DateInterval {
  keyword: string;
  description: string;
  quote?: boolean;
}

export interface SpecialCharacters {
  reserved: string[];
  description: string;
  notes: string[];
}

export interface RecipientExpansion {
  enabled: boolean;
  description: string;
  disableTechnique: string;
  caveat: string;
}

export interface CatalogLimits {
  maxQueryCharsSharePointOneDrive: number;
  maxQueryCharsSharePointDefaultFrontEnd: number;
  maxPropertyRestrictionChars: number;
  notes: string[];
}

export interface Catalog {
  meta: { purpose: string; sources: unknown[]; notes: string[] };
  booleanOperators: BooleanOperatorSpec[];
  propertyOperators: PropertyOperatorSpec[];
  wildcards: WildcardRules;
  dateFormats: DateFormat[];
  dateIntervals: DateInterval[];
  kindValues: string[];
  specialCharacters: SpecialCharacters;
  recipientExpansion: RecipientExpansion;
  properties: Property[];
  limits: CatalogLimits;
  searchTips: string[];
}
