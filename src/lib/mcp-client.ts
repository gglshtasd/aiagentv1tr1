/**
 * Model Context Protocol (MCP) Middleware
 * Acts as a secure bridge between Vercel Edge and local user file systems.
 */

export interface MCPToolRequest {
  toolName: string;
  parameters: Record<string, any>;
  signature: string;
}

export async function executeMCPTool(targetEndpoint: string, request: MCPToolRequest, userToken: string) {
  try {
    // Sends the execution request to the user's local MCP server (e.g., running via Claude Desktop or a local Node process)
    const mcpResponse = await fetch(`${targetEndpoint}/mcp/v1/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
        'X-MCP-Version': '1.0.0'
      },
      body: JSON.stringify(request),
    });

    if (!mcpResponse.ok) {
      throw new Error(`MCP Negotiation Failed: ${mcpResponse.statusText}`);
    }

    return await mcpResponse.json();
  } catch (error: any) {
    console.error("[MCP BRIDGE FATAL]", error.message);
    return { success: false, error: error.message };
  }
}
