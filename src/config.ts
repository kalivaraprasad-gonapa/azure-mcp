export function parseEnvInt(value: string | undefined, defaultValue: number): number {
    const parsed = parseInt(value || '', 10);
    return isNaN(parsed) ? defaultValue : parsed;
}