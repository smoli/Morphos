import {
  MCP_JOURNAL_ENV,
  MCP_ROOT_ENV,
  createMcpServer,
  createMcpStdio,
} from '../src/core/mcp';

/**
 * Der stdio-MCP-Server, den Morphos für einen Agentenlauf startet (c0088).
 *
 * Ein eigener Prozess, gestartet von der Claude CLI nach der Beschreibung, die
 * Morphos ihr mit `--mcp-config` reicht (siehe core/mcp: agentMcpArgs). Er ist
 * nur die Hülle: Der App-Ordner und die Protokolldatei kommen aus der Umgebung,
 * die Nachrichten kommen zeilenweise über stdin, die Antworten gehen zeilenweise
 * über stdout — alles Weitere steht in core/mcp.
 *
 * Auf stdout darf deshalb NICHTS anderes landen; Meldungen gehen nach stderr.
 */

const root = process.env[MCP_ROOT_ENV] ?? '';
const journal = process.env[MCP_JOURNAL_ENV] ?? '';

if (!root) {
  process.stderr.write(`${MCP_ROOT_ENV} ist nicht gesetzt — ohne App-Ordner gibt es keine Grenze.\n`);
  process.exit(1);
}

const io = createMcpStdio(createMcpServer({ root, journal }));

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  for (const line of io.push(chunk)) process.stdout.write(`${line}\n`);
});

// Schließt die CLI ihre Seite, ist der Lauf vorbei.
process.stdin.on('end', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
