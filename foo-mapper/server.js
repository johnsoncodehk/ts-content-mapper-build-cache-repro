// Minimal content mapper: `.foo` files are TypeScript, mapped verbatim. Logs every transform to $FOO_TRANSFORM_LOG.
const fs = require('node:fs');
const path = require('node:path');
let input = Buffer.alloc(0);
process.stdin.on('data', chunk => {
	input = Buffer.concat([input, chunk]);
	while (true) {
		const headerEnd = input.indexOf('\r\n\r\n');
		if (headerEnd < 0) return;
		const length = Number(/Content-Length:\s*(\d+)/i.exec(input.subarray(0, headerEnd).toString())[1]);
		if (input.length < headerEnd + 4 + length) return;
		const message = JSON.parse(input.subarray(headerEnd + 4, headerEnd + 4 + length).toString());
		input = input.subarray(headerEnd + 4 + length);
		if (message.id !== undefined) reply(message.id, handle(message.method, message.params));
	}
});
function handle(method, params) {
	switch (method) {
		case 'initialize': return { positionEncoding: 'utf-16', diagnosticSource: 'foo' };
		case 'openProject':
			log(`openProject ${path.basename(path.dirname(params.configFileName)) + "/tsconfig.json"} handle=${params.projectHandle}`);
			return {};
		case 'closeProject': return null;
		case 'transform':
			log(`transform ${path.basename(params.fileName)} handle=${params.projectHandle}`);
			return { text: params.content, extension: '.ts', mappings: [[0, params.content.length, 0, params.content.length, 0]] };
	}
}
function log(line) {
	fs.appendFileSync(process.env.FOO_TRANSFORM_LOG, `${line} pid=${process.pid}\n`);
}
function reply(id, result) {
	const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, result }));
	process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
	process.stdout.write(body);
}
