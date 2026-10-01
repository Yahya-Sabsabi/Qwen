import { z } from 'zod';

/**
 * Shared DTOs & validation schemas used by BOTH apps/web and apps/api.
 * Single source of truth for wire formats (principle: server-side validation
 * with the same contracts the client uses).
 */

// ---------- primitives ----------

export const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be an identifier');

export const expressionString = z.string().min(1).max(10_000);

// ---------- experiment document ----------

export const ParameterSchema = z.object({
  name: identifier,
  value: z.number(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(0.1),
});
export type Parameter = z.infer<typeof ParameterSchema>;

export const EquationSchema = z.object({
  id: z.string().min(1).max(64),
  /** left-hand side, e.g. "a*x^2 + b*x + c" or full "y = ..." without lhs */
  expr: expressionString,
  /** variable the expression depends on ("x","t","theta",…) */
  variable: identifier.default('x'),
  label: z.string().max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  kind: z.enum(['cartesian', 'polar', 'parametric', 'implicit', 'derivative']).default('cartesian'),
  visible: z.boolean().default(true),
  /** second expression for parametric / implicit forms */
  expr2: expressionString.optional(),
});
export type Equation = z.infer<typeof EquationSchema>;

export const GraphViewSchema = z.object({
  xmin: z.number().default(-10),
  xmax: z.number().default(10),
  ymin: z.number().default(-6),
  ymax: z.number().default(6),
});
export type GraphView = z.infer<typeof GraphViewSchema>;

export const CalculationSchema = z.object({
  id: z.string().max(64),
  kind: z.enum(['derivative', 'integral', 'limit', 'roots', 'extrema', 'value', 'simplify']),
  expr: expressionString,
  variable: identifier.default('x'),
  /** extra numeric arguments (interval bounds, limit point, …) */
  args: z.array(z.number()).max(4).default([]),
});
export type Calculation = z.infer<typeof CalculationSchema>;

export const ExperimentDocSchema = z.object({
  version: z.literal(1).default(1),
  equations: z.array(EquationSchema).max(32).default([]),
  variables: z.array(identifier).max(16).default(['x']),
  parameters: z.array(ParameterSchema).max(16).default([]),
  view: GraphViewSchema.default({ xmin: -10, xmax: 10, ymin: -6, ymax: 6 }),
  calculations: z.array(CalculationSchema).max(32).default([]),
  observations: z.array(z.string().max(2000)).max(50).default([]),
  notes: z.string().max(20_000).default(''),
  conclusion: z.string().max(20_000).default(''),
});
export type ExperimentDoc = z.infer<typeof ExperimentDocSchema>;

export function docByteSize(doc: unknown): number {
  return JSON.stringify(doc).length;
}

export const MAX_DOC_BYTES = 256 * 1024;

// ---------- auth ----------

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a digit');
export const nameSchema = z.string().trim().min(1).max(80);

export const RegisterSchema = z.object({ email: emailSchema, name: nameSchema, password: passwordSchema });
export const LoginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export const ResetSchema = z.object({ token: z.string().min(10).max(128), password: passwordSchema });

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['student', 'teacher', 'admin']),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// ---------- projects / experiments / datasets ----------

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  color: z.string(),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7aa2f7'),
});

export const ExperimentMetaSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  visibility: z.enum(['private', 'shared']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExperimentMeta = z.infer<typeof ExperimentMetaSchema>;

export const ExperimentFullSchema = ExperimentMetaSchema.extend({
  doc: ExperimentDocSchema,
  shareToken: z.string().nullable(),
});
export type ExperimentFull = z.infer<typeof ExperimentFullSchema>;

export const ExperimentCreateSchema = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''),
  doc: ExperimentDocSchema,
});

export const ExperimentUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['private', 'shared']).optional(),
  projectId: z.string().uuid().nullable().optional(),
  doc: ExperimentDocSchema.optional(),
});

export const DatasetColumnSchema = z.object({
  name: z.string().max(64),
  values: z.array(z.number()),
});
export const DatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(['manual', 'paste', 'csv']),
  columns: z.array(DatasetColumnSchema),
  issues: z.array(z.string()),
  createdAt: z.string(),
});
export type Dataset = z.infer<typeof DatasetSchema>;

export const DatasetCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.enum(['manual', 'paste', 'csv']),
  raw: z.string().max(2_000_000),
});

export const ShareCreateSchema = z.object({ allowParams: z.boolean().default(true) });

export const SharedPayloadSchema = z.object({
  title: z.string(),
  description: z.string(),
  doc: ExperimentDocSchema,
  ownerName: z.string(),
  createdAt: z.string(),
  allowParams: z.boolean(),
});
export type SharedPayload = z.infer<typeof SharedPayloadSchema>;

// ---------- learn ----------

export const ProgressSchema = z.object({
  state: z.enum(['started', 'completed']),
  score: z.number().min(0).max(100).optional(),
});

export const LessonSummarySchema = z.object({
  slug: z.string(),
  module: z.string(),
  title: z.string(),
  orderIndex: z.number(),
  durationMin: z.number(),
  level: z.enum(['intro', 'intermediate', 'advanced']),
});
export type LessonSummary = z.infer<typeof LessonSummarySchema>;

// ---------- tutor ----------

export const TutorContextSchema = z.object({
  expression: expressionString.optional(),
  result: z.string().max(2000).optional(),
  topic: z.string().max(120).optional(),
  lab: z.string().max(60).optional(),
});
export const TutorRequestSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  mode: z.enum(['explain', 'hint', 'steps', 'practice']).default('explain'),
  context: TutorContextSchema.optional(),
});
export type TutorRequest = z.infer<typeof TutorRequestSchema>;

export const TutorResponseSchema = z.object({
  answer: z.string(),
  source: z.enum(['ai', 'engine']),
  verified: z.array(z.object({ claim: z.string(), detail: z.string().optional() })).default([]),
});
export type TutorResponse = z.infer<typeof TutorResponseSchema>;

// ---------- api error envelope ----------

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, msg = 'Invalid request payload'): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.errors[0];
    const where = first && first.path.length ? ` (${first.path.join('.')})` : '';
    throw new Error(`${msg}${where}: ${first ? first.message : 'unknown'}`);
  }
  return r.data;
}
