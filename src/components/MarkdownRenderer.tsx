import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { Check, Copy, Download } from 'lucide-react';

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent prose-p:leading-relaxed"
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : 'text';
          const codeString = String(children).replace(/\n$/, '');

          if (!inline && match) {
            return <CodeBlock language={language} code={codeString} />;
          }
          return (
            <code className="bg-gray-700/50 text-orange-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
              {children}
            </code>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// Sub-component for the interactive Code Box
function CodeBlock({ language, code }: { language: string, code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snippet.${language === 'text' ? 'txt' : language}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-gray-700 bg-[#1E1E1E] shadow-xl">
      {/* Code Header Bar */}
      <div className="flex justify-between items-center px-4 py-2 bg-gray-800/80 border-b border-gray-700 text-gray-400 text-xs font-sans">
        <span className="uppercase tracking-wider font-bold">{language}</span>
        <div className="flex gap-3">
          <button onClick={handleCopy} className="flex items-center gap-1 hover:text-white transition-colors">
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={handleDownload} className="flex items-center gap-1 hover:text-white transition-colors">
            <Download size={14} /> Download
          </button>
        </div>
      </div>
      {/* Code Content */}
      <div className="p-4 overflow-x-auto text-sm">
        <SyntaxHighlighter style={vscDarkPlus as any} language={language} PreTag="div" customStyle={{ margin: 0, padding: 0, background: 'transparent' }}>
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
