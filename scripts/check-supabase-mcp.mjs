import { Client } from 'file:///Users/hidechika/.npm/_npx/53c4795544aaa350/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///Users/hidechika/.npm/_npx/53c4795544aaa350/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

// Minimal script to ensure the Supabase MCP server can initialize over stdio.
const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y',
    '@supabase/mcp-server-supabase@latest',
    '--access-token',
    'sbp_7ec6d3cf62b973770605f59b07b36489148cb95c',
    '--project-ref',
    'hnrccaxrvhtbuihfvitc',
  ],
});

const client = new Client(
  { name: 'local-check', version: '0.0.1' },
  { capabilities: {} },
);

async function main() {
  await client.connect(transport);
  console.log('Connected:', client.getServerVersion());

  const capabilities = client.getServerCapabilities();
  console.log('Capabilities:', JSON.stringify(capabilities, null, 2));

  if (capabilities?.tools) {
    const tools = await client.listTools();
    console.log('Tools:', JSON.stringify(tools, null, 2));
  }

  await client.close();
}

main().catch((error) => {
  console.error('Failed to connect to Supabase MCP server:', error);
  process.exit(1);
});
