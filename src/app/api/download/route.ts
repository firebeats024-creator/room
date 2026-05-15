import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// GET /api/download — Download project source code as ZIP
export async function GET() {
  try {
    const projectRoot = join(process.cwd(), '..') === '/' ? process.cwd() : process.cwd();
    const outputPath = join(projectRoot, 'upload', 'pg-hostel-manager-source.zip');

    // Create the zip using system zip command (fast)
    execSync(
      `cd "${projectRoot}" && zip -r "${outputPath}" ` +
      `src/ prisma/ db/ public/ ` +
      `package.json tsconfig.json tailwind.config.ts postcss.config.mjs ` +
      `next.config.ts components.json eslint.config.mjs ` +
      `ipv4-proxy.mjs daemon.js serve.sh bun.lock ` +
      `-x "node_modules/*" ".next/*" "upload/*"`,
      { stdio: 'pipe' }
    );

    const buf = readFileSync(outputPath);

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="pg-hostel-manager-source.zip"',
      },
    });
  } catch (error) {
    console.error('Error creating source zip:', error);
    return NextResponse.json(
      { error: 'Failed to create source code download' },
      { status: 500 }
    );
  }
}
