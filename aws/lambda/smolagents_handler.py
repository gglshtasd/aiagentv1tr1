import os
import json
import traceback
import sys
from io import StringIO
from smolagents import CodeAgent, LiteLLMModel

def lambda_handler(event, context):
    """
    AWS Lambda Entrypoint for Tier 5 Action Guild (Task Mode)
    """
    old_stdout = sys.stdout
    try:
        body = json.loads(event.get('body', '{}'))
        prompt = body.get('prompt', '')
        injected_context = body.get('context', '')
        
        # Correctly formatted model ID matching your Azure LiteLLM / AWS Mantle config
        model = LiteLLMModel(
            model_id="zai.glm-4.7-flash", 
            api_base=os.environ.get("LITELLM_PROXY_URL"),
            api_key=os.environ.get("LITELLM_API_KEY")
        )
        
        # Initialize the Python Sandboxed Agent
        agent = CodeAgent(tools=[], model=model, add_base_tools=True)
        
        # Capture stdout so we can stream the "techno-feel" logs back to the Vercel Telemetry Panel
        sys.stdout = mystdout = StringIO()
        
        system_prompt = f"Context: {injected_context}\nTask: {prompt}"
        
        # Execute the generated code
        final_answer = agent.run(system_prompt)
        
        # Restore stdout immediately after execution
        sys.stdout = old_stdout
        execution_logs = mystdout.getvalue()
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'answer': str(final_answer),
                'telemetry': execution_logs
            })
        }
        
    except Exception as e:
        sys.stdout = old_stdout
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            })
        }
