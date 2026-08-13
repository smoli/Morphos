/**
 * Wie die Werkzeuge von Morphos heißen — die gemeinsame Sprache von Server und
 * Oberfläche.
 *
 * Der Server selbst (core/mcp) arbeitet auf der Platte und gehört damit in den
 * Hauptprozess. Seine Namen braucht aber auch der Renderer: Er liest an den
 * Werkzeugaufrufen ab, was der Agent gerade an der App tut (core/agent). Sie
 * stehen darum für sich — ohne jede Abhängigkeit vom Dateisystem.
 */

/** Unter diesem Namen kennt die CLI den Server; ihre Werkzeuge heißen `mcp__morphos__…`. */
export const MCP_SERVER_NAME = 'morphos';

export type McpToolName = 'write' | 'edit' | 'delete' | 'ask';

/** Der Name, unter dem die CLI ein Werkzeug dieses Servers führt. */
export function mcpToolId(name: McpToolName): string {
  return `mcp__${MCP_SERVER_NAME}__${name}`;
}
