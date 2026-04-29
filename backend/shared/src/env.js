import { z } from 'zod';
import 'dotenv/config';
const baseSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    SOLANA_CLUSTER: z.enum(['devnet', 'mainnet']).default('devnet'),
    SOLANA_RPC_URL: z.string().url(),
    PROGRAM_ID: z.string().min(32).max(44),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
});
/**
 * Load and validate environment variables.
 * Pass an extra ZodObject to extend the schema with service-specific fields.
 */
export function loadEnv(extra) {
    const schema = extra ? baseSchema.merge(extra) : baseSchema;
    const result = schema.safeParse(process.env);
    if (!result.success) {
        // eslint-disable-next-line no-console
        console.error('❌ Invalid environment variables:');
        for (const issue of result.error.issues) {
            // eslint-disable-next-line no-console
            console.error(`  ${issue.path.join('.')}: ${issue.message}`);
        }
        process.exit(1);
    }
    return result.data;
}
//# sourceMappingURL=env.js.map