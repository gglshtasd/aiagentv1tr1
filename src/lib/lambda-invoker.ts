import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

// Instantiates the AWS client using your existing Vercel environment keys
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

/**
 * Invokes our serverless AWS Lambda function to run heavy agent tasks for $0
 * @param action 'scrape_url' | 'analyze_file_structure'
 * @param payload Object containing tool arguments
 */
export async function executeAgentTool(action: string, payload: any) {
  try {
    const command = new InvokeCommand({
      FunctionName: "AgentTools_Python",
      Payload: JSON.stringify({ action, payload })
    });

    const response = await lambdaClient.send(command);
    const resultString = Buffer.from(response.Payload!).toString();
    return JSON.parse(resultString);
  } catch (error: any) {
    console.error("❌ Lambda execution failed:", error);
    return { status: "error", message: error.message };
  }
}
