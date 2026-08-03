// lib/validator.js — zero-dep JSON schema subset validator (TODO 19)
// Supported: type, required, properties, items, enum, pattern, minLength, maxLength,
// min/max, minItems/maxItems, additionalProperties, oneOf-lite (via anyOf of types)

const TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  if (typeof v === 'number' && !Number.isInteger(v)) return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'object') return 'object';
  return typeof v;
}

export function validate(schema, value, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.anyOf) {
    const ok = schema.anyOf.some(s => validate(s, value, path).length === 0);
    if (!ok) errors.push(`${path}: does not match anyOf`);
    return errors;
  }
  if (schema.oneOf) {
    const passed = schema.oneOf.filter(s => validate(s, value, path).length === 0).length;
    if (passed !== 1) errors.push(`${path}: must match exactly one oneOf (got ${passed})`);
    return errors;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const matches = types.some(t => TYPES.includes(t) && (t === actual || (t === 'number' && actual === 'integer')));
    if (!matches) {
      errors.push(`${path}: expected ${types.join('|')}, got ${actual}`);
      return errors; // stop on hard type mismatch
    }
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }

  switch (typeOf(value)) {
    case 'string':
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength ${schema.minLength}`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: fails pattern /${schema.pattern}/`);
      break;
    case 'number':
    case 'integer':
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: less than minimum ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: greater than maximum ${schema.maximum}`);
      break;
    case 'array':
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than minItems ${schema.minItems}`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: more than maxItems ${schema.maxItems}`);
      if (schema.items) {
        value.forEach((item, i) => {
          if (Array.isArray(schema.items)) {
            if (schema.items[i]) errors.push(...validate(schema.items[i], item, `${path}[${i}]`));
          } else {
            errors.push(...validate(schema.items, item, `${path}[${i}]`));
          }
        });
      }
      break;
    case 'object':
      if (schema.required) {
        for (const r of schema.required) {
          if (!(r in value)) errors.push(`${path}: missing required property "${r}"`);
        }
      }
      if (schema.properties) {
        for (const [key, sub] of Object.entries(schema.properties)) {
          if (key in value) errors.push(...validate(sub, value[key], `${path}.${key}`));
        }
      }
      if (schema.additionalProperties === false && schema.properties) {
        for (const key of Object.keys(value)) {
          if (!schema.properties[key]) errors.push(`${path}: unexpected property "${key}"`);
        }
      }
      break;
    default:
      break;
  }
  return errors;
}

export function assertValid(schema, value) {
  return validate(schema, value);
}

export default { validate };
