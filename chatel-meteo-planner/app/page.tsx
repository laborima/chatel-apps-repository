"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("./components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-zinc-900 dark:to-zinc-800 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4" />
        <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Chargement...
        </p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <Dashboard />;
}
