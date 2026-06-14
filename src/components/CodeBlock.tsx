import React, { useState } from 'react';

interface CodeBlockProps {
  language: string;
  value: string;
}

export default function CodeBlock({ language, value }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    // Basic extension mapping
    const extMap: Record<string, string> = {
      javascript: 'js', typescript: 'ts', python: 'py', html: 'html', css: 'css', json: 'json',
      bash: 'sh', shell: 'sh', sql: 'sql', java: 'java', rust: 'rs', cpp: 'cpp', c: 'c'
    };
    const extension = extMap[language.toLowerCase()] || 'txt';
    const blob = new Blob([value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippet-${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative group rounded-lg bg-[#0d1117] border border-gray-800 my-4 overflow-hidden shadow-lg font-mono">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-800 text-xs text-gray-400">
        <span className="uppercase font-bold tracking-wider">{language || 'text'}</span>
        <div className="flex gap-3">
          <button onClick={handleDownload} className="hover:text-blue-400 transition-colors flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Download
          </button>
          <button onClick={handleCopy} className="hover:text-green-400 transition-colors flex items-center gap-1">
            {copied ? (
              <><svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> Copied</>
            ) : (
              <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg> Copy</>
            )}
          </button>
        </div>
      </div>
      <div className="p-4 overflow-x-auto text-sm text-gray-300">
        <pre><code>{value}</code></pre>
      </div>
    </div>
  );
}
