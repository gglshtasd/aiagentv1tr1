// 1. This forces Vercel to bypass the Edge Cache and run the code fresh on every request
export const dynamic = 'force-dynamic'; 

export default function LoginPage() {
  // 2. This log will now reliably show up in your Vercel Function Logs
  console.log(">>> [SERVER LOG] Rendering Login Page at:", new Date().toISOString());

  try {
    // Your component logic here
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <div className="p-8 bg-gray-800 rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-blue-400">Login Active</h1>
          <p className="text-gray-400 mt-2">If you see this styled, Tailwind is working!</p>
        </div>
      </div>
    );
  } catch (error) {
    console.error(">>> [SERVER ERROR] Error rendering login page:", error);
    return <div>An error occurred loading the login page.</div>;
  }
}
