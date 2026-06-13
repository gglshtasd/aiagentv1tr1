import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4 font-sans">
      <h1 className="text-5xl font-extrabold mb-4 tracking-tight">AI Gateway Platform</h1>
      <p className="text-xl text-gray-400 mb-8 max-w-2xl text-center">
        Secure, cost-optimized AI request routing & pooling system.
      </p>
      
      <div className="flex gap-4">
        <Link 
          href="/login" 
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
        >
          System Login
        </Link>
        <Link 
          href="/chat" 
          className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
        >
          Enter Chat
        </Link>
      </div>
    </div>
  );
}
