// Opens a/main.ts and b/main.ts in `tsc --lsp`, requests diagnostics for each, then exits.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.dirname(new URL(import.meta.url).pathname);
const proc = spawn(process.execPath, [process.argv[2], '--lsp', '--stdio'], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let buffer = Buffer.alloc(0), nextId = 0;
proc.stdout.on('data', chunk => {
	buffer = Buffer.concat([buffer, chunk]);
	while (true) {
		const headerEnd = buffer.indexOf('\r\n\r\n');
		if (headerEnd < 0) return;
		const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, headerEnd).toString())[1]);
		if (buffer.length < headerEnd + 4 + length) return;
		const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString());
		buffer = buffer.subarray(headerEnd + 4 + length);
		if (message.method === undefined) pending.get(message.id)?.(message);
		else if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, result: message.method === 'workspace/configuration' ? message.params.items.map(() => ({})) : null });
	}
});
const send = message => {
	const text = JSON.stringify(message);
	proc.stdin.write(`Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
};
const request = (method, params) => new Promise((resolve, reject) => {
	const id = ++nextId;
	pending.set(id, m => m.error ? reject(new Error(m.error.message)) : resolve(m.result));
	send({ jsonrpc: '2.0', id, method, params });
});

await request('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, capabilities: {}, initializationOptions: { runExternalCode: true } });
send({ jsonrpc: '2.0', method: 'initialized', params: {} });
for (const project of ['a', 'b']) {
	const file = path.join(root, project, 'main.ts');
	const uri = pathToFileURL(file).href;
	send({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'typescript', version: 1, text: fs.readFileSync(file, 'utf8') } } });
	const report = await request('textDocument/diagnostic', { textDocument: { uri } });
	console.log(`  ${project}/main.ts diagnostics: ${report.items.length}`);
}
proc.kill();
