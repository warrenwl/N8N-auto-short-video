import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {createReadStream, existsSync, readFileSync, statSync} from 'node:fs';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {RemotionManifest} from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const entryPoint = path.join(projectRoot, 'src/index.ts');
const port = Number(process.env.REMOTION_RENDERER_PORT || 3001);
const dataRoot = path.resolve(process.env.DATA_DIR || path.join(projectRoot, '..', 'data'));
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`;
const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || (
  existsSync(defaultChromePath) ? defaultChromePath : undefined
);

let bundledServeUrl: Promise<string> | null = null;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
};

const contentTypeForPath = (filePath: string): string => {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.wav')
    ? 'audio/wav'
    : lower.endsWith('.mp4')
      ? 'video/mp4'
      : lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : 'application/octet-stream';
};

const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const resolveDataPath = (input: string): string => {
  if (input.startsWith('/data/')) {
    return path.join(dataRoot, input.slice('/data/'.length));
  }
  return input;
};

const assetUrl = (input: string | null | undefined): string | null => {
  if (!input) {
    return null;
  }
  return `${publicBaseUrl}/asset?path=${encodeURIComponent(input)}`;
};

const getBundle = () => {
  bundledServeUrl ??= bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });
  return bundledServeUrl;
};

const handleAsset = (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', publicBaseUrl);
  const rawPath = url.searchParams.get('path');
  if (!rawPath) {
    return json(res, 400, {status: 'error', error: 'Missing path'});
  }
  const resolved = resolveDataPath(rawPath);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    return json(res, 404, {status: 'error', error: `Asset not found: ${rawPath}`});
  }
  const contentType = contentTypeForPath(resolved);
  const size = statSync(resolved).size;
  const range = req.headers.range;
  const baseHeaders = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
  };

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, {...baseHeaders, 'content-range': `bytes */${size}`});
      return res.end();
    }
    const requestedStart = match[1] ? Number(match[1]) : 0;
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    const start = Math.max(0, Math.min(requestedStart, size - 1));
    const end = Math.max(start, Math.min(requestedEnd, size - 1));
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      ...baseHeaders,
      'content-length': chunkSize,
      'content-range': `bytes ${start}-${end}/${size}`,
    });
    if (req.method === 'HEAD') {
      return res.end();
    }
    return createReadStream(resolved, {start, end}).pipe(res);
  }

  res.writeHead(200, {...baseHeaders, 'content-length': size});
  if (req.method === 'HEAD') {
    return res.end();
  }
  createReadStream(resolved).pipe(res);
};

const render = async (body: Record<string, unknown>) => {
  const manifestPath = String(body.manifest_path || '');
  const outputPath = String(body.output_path || '');
  if (!manifestPath || !outputPath) {
    throw new Error('manifest_path and output_path are required');
  }

  const resolvedManifestPath = resolveDataPath(manifestPath);
  const resolvedOutputPath = resolveDataPath(outputPath);
  const manifest = JSON.parse(readFileSync(resolvedManifestPath, 'utf8')) as RemotionManifest;
  const inputProps: RemotionManifest = {
    ...manifest,
    cover_url: assetUrl(manifest.cover_path),
    voice_url: assetUrl(manifest.voice_path),
    account: manifest.account
      ? {
          ...manifest.account,
          account_logo_url: assetUrl(manifest.account.account_logo_path),
        }
      : undefined,
  };

  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: 'DynamicShortVideo',
    inputProps,
    browserExecutable,
    timeoutInMilliseconds: 120000,
    chromiumOptions: {
      headless: true,
    },
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: resolvedOutputPath,
    inputProps,
    browserExecutable,
    timeoutInMilliseconds: 120000,
    concurrency: 1,
    chromiumOptions: {
      headless: true,
    },
  });

  return {
    status: 'ok',
    video_path: outputPath,
    resolved_video_path: resolvedOutputPath,
    duration: composition.durationInFrames / composition.fps,
    render_engine: 'Remotion',
  };
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', publicBaseUrl);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        status: 'ok',
        service: 'remotion-renderer',
        port,
        data_root: dataRoot,
        browser_executable: browserExecutable || null,
      });
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/asset') {
      return handleAsset(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/render') {
      const body = await readJsonBody(req);
      const result = await render(body);
      return json(res, 200, result);
    }
    return json(res, 404, {status: 'error', error: 'Not found'});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);
    return json(res, 500, {status: 'error', error: message});
  }
});

server.listen(port, () => {
  console.log(`remotion-renderer listening on ${publicBaseUrl}, dataRoot=${dataRoot}`);
});
