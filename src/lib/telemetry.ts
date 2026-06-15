export async function generateTelemetryPayload() {
  let gpu_model = 'Unknown or Masked';
  let canvas_hash = 'Unknown';
  let cpu_cores =  0;
  let ram_gb =  0;
  // Add this safety check:
  if (typeof window !== 'undefined') {
    cpu_cores = navigator.hardwareConcurrency || 0;
    ram_gb = (navigator as any).deviceMemory || 0;

  // 1. WebGL Hardware Extraction
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpu_model = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch (e) {}

  // 2. Canvas Fingerprint Generation
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("GatewayHash_v1", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("GatewayHash_v1", 4, 17);
      
      const dataUrl = canvas.toDataURL();
      
      // Hash the output to a clean string
      const msgBuffer = new TextEncoder().encode(dataUrl);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      // Truncate to a clean 16-character tracking ID
      canvas_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16); 
    }
  } catch (e) {}
}
  return { gpu_model, canvas_hash, cpu_cores, ram_gb };
}
