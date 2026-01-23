// src/contracts/json.ts
export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonObject | JsonArray;
export type JsonObject = { [k: string]: JsonValue };
export type JsonArray = JsonValue[];
