import raw from "../../data/ediscovery-properties.json" with { type: "json" };
import type { Catalog, Property, PropertyOperator, Experience } from "./types.js";

const catalog = raw as unknown as Catalog;

const propertiesByName = new Map<string, Property>();
for (const prop of catalog.properties) {
  propertiesByName.set(prop.name.toLowerCase(), prop);
  for (const alias of prop.aliases ?? []) {
    propertiesByName.set(alias.toLowerCase(), prop);
  }
}

export function getCatalog(): Catalog {
  return catalog;
}

export function findProperty(name: string): Property | undefined {
  return propertiesByName.get(name.toLowerCase());
}

export function knownPropertyNames(experience?: Experience): string[] {
  const names = new Set<string>();
  for (const p of catalog.properties) {
    if (!experience || p.appliesTo.includes(experience)) {
      names.add(p.name);
    }
  }
  return [...names].sort();
}

export function operatorAllowedForProperty(
  property: Property,
  op: PropertyOperator
): boolean {
  if (!property.operators.includes(op)) return false;
  const spec = catalog.propertyOperators.find((s) => s.op === op);
  return spec ? spec.supportedTypes.includes(property.type) : true;
}

export function allowedValuesForProperty(property: Property): string[] | undefined {
  if (property.values) return property.values;
  if (property.valuesRef === "kindValues") return catalog.kindValues;
  return undefined;
}

export function isDateIntervalKeyword(raw: string): boolean {
  const normalized = raw.replace(/^"|"$/g, "").toLowerCase();
  return catalog.dateIntervals.some((i) => i.keyword === normalized);
}
