import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = { outputFileTracingRoot: path.resolve(__dirname, '../..'), poweredByHeader: false };
export default config;
