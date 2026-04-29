import { z } from 'zod';
import 'dotenv/config';
declare const baseSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "production", "test"]>>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<["trace", "debug", "info", "warn", "error", "fatal"]>>;
    SOLANA_CLUSTER: z.ZodDefault<z.ZodEnum<["devnet", "mainnet"]>>;
    SOLANA_RPC_URL: z.ZodString;
    PROGRAM_ID: z.ZodString;
    DATABASE_URL: z.ZodString;
    REDIS_URL: z.ZodString;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "production" | "test";
    LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
    SOLANA_CLUSTER: "devnet" | "mainnet";
    SOLANA_RPC_URL: string;
    PROGRAM_ID: string;
    DATABASE_URL: string;
    REDIS_URL: string;
}, {
    SOLANA_RPC_URL: string;
    PROGRAM_ID: string;
    DATABASE_URL: string;
    REDIS_URL: string;
    NODE_ENV?: "development" | "production" | "test" | undefined;
    LOG_LEVEL?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | undefined;
    SOLANA_CLUSTER?: "devnet" | "mainnet" | undefined;
}>;
export type BaseEnv = z.infer<typeof baseSchema>;
/**
 * Load and validate environment variables.
 * Pass an extra ZodObject to extend the schema with service-specific fields.
 */
export declare function loadEnv<T extends z.ZodRawShape>(extra?: z.ZodObject<T>): BaseEnv & z.infer<z.ZodObject<T>>;
export {};
