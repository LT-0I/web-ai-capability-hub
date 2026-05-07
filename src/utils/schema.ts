export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  default?: unknown;
}

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

export interface RuntimeSchema<T> {
  parse(input: unknown): T;
  safeParse(input: unknown): ParseResult<T>;
  toJsonSchema(): JsonSchema;
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function validate(input: unknown, schema: JsonSchema, path = "$", errors: string[] = []): string[] {
  if (schema.enum && !schema.enum.includes(input)) {
    errors.push(`${path} must be one of ${schema.enum.map(String).join(", ")}`);
    return errors;
  }
  if (schema.type) {
    const actual = typeOf(input);
    if (schema.type === "array") {
      if (!Array.isArray(input)) errors.push(`${path} must be an array`);
    } else if (schema.type === "integer") {
      if (typeof input !== "number" || !Number.isInteger(input)) errors.push(`${path} must be an integer`);
    } else if (schema.type !== actual) {
      errors.push(`${path} must be ${schema.type}, got ${actual}`);
    }
  }
  if (schema.type === "object" && input && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    for (const key of schema.required || []) {
      if (!(key in obj)) errors.push(`${path}.${key} is required`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (key in obj && obj[key] !== undefined) validate(obj[key], child, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!schema.properties || !(key in schema.properties)) errors.push(`${path}.${key} is not allowed`);
      }
    }
  }
  if (schema.type === "array" && Array.isArray(input) && schema.items) {
    input.forEach((item, index) => validate(item, schema.items!, `${path}[${index}]`, errors));
  }
  return errors;
}

export function makeSchema<T>(jsonSchema: JsonSchema): RuntimeSchema<T> {
  return {
    parse(input: unknown): T {
      const errors = validate(input, jsonSchema);
      if (errors.length) throw new Error(errors.join("; "));
      return input as T;
    },
    safeParse(input: unknown): ParseResult<T> {
      try {
        return { success: true, data: this.parse(input) };
      } catch (error) {
        return { success: false, error: error as Error };
      }
    },
    toJsonSchema(): JsonSchema {
      return jsonSchema;
    }
  };
}

export function objectSchema<T>(properties: Record<string, JsonSchema>, required: string[] = [], description?: string): RuntimeSchema<T> {
  return makeSchema<T>({ type: "object", description, properties, required, additionalProperties: true });
}

export const scalar = {
  string: (description?: string): JsonSchema => ({ type: "string", description }),
  number: (description?: string): JsonSchema => ({ type: "number", description }),
  boolean: (description?: string): JsonSchema => ({ type: "boolean", description }),
  object: (description?: string): JsonSchema => ({ type: "object", description, additionalProperties: true }),
  array: (items: JsonSchema, description?: string): JsonSchema => ({ type: "array", items, description }),
  enum: (values: unknown[], description?: string): JsonSchema => ({ enum: values, description })
};
