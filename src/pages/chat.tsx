const handleTestGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResponse('Routing request through gateway to AWS Bedrock...');

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();

      // Step 1: You could call /api/classify here first to check limits
      // But for this test, we are hitting the execution engine directly
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
          prompt, 
          modelId: 'anthropic.claude-3-sonnet-20240229-v1:0' 
        })
      });

      const data = await res.json();
      
      if (data.success) {
        // Display the actual AI text response in the terminal!
        setResponse(`[Bedrock Response]\n\n${data.text}\n\n[Token Usage: Input ${data.usage.input_tokens} | Output ${data.usage.output_tokens}]`);
      } else {
        setResponse(`Execution Error: ${data.error}`);
      }
      
    } catch (error: any) {
      setResponse(`System Error: ${error.message}`);
    }
    
    setLoading(false);
  };
