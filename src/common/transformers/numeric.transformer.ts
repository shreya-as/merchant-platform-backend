import { ValueTransformer } from 'typeorm';

// Postgres returns NUMERIC as a string to avoid precision loss; convert back to number for the API.
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
