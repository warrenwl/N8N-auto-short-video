import {request} from 'node:http';

const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) {
  console.error('Usage: npm run render -- <manifest_path> <output_path>');
  process.exit(1);
}

const body = JSON.stringify({
  manifest_path: manifestPath,
  output_path: outputPath,
});

const req = request(
  {
    hostname: '127.0.0.1',
    port: Number(process.env.REMOTION_RENDERER_PORT || 3001),
    path: '/render',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
  },
  (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      console.log(text);
      process.exit(res.statusCode && res.statusCode >= 400 ? 1 : 0);
    });
  },
);

req.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
req.write(body);
req.end();
